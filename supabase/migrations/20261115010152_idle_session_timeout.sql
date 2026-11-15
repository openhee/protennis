create table private.app_session_activity (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 last_active_at timestamptz not null
);
alter table private.app_session_activity enable row level security;
revoke all on private.app_session_activity from public, anon, authenticated;
create function private.session_activity(touch boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; uid uuid; started timestamptz; cutoff timestamptz; last_seen timestamptz; current_time_at timestamptz;
begin
 uid:=auth.uid(); sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 if uid is null or sid is null then return null; end if;
 select created_at,not_after into started,cutoff from auth.sessions where id=sid and user_id=uid;
 if not found then return null; end if;
 current_time_at:=clock_timestamp();
 if cutoff is not null and cutoff<=current_time_at then return null; end if;
 -- Old sessions cannot be reactivated merely by refreshing a JWT or calling this RPC.
 insert into private.app_session_activity(session_id,user_id,last_active_at)
 values(sid,uid,started) on conflict(session_id) do nothing;
 select last_active_at into last_seen from private.app_session_activity where session_id=sid and user_id=uid for update;
 current_time_at:=clock_timestamp();
 if last_seen is null or last_seen+interval '30 minutes'<=current_time_at then return null; end if;
 if touch then
  last_seen:=current_time_at;
  update private.app_session_activity set last_active_at=last_seen where session_id=sid and user_id=uid;
 end if;
 return jsonb_build_object('session_id',sid,'expires_at',least(last_seen+interval '30 minutes',cutoff),'server_now',current_time_at);
end $$;
revoke all on function private.session_activity(boolean) from public,anon;
grant execute on function private.session_activity(boolean) to authenticated;
create function public.session_activity(touch boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select private.session_activity(touch) $$;
revoke all on function public.session_activity(boolean) from public,anon;
grant execute on function public.session_activity(boolean) to authenticated;
