-- Protennis schema v1. No customer data imported.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

create table public.branches (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 timezone text not null default 'Asia/Seoul' check(timezone='Asia/Seoul'),
 created_at timestamptz not null default now()
);
create table public.members (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 display_name text not null check(length(trim(display_name))>0),
 role text not null default 'student' check(role in ('admin','coach','student')),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1, unique(branch_id,id)
);
create table public.coaches (
 member_id uuid primary key, branch_id uuid not null, active boolean not null default true,
 foreign key(branch_id,member_id) references public.members(branch_id,id),
 unique(branch_id,member_id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id),
 name text not null, kind text not null check(kind in ('regular','coupon','one_point','group')),
 capacity integer not null check(capacity>0), duration_minutes integer not null check(duration_minutes>0),
 price_krw integer not null check(price_krw>=0),
 sessions_per_week integer check(sessions_per_week between 1 and 7),
 total_sessions integer check(total_sessions>0), validity_months integer check(validity_months>0),
 allowed_weekdays smallint[] not null default '{1,2,3,4,5,6,7}',
 active boolean not null default true, created_at timestamptz not null default now(),
 check(cardinality(allowed_weekdays)>0 and allowed_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 unique(branch_id,id)
);
create table public.passes (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null,
 member_id uuid not null, product_id uuid not null,
 valid_from date not null, valid_until date not null check(valid_until>=valid_from),
 status text not null default 'active' check(status in ('active','expired','cancelled')),
 agreed_price_krw integer not null check(agreed_price_krw>=0),
 agreed_kind text not null check(agreed_kind in ('regular','coupon','one_point','group')),
 agreed_duration_minutes integer not null check(agreed_duration_minutes>0),
 agreed_capacity integer not null check(agreed_capacity>0),
 agreed_weekdays smallint[] not null,
 agreed_sessions_per_week integer check(agreed_sessions_per_week between 1 and 7),
 granted_sessions integer check(granted_sessions>0),
 cancellation_policy jsonb not null default '{"status":"unconfirmed"}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
 foreign key(branch_id,member_id) references public.members(branch_id,id),
 foreign key(branch_id,product_id) references public.products(branch_id,id),
 check(cardinality(agreed_weekdays)>0 and agreed_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 check(agreed_kind not in ('coupon','one_point') or granted_sessions is not null),
 unique(branch_id,id), unique(branch_id,id,member_id)
);
create table public.series (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null, product_id uuid not null,
 capacity integer not null check(capacity>0),
 booking_mode text not null default 'closed_roster' check(booking_mode in ('closed_roster','open_booking')),
 status text not null default 'active' check(status in ('active','paused','ended')),
 created_at timestamptz not null default now(),
 foreign key(branch_id,product_id) references public.products(branch_id,id), unique(branch_id,id)
);
create table public.series_rules (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null,
 series_id uuid not null, coach_id uuid not null,
 iso_weekday smallint not null check(iso_weekday between 1 and 7), start_time time not null,
 duration_minutes integer not null check(duration_minutes>0),
 valid_from date not null, valid_until date not null check(valid_until>=valid_from),
 created_at timestamptz not null default now(),
 foreign key(branch_id,series_id) references public.series(branch_id,id),
 foreign key(branch_id,coach_id) references public.coaches(branch_id,member_id),
 unique(branch_id,id)
);
create table public.series_enrollments (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null,
 series_id uuid not null, pass_id uuid not null, member_id uuid not null,
 valid_from date not null, valid_until date not null check(valid_until>=valid_from),
 status text not null default 'active' check(status in ('active','cancelled')),
 foreign key(branch_id,series_id) references public.series(branch_id,id),
 foreign key(branch_id,pass_id,member_id) references public.passes(branch_id,id,member_id),
 unique(series_id,pass_id,valid_from),
 exclude using gist(series_id with =,member_id with =,daterange(valid_from,valid_until,'[]') with &&)
 where(status='active')
);
create table public.schedule_entries (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null, coach_id uuid not null,
 series_rule_id uuid, occurrence_date date,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 entry_type text not null check(entry_type in ('lesson','blocked')),
 status text not null default 'draft' check(status in ('draft','open','closed','completed','cancelled')),
 capacity integer not null default 1 check(capacity>0),
 booking_mode text not null default 'closed_roster' check(booking_mode in ('closed_roster','open_booking')),
 product_id uuid, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(branch_id,coach_id) references public.coaches(branch_id,member_id),
 foreign key(branch_id,series_rule_id) references public.series_rules(branch_id,id),
 foreign key(branch_id,product_id) references public.products(branch_id,id),
 check((series_rule_id is null)=(occurrence_date is null)),
 check(entry_type<>'blocked' or status in ('closed','cancelled')),
 unique(branch_id,id), unique(series_rule_id,occurrence_date),
 exclude using gist(coach_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(status<>'cancelled')
);
create table public.bookings (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null,
 schedule_entry_id uuid not null, member_id uuid not null, pass_id uuid not null,
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 planned_session_no integer check(planned_session_no>0),
 planned_total_snapshot integer check(planned_total_snapshot>0),
 attendance text not null default 'pending' check(attendance in ('pending','present','absent','no_show')),
 credit_hold smallint not null default 0 check(credit_hold in (0,1)),
 source_booking_id uuid, request_id uuid not null unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
 foreign key(branch_id,schedule_entry_id) references public.schedule_entries(branch_id,id),
 foreign key(branch_id,pass_id,member_id) references public.passes(branch_id,id,member_id),
 foreign key(branch_id,member_id) references public.members(branch_id,id),
 check(planned_session_no is null or planned_total_snapshot is null or planned_session_no<=planned_total_snapshot),
 check(status<>'cancelled' or credit_hold=0),
 check(source_booking_id is null or source_booking_id<>id),
 unique(branch_id,id), unique(branch_id,id,pass_id), unique(schedule_entry_id,member_id),
 foreign key(branch_id,source_booking_id) references public.bookings(branch_id,id)
);
create table public.pass_ledger (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null, pass_id uuid not null,
 booking_id uuid, delta_sessions integer not null check(delta_sessions<>0),
 event_type text not null check(event_type in ('grant','consume','refund','adjustment')),
 reverses_id uuid unique, operation_id uuid not null unique, reason text not null,
 created_by uuid, created_at timestamptz not null default now(),
 foreign key(branch_id,pass_id) references public.passes(branch_id,id),
 foreign key(branch_id,booking_id,pass_id) references public.bookings(branch_id,id,pass_id),
 unique(branch_id,id,pass_id),
 foreign key(branch_id,reverses_id,pass_id) references public.pass_ledger(branch_id,id,pass_id),
 check(reverses_id is null or reverses_id<>id),
 check((event_type='grant' and delta_sessions>0 and booking_id is null and reverses_id is null)
    or (event_type='consume' and delta_sessions=-1 and booking_id is not null and reverses_id is null)
    or (event_type='refund' and delta_sessions>0 and reverses_id is not null)
    or (event_type='adjustment' and length(trim(reason))>0))
);
create unique index ledger_one_grant on public.pass_ledger(pass_id) where event_type='grant';
create unique index ledger_one_consumption on public.pass_ledger(booking_id) where event_type='consume';
create table public.coach_open_windows (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null, coach_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 foreign key(branch_id,coach_id) references public.coaches(branch_id,member_id),
 created_at timestamptz not null default now(),
 exclude using gist(coach_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id),
 actor_id uuid,
 operation_id uuid not null, entity_type text not null, entity_id uuid not null, action text not null,
 before_summary jsonb, after_summary jsonb, created_at timestamptz not null default now()
);
create table private.import_rows (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id),
 import_batch_id uuid not null, source_sheet text not null, source_cell text not null, source_text text not null,
 review_status text not null default 'pending' check(review_status in ('pending','resolved','ignored')),
 resolved_entity_id uuid, created_at timestamptz not null default now(),
 unique(import_batch_id,source_sheet,source_cell)
);

-- Timestamp/version handling; ledger/audit are append-only.
create function private.touch_row() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); new.version=old.version+1; return new; end $$;
create function private.reject_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Append-only record: use a compensating entry' using errcode='23514'; end $$;
do $$ declare t text; begin
 foreach t in array array['members','passes','schedule_entries','bookings'] loop
 execute format('create trigger touch_row before update on public.%I for each row execute function private.touch_row()',t);
 end loop;
 foreach t in array array['pass_ledger','audit_events'] loop
 execute format('create trigger append_only before update or delete on public.%I for each row execute function private.reject_mutation()',t);
 end loop;
end $$;

-- Narrow, non-exposed lookup functions avoid recursive RLS. All use auth.uid(),
-- never caller-supplied user ids or user_metadata.
create function private.actor() returns table(member_id uuid,branch_id uuid,role text)
language sql stable security definer set search_path='' as $$
 select m.id,m.branch_id,m.role from public.members m where m.auth_user_id=(select auth.uid()) and m.status='active' and (select auth.uid()) is not null
$$;
create function private.is_admin(b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.actor() a where a.branch_id=b and a.role='admin')
$$;
create function private.owns_member(b uuid,m uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.actor() a where a.branch_id=b and a.member_id=m)
$$;
create function private.in_branch(b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.actor() a where a.branch_id=b)
$$;
create function private.staff_schedule(b uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.actor() a join public.schedule_entries e on e.branch_id=a.branch_id
 where a.branch_id=b and e.id=s and (a.role='admin' or (a.role='coach' and e.coach_id=a.member_id)))
$$;
create function private.read_schedule(b uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.staff_schedule(b,s) or exists(select 1 from private.actor() a join public.bookings k on k.member_id=a.member_id
 where a.branch_id=b and k.branch_id=b and k.schedule_entry_id=s)
$$;
create function private.read_member(b uuid,m uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin(b) or private.owns_member(b,m) or exists(
 select 1 from private.actor() a join public.schedule_entries e on e.coach_id=a.member_id
 join public.bookings k on k.schedule_entry_id=e.id
 where a.branch_id=b and a.role='coach' and k.branch_id=b and k.member_id=m)
$$;
create function private.read_series(b uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin(b) or exists(select 1 from private.actor() a where a.branch_id=b and
 ((a.role='coach' and exists(select 1 from public.series_rules r where r.branch_id=b and r.series_id=s and r.coach_id=a.member_id))
 or exists(select 1 from public.series_enrollments e where e.branch_id=b and e.series_id=s and e.member_id=a.member_id)))
$$;
create function private.owns_pass(b uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.actor() a join public.passes p1 on p1.member_id=a.member_id
 where a.branch_id=b and p1.branch_id=b and p1.id=p)
$$;

do $$ declare t text; begin
 foreach t in array array['branches','members','coaches','products','passes','series','series_rules','series_enrollments','schedule_entries','bookings','pass_ledger','coach_open_windows','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
alter table private.import_rows enable row level security;
revoke all on private.import_rows from public,anon,authenticated;
grant select,insert,update,delete on private.import_rows to service_role;
create policy import_server_only on private.import_rows to service_role using(true) with check(true);

create policy branches_read on public.branches for select to authenticated using(private.in_branch(id));
create policy members_read on public.members for select to authenticated using(private.read_member(branch_id,id));
create policy coaches_read on public.coaches for select to authenticated using(private.in_branch(branch_id));
create policy products_read on public.products for select to authenticated using(private.in_branch(branch_id));
create policy passes_read on public.passes for select to authenticated using(private.is_admin(branch_id) or private.owns_member(branch_id,member_id));
create policy series_read on public.series for select to authenticated using(private.read_series(branch_id,id));
create policy rules_read on public.series_rules for select to authenticated using(private.read_series(branch_id,series_id));
create policy enrollments_read on public.series_enrollments for select to authenticated using(private.is_admin(branch_id) or private.owns_member(branch_id,member_id));
create policy schedules_read on public.schedule_entries for select to authenticated using(private.read_schedule(branch_id,id));
create policy bookings_read on public.bookings for select to authenticated using(private.owns_member(branch_id,member_id) or private.staff_schedule(branch_id,schedule_entry_id));
create policy ledger_read on public.pass_ledger for select to authenticated using(private.is_admin(branch_id) or private.owns_pass(branch_id,pass_id));
create policy windows_read on public.coach_open_windows for select to authenticated using(private.is_admin(branch_id) or private.owns_member(branch_id,coach_id));
create policy audit_read on public.audit_events for select to authenticated using(private.is_admin(branch_id));

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.actor(),private.is_admin(uuid),private.owns_member(uuid,uuid),
 private.in_branch(uuid),private.staff_schedule(uuid,uuid),private.read_schedule(uuid,uuid),
 private.read_member(uuid,uuid),private.read_series(uuid,uuid),private.owns_pass(uuid,uuid) to authenticated,service_role;

create index schedule_week on public.schedule_entries(branch_id,coach_id,starts_at);
create index bookings_member_status on public.bookings(member_id,status);
create index bookings_schedule_status on public.bookings(schedule_entry_id,status);
create index passes_member_status on public.passes(member_id,status);
create index ledger_pass_date on public.pass_ledger(pass_id,created_at);
create index audit_branch_date on public.audit_events(branch_id,created_at);
-- Index referencing columns not already covered by a btree prefix.
do $$ declare r record; cols text; begin
 for r in select c.* from pg_constraint c join pg_namespace n on n.oid=c.connamespace
 where c.contype='f' and n.nspname in ('public','private') loop
 if not exists(select 1 from pg_index i where i.indrelid=r.conrelid and i.indisvalid and i.indpred is null
 and (select array_agg(k.attnum order by k.ord) from unnest(i.indkey) with ordinality k(attnum,ord) where k.ord<=cardinality(r.conkey))=r.conkey) then
 select string_agg(quote_ident(a.attname),',' order by u.ord) into cols
 from unnest(r.conkey) with ordinality u(attnum,ord) join pg_attribute a on a.attrelid=r.conrelid and a.attnum=u.attnum;
 execute format('create index %I on %s (%s)','idx_'||substr(r.conname,1,45)||'_'||substr(md5(r.conrelid::regclass::text||r.conname),1,8),r.conrelid::regclass,cols);
 end if;
 end loop;
end $$;
insert into public.branches(name) values('프로 테니스 아카데미 2호점');
