create function public.open_lesson_range(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare first_time timestamptz:=(payload->>'starts_at')::timestamptz;
 last_time timestamptz:=(payload->>'ends_at')::timestamptz; cursor_time timestamptz; ids jsonb:='[]';
begin
 if first_time is null or last_time is null or first_time<=now() or last_time<=first_time or last_time-first_time>interval '8 hours'
 or mod(extract(epoch from last_time-first_time)::numeric,1200)<>0
 or (first_time at time zone 'Asia/Seoul')::date<>( (last_time-interval '1 second') at time zone 'Asia/Seoul')::date
 then raise exception '같은 날짜의 미래 시간을 20분 단위로 선택하세요. 한 번에 최대 8시간까지 가능합니다.'; end if;
 cursor_time:=first_time;
 while cursor_time<last_time loop
  ids:=ids || jsonb_build_array(private.booking_action('open',jsonb_build_object('starts_at',cursor_time,'ends_at',cursor_time+interval '20 minutes','product_id',payload->>'product_id')));
  cursor_time:=cursor_time+interval '20 minutes';
 end loop;
 return jsonb_build_object('count',jsonb_array_length(ids),'entries',ids);
end $$;
revoke all on function public.open_lesson_range(jsonb) from public,anon;
grant execute on function public.open_lesson_range(jsonb) to authenticated;
