begin;
set local search_path=public,extensions;
do $test$
declare
 b uuid; b2 uuid; c uuid:=gen_random_uuid(); st uuid:=gen_random_uuid(); other_m uuid:=gen_random_uuid();
 coach_user uuid:=gen_random_uuid(); student_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); admin_user uuid:=gen_random_uuid();
 prod uuid; p uuid; p2 uuid; ser uuid; rule uuid; lesson uuid; k uuid; grant_id uuid; consume_id uuid;
 n int;
begin
 insert into branches(name) values('TEST ROLLBACK A') returning id into b;
 insert into branches(name) values('TEST ROLLBACK B') returning id into b2;
 insert into auth.users(id,aud,role) values(coach_user,'authenticated','authenticated'),(student_user,'authenticated','authenticated'),(other_user,'authenticated','authenticated'),(admin_user,'authenticated','authenticated');
 insert into members(id,branch_id,auth_user_id,display_name,role) values
 (c,b,coach_user,'Test Coach','coach'),(st,b,student_user,'Test Student','student'),(other_m,b,other_user,'Other Student','student');
 insert into members(branch_id,auth_user_id,display_name,role) values(b2,admin_user,'Other Branch Admin','admin');
 insert into coaches(member_id,branch_id) values(c,b);
 insert into products(branch_id,name,kind,capacity,duration_minutes,price_krw,total_sessions,validity_months)
 values(b,'TEST COUPON','coupon',1,20,200000,5,1) returning id into prod;
 insert into passes(branch_id,member_id,product_id,valid_from,valid_until,agreed_price_krw,agreed_kind,agreed_duration_minutes,agreed_capacity,agreed_weekdays,granted_sessions)
 values(b,st,prod,'2026-11-01','2026-11-30',200000,'coupon',20,1,'{2,4}',5) returning id into p;
 insert into passes(branch_id,member_id,product_id,valid_from,valid_until,agreed_price_krw,agreed_kind,agreed_duration_minutes,agreed_capacity,agreed_weekdays,granted_sessions)
 values(b,other_m,prod,'2026-11-01','2026-11-30',200000,'coupon',20,1,'{2,4}',5) returning id into p2;
 insert into series(branch_id,product_id,capacity) values(b,prod,1) returning id into ser;
 insert into series_rules(branch_id,series_id,coach_id,iso_weekday,start_time,duration_minutes,valid_from,valid_until)
 values(b,ser,c,2,'19:00',20,'2026-11-01','2026-11-30') returning id into rule;
 insert into schedule_entries(branch_id,coach_id,series_rule_id,occurrence_date,starts_at,ends_at,entry_type,status,product_id)
 values(b,c,rule,'2026-11-17','2026-11-17 19:00+09','2026-11-17 19:20+09','lesson','open',prod) returning id into lesson;
 -- Adjacent intervals must be valid.
 insert into schedule_entries(branch_id,coach_id,starts_at,ends_at,entry_type,status,product_id)
 values(b,c,'2026-11-17 19:20+09','2026-11-17 19:40+09','lesson','open',prod);
 begin
 insert into schedule_entries(branch_id,coach_id,starts_at,ends_at,entry_type,status)
 values(b,c,'2026-11-17 19:10+09','2026-11-17 19:30+09','blocked','closed');
 raise exception 'FAIL overlapping coach slots accepted';
 exception when exclusion_violation then null; end;
 begin
 insert into schedule_entries(branch_id,coach_id,series_rule_id,occurrence_date,starts_at,ends_at,entry_type,status)
 values(b,c,rule,'2026-11-17','2026-11-17 20:00+09','2026-11-17 20:20+09','lesson','open');
 raise exception 'FAIL duplicate recurring date accepted';
 exception when unique_violation then null; end;
 begin
 insert into schedule_entries(branch_id,coach_id,starts_at,ends_at,entry_type,status)
 values(b2,c,'2026-11-18 19:00+09','2026-11-18 19:20+09','lesson','open');
 raise exception 'FAIL cross-branch coach accepted';
 exception when foreign_key_violation then null; end;
 begin
 insert into bookings(branch_id,schedule_entry_id,member_id,pass_id,request_id) values(b,lesson,st,p2,gen_random_uuid());
 raise exception 'FAIL another student pass accepted';
 exception when foreign_key_violation then null; end;
 insert into bookings(branch_id,schedule_entry_id,member_id,pass_id,planned_session_no,planned_total_snapshot,credit_hold,request_id)
 values(b,lesson,st,p,3,5,1,gen_random_uuid()) returning id into k;
 begin
 insert into bookings(branch_id,schedule_entry_id,member_id,pass_id,request_id) values(b,lesson,st,p,gen_random_uuid());
 raise exception 'FAIL duplicate participant accepted';
 exception when unique_violation then null; end;
 insert into pass_ledger(branch_id,pass_id,delta_sessions,event_type,operation_id,reason)
 values(b,p,5,'grant',gen_random_uuid(),'test grant') returning id into grant_id;
 update bookings set attendance='present',credit_hold=0 where id=k;
 if (select planned_session_no from bookings where id=k)<>3 then raise exception 'FAIL attendance changed planned session'; end if;
 insert into pass_ledger(branch_id,pass_id,booking_id,delta_sessions,event_type,operation_id,reason)
 values(b,p,k,-1,'consume',gen_random_uuid(),'test attendance') returning id into consume_id;
 begin
 insert into pass_ledger(branch_id,pass_id,booking_id,delta_sessions,event_type,operation_id,reason)
 values(b,p,k,-1,'consume',gen_random_uuid(),'duplicate consumption');
 raise exception 'FAIL duplicate deduction accepted';
 exception when unique_violation then null; end;
 begin
 update pass_ledger set delta_sessions=10 where id=grant_id;
 raise exception 'FAIL mutable ledger';
 exception when check_violation then null; end;
 insert into pass_ledger(branch_id,pass_id,booking_id,delta_sessions,event_type,reverses_id,operation_id,reason)
 values(b,p,k,1,'refund',consume_id,gen_random_uuid(),'test refund');
 begin
 insert into pass_ledger(branch_id,pass_id,booking_id,delta_sessions,event_type,reverses_id,operation_id,reason)
 values(b,p,k,1,'refund',consume_id,gen_random_uuid(),'duplicate refund');
 raise exception 'FAIL duplicate refund accepted';
 exception when unique_violation then null; end;

 perform set_config('rally.test_coach',coach_user::text,true);
 perform set_config('rally.test_student',student_user::text,true);
 perform set_config('rally.test_other',other_user::text,true);
 perform set_config('rally.test_admin',admin_user::text,true);
