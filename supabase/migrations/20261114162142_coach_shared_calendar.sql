-- Same-branch coach calendar sharing; no write permissions are broadened.
create or replace function private.coach_calendar(day date, selected_coach uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a record; target uuid; result jsonb;
begin
 select * into a from private.actor();
 if a.member_id is null or a.role <> 'coach' or not exists(select 1 from public.coaches where member_id=a.member_id and active) then raise exception '코치 권한이 없습니다.'; end if;
 target:=coalesce(selected_coach,a.member_id);
 if not exists(select 1 from public.coaches where branch_id=a.branch_id and member_id=target and active) then raise exception '같은 지점의 활성 코치만 조회할 수 있습니다.'; end if;
 select jsonb_build_object(
 'actor_id',a.member_id,'selected_coach_id',target,
 'coaches',(select coalesce(jsonb_agg(jsonb_build_object('id',c.member_id,'name',m.display_name) order by m.display_name),'[]') from public.coaches c join public.members m on m.id=c.member_id where c.branch_id=a.branch_id and c.active and m.status='active'),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'duration',duration_minutes)),'[]') from public.products where branch_id=a.branch_id and active and capacity=1),
 'passes','[]'::jsonb,
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'start',e.starts_at,'end',e.ends_at,'type',e.entry_type,'status',e.status,'product_id',e.product_id,'coach',m.display_name,'full',(select count(*) from public.bookings where schedule_entry_id=e.id and status='confirmed')>=e.capacity) order by e.starts_at),'[]') from public.schedule_entries e join public.members m on m.id=e.coach_id where e.branch_id=a.branch_id and e.coach_id=target and e.starts_at>=day::timestamp at time zone 'Asia/Seoul' and e.starts_at<(day+7)::timestamp at time zone 'Asia/Seoul'),
 'bookings',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'start',e.starts_at,'member',m.display_name,'attendance',b.attendance,'status',b.status) order by e.starts_at),'[]') from public.bookings b join public.schedule_entries e on e.id=b.schedule_entry_id join public.members m on m.id=b.member_id where b.branch_id=a.branch_id and e.coach_id=target and e.starts_at>=day::timestamp at time zone 'Asia/Seoul' and e.starts_at<(day+7)::timestamp at time zone 'Asia/Seoul')
 ) into result;
 return result;
end $$;
revoke all on function private.coach_calendar(date,uuid) from public,anon;
grant execute on function private.coach_calendar(date,uuid) to authenticated;
create or replace function public.coach_calendar(day date, selected_coach uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.coach_calendar(day,selected_coach) $$;
revoke all on function public.coach_calendar(date,uuid) from public,anon;
grant execute on function public.coach_calendar(date,uuid) to authenticated;
