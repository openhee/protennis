-- Applied remote migration 20261114054646. Live booking API.
create table public.pass_coaches (
 branch_id uuid not null, pass_id uuid primary key, coach_id uuid not null,
 foreign key(branch_id,pass_id) references public.passes(branch_id,id),
 foreign key(branch_id,coach_id) references public.coaches(branch_id,member_id)
);
alter table public.pass_coaches enable row level security;
revoke all on public.pass_coaches from public,anon,authenticated;
grant select on public.pass_coaches to authenticated;
create policy assignment_read on public.pass_coaches for select to authenticated using(private.owns_pass(branch_id,pass_id) or private.owns_member(branch_id,coach_id));
create index pass_coaches_coach on public.pass_coaches(branch_id,coach_id);

create function private.booking_action(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a record; e public.schedule_entries; p public.passes; k public.bookings; product public.products;
 result_id uuid; available integer; request uuid; start_at timestamptz; end_at timestamptz;
begin
 select * into a from private.actor();
 if auth.uid() is null or a.member_id is null or a.role not in ('student','coach') then raise exception '로그인이 필요합니다.'; end if;
 if a.role='coach' and not exists(select 1 from public.coaches where member_id=a.member_id and active) then raise exception '코치 권한이 없습니다.'; end if;
 if action='open' or action='block' then
  if a.role<>'coach' then raise exception '코치만 시간을 등록할 수 있습니다.'; end if;
  start_at:=(payload->>'starts_at')::timestamptz; end_at:=(payload->>'ends_at')::timestamptz;
  if start_at is null or end_at is null or start_at<=now() or end_at<=start_at or end_at>start_at+interval '4 hours' then raise exception '미래의 유효한 시간을 선택하세요.'; end if;
  if action='open' then
   select * into product from public.products where id=(payload->>'product_id')::uuid and branch_id=a.branch_id and active;
   if product.id is null or product.capacity<>1 or end_at-start_at<>make_interval(mins=>product.duration_minutes) then raise exception '현재는 등록 상품의 1:1 수업 시간만 열 수 있습니다.'; end if;
  end if;
  insert into public.schedule_entries(branch_id,coach_id,starts_at,ends_at,entry_type,status,capacity,booking_mode,product_id)
  values(a.branch_id,a.member_id,start_at,end_at,case when action='open' then 'lesson' else 'blocked' end,case when action='open' then 'open' else 'closed' end,1,'open_booking',product.id) returning id into result_id;
 elsif action='reserve' then
  if a.role<>'student' then raise exception '레슨생만 예약할 수 있습니다.'; end if;
  request:=(payload->>'request_id')::uuid;
  if request is null then raise exception '요청 번호가 필요합니다.'; end if;
  -- Serialize all reservations by this student, including different passes.
  perform 1 from public.members where id=a.member_id for update;
  select * into k from public.bookings where request_id=request;
  if k.id is not null then
   if k.member_id<>a.member_id or k.schedule_entry_id<>(payload->>'entry_id')::uuid or k.pass_id<>(payload->>'pass_id')::uuid then raise exception '요청 번호가 일치하지 않습니다.'; end if;
   return jsonb_build_object('id',k.id);
  end if;
  select * into e from public.schedule_entries where id=(payload->>'entry_id')::uuid and branch_id=a.branch_id for update;
  select * into p from public.passes where id=(payload->>'pass_id')::uuid and member_id=a.member_id and branch_id=a.branch_id for update;
  if e.id is null or p.id is null or e.entry_type<>'lesson' or e.status<>'open' or e.booking_mode<>'open_booking' or e.starts_at<=now() then raise exception '예약 가능한 시간이 아닙니다.'; end if;
  if p.status<>'active' or p.product_id is distinct from e.product_id or not exists(select 1 from public.pass_coaches where pass_id=p.id and coach_id=e.coach_id) then raise exception '담당 코치와 수강권을 확인하세요.'; end if;
  if (e.starts_at at time zone 'Asia/Seoul')::date not between p.valid_from and p.valid_until or not(extract(isodow from e.starts_at at time zone 'Asia/Seoul')::integer=any(p.agreed_weekdays)) or e.ends_at-e.starts_at<>make_interval(mins=>p.agreed_duration_minutes) then raise exception '수강 기간·요일·수업 시간이 맞지 않습니다.'; end if;
  if (select count(*) from public.bookings where schedule_entry_id=e.id and status='confirmed')>=e.capacity then raise exception '다른 회원이 먼저 예약했습니다.'; end if;
  if exists(select 1 from public.bookings b join public.schedule_entries s on s.id=b.schedule_entry_id where b.member_id=a.member_id and b.status='confirmed' and s.status<>'cancelled' and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(e.starts_at,e.ends_at,'[)')) then raise exception '이미 같은 시간에 예약이 있습니다.'; end if;
  if p.agreed_sessions_per_week is not null and (select count(*) from public.bookings b join public.schedule_entries s on s.id=b.schedule_entry_id where b.pass_id=p.id and b.status='confirmed' and date_trunc('week',s.starts_at at time zone 'Asia/Seoul')=date_trunc('week',e.starts_at at time zone 'Asia/Seoul'))>=p.agreed_sessions_per_week then raise exception '주간 예약 횟수를 초과했습니다.'; end if;
  select coalesce(sum(delta_sessions),0) into available from public.pass_ledger where pass_id=p.id;
  available:=available-(select coalesce(sum(credit_hold),0) from public.bookings where pass_id=p.id and status='confirmed');
  if available<1 then raise exception '예약 가능한 잔여 횟수가 없습니다.'; end if;
  insert into public.bookings(branch_id,schedule_entry_id,member_id,pass_id,request_id,credit_hold) values(a.branch_id,e.id,a.member_id,p.id,request,1) returning id into result_id;
 else raise exception '지원하지 않는 작업입니다.';
 end if;
 insert into public.audit_events(branch_id,actor_id,operation_id,entity_type,entity_id,action) values(a.branch_id,a.member_id,gen_random_uuid(),case when action='reserve' then 'booking' else 'schedule' end,result_id,action);
 return jsonb_build_object('id',result_id);
end $$;
revoke all on function private.booking_action(text,jsonb) from public,anon,authenticated;
grant execute on function private.booking_action(text,jsonb) to authenticated;
create function public.booking_action(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.booking_action(action,payload) $$;
revoke all on function public.booking_action(text,jsonb) from public,anon;
grant execute on function public.booking_action(text,jsonb) to authenticated;

create function private.booking_dashboard(day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a record; result jsonb;
begin
 select * into a from private.actor();
 if auth.uid() is null or a.member_id is null or a.role not in ('coach','student') then raise exception '로그인이 필요합니다.'; end if;
 if a.role='coach' and not exists(select 1 from public.coaches where member_id=a.member_id and active) then raise exception '코치 권한이 없습니다.'; end if;
 select jsonb_build_object(
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'duration',duration_minutes)),'[]') from public.products where branch_id=a.branch_id and active and capacity=1),
 'passes',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',pr.name,'from',p.valid_from,'until',p.valid_until,'remaining',(select coalesce(sum(delta_sessions),0) from public.pass_ledger where pass_id=p.id),'held',(select coalesce(sum(credit_hold),0) from public.bookings where pass_id=p.id and status='confirmed'))),'[]') from public.passes p join public.products pr on pr.id=p.product_id where p.member_id=a.member_id and p.status='active'),
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'start',e.starts_at,'end',e.ends_at,'type',e.entry_type,'status',e.status,'product_id',e.product_id,'coach',m.display_name,'full',(select count(*) from public.bookings where schedule_entry_id=e.id and status='confirmed')>=e.capacity) order by e.starts_at),'[]') from public.schedule_entries e join public.members m on m.id=e.coach_id where e.branch_id=a.branch_id and e.starts_at>=day::timestamp at time zone 'Asia/Seoul' and e.starts_at<(day+7)::timestamp at time zone 'Asia/Seoul' and ((a.role='coach' and e.coach_id=a.member_id) or (a.role='student' and e.entry_type='lesson' and e.status='open' and exists(select 1 from public.passes p join public.pass_coaches c on c.pass_id=p.id where p.member_id=a.member_id and p.product_id=e.product_id and c.coach_id=e.coach_id)))),
 'bookings',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'start',e.starts_at,'member',m.display_name,'attendance',b.attendance,'status',b.status) order by e.starts_at),'[]') from public.bookings b join public.schedule_entries e on e.id=b.schedule_entry_id join public.members m on m.id=b.member_id where b.branch_id=a.branch_id and e.starts_at>=day::timestamp at time zone 'Asia/Seoul' and e.starts_at<(day+7)::timestamp at time zone 'Asia/Seoul' and ((a.role='student' and b.member_id=a.member_id) or (a.role='coach' and e.coach_id=a.member_id)))
 ) into result;
 return result;
end $$;
revoke all on function private.booking_dashboard(date) from public,anon,authenticated;
grant execute on function private.booking_dashboard(date) to authenticated;
create function public.booking_dashboard(day date) returns jsonb language sql security invoker set search_path='' as $$ select private.booking_dashboard(day) $$;
revoke all on function public.booking_dashboard(date) from public,anon;
grant execute on function public.booking_dashboard(date) to authenticated;