end $test$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('rally.test_student'),true);
do $$ begin
 if (select count(*) from public.members)<>1 then raise exception 'FAIL student roster isolation'; end if;
 if (select count(*) from public.passes)<>1 then raise exception 'FAIL student pass isolation'; end if;
 if (select count(*) from public.bookings)<>1 then raise exception 'FAIL student booking access'; end if;
 if (select count(*) from public.schedule_entries)<>1 then raise exception 'FAIL student schedule isolation'; end if;
 begin
 update public.members set role='admin';
 raise exception 'FAIL student self promotion accepted';
 exception when insufficient_privilege then null; end;
 begin
 insert into public.branches(name) values('UNAUTHORIZED');
 raise exception 'FAIL authenticated write accepted';
 exception when insufficient_privilege then null; end;
 begin
 perform 1 from private.import_rows;
 raise exception 'FAIL import rows exposed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('rally.test_other'),true);
do $$ begin
 if (select count(*) from public.bookings)<>0 then raise exception 'FAIL unrelated student booking leak'; end if;
 if (select count(*) from public.pass_ledger)<>0 then raise exception 'FAIL unrelated student ledger leak'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('rally.test_coach'),true);
do $$ begin
 if (select count(*) from public.members)<>2 then raise exception 'FAIL coach participant roster'; end if;
 if (select count(*) from public.schedule_entries)<>2 then raise exception 'FAIL coach schedule'; end if;
 if (select count(*) from public.bookings)<>1 then raise exception 'FAIL coach bookings'; end if;
 if (select count(*) from public.passes)<>0 then raise exception 'FAIL coach full contract leak'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('rally.test_admin'),true);
do $$ begin
 if (select count(*) from public.members)<>1 then raise exception 'FAIL admin cross branch roster'; end if;
 if (select count(*) from public.bookings)<>0 then raise exception 'FAIL admin cross branch bookings'; end if;
end $$;
set local role anon;
do $$ begin
 begin
 perform 1 from public.members;
 raise exception 'FAIL anonymous roster access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: constraints, immutable ledger, duplicate deductions/refunds, student/coach/admin/anon isolation. Test fixtures rolled back.' as verification;
