'use strict';
const STORAGE_KEY='rally-coach-demo-2026-11-w2-source-v2'+(window.RALLY_SOURCE.synthetic?'-synthetic':'')+':'+(window.RALLY_ACCOUNT||'offline');
const DAYS=['월','화','수','목','금','토','일'];
const TIMES=Array.from({length:48},(_,i)=>`${6+Math.floor(i/3)}:${String(i%3*20).padStart(2,'0')}`);
const COACHES=['이광한','신홍경','하초희','유주희','담당 미확인'];
const key=(coach,day,time)=>`${coach}|${day}|${time}`;
let weekStart='2026-11-09';
const dateAt=(offset)=>new Date(Date.parse(weekStart+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const weekKey=()=>weekStart==='2026-11-09'?STORAGE_KEY:STORAGE_KEY+':week:'+weekStart;
function initialSchedule(){
 const data={};
 for(const coach of COACHES)for(let day=0;day<7;day++)for(const time of TIMES){
 data[key(coach,day,time)]={kind:'unknown',memo:''};
 }
 for(const record of (weekStart==='2026-11-09'?window.RALLY_SOURCE.records:[])){
 const raw=record.raw.trim();
 // Only an unambiguous name + single fraction becomes a structured lesson.
 // Mixed notes, multiple fractions, dates and special lessons retain their original text.
 const match=raw.match(/^([가-힣A-Za-z ,·]+?(?: \d{3})?)\s+(\d+)\/(\d+)$/) || raw.match(/^([가-힣A-Za-z ,·]+?)(\d+)\/(\d+)$/);
 const slot={kind:raw?'record':record.red?'blocked':'unknown',memo:'',raw:record.raw,sourceCell:record.cell,sourceRed:record.red};
 if(match&&+match[2]>0&&+match[2]<=+match[3])Object.assign(slot,{kind:'lesson',name:match[1].trim(),session:+match[2],total:+match[3],attendance:'scheduled'});
 data[key(record.coach,record.day,record.time)]=slot;
 }
 return data;
}
const $=s=>document.querySelector(s);
const liveMode=Boolean(window.RALLY_SESSION);
let liveRequest=0,rangeDialog=null,dragRange=null,rangeProducts=[];
let liveSelected='',liveOwn=true,liveLastLoaded=0;
const liveCache=new Map(),liveInflight=new Map();
let data=initialSchedule(),coach=COACHES.includes(window.RALLY_COACH_NAME)?window.RALLY_COACH_NAME:COACHES[0],active=null,toastTimer,view='calendar';
$('#coach-select').value=coach;
try{const saved=JSON.parse(localStorage.getItem(weekKey()));if(saved&&Object.keys(data).every(k=>saved[k]&&['unknown','open','blocked','lesson','record'].includes(saved[k].kind)))data=saved;}catch{}
try{if(localStorage.getItem(STORAGE_KEY+':view')==='table')view='table';}catch{}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300)}
function save(){try{localStorage.setItem(weekKey(),JSON.stringify(data));$('#save-status').textContent='이 브라우저에 저장됨 · 실제 예약 및 알림 없음';return true}catch{$('#save-status').textContent='저장 공간 사용 불가 · 새로고침 시 변경이 사라집니다';return false}}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function renderCalendar(today){
 const root=$('#calendar-view');root.replaceChildren();
 DAYS.forEach((day,dayIndex)=>{const date=dateAt(dayIndex),article=element('article',`calendar-day${today===date?' today':''}`),head=element('div','calendar-day-head');head.append(element('span','',day+'요일'),element('strong','',String(Number(dateAt(dayIndex).slice(-2)))));article.append(head);const events=element('div','calendar-events');
  const visible=TIMES.map(time=>({time,slot:data[key(coach,dayIndex,time)]})).filter(({slot})=>['lesson','open','record'].includes(slot.kind));
  for(const {time,slot} of visible){const button=element('button',`calendar-event ${slot.kind} ${slot.kind==='lesson'?slot.attendance:''}`);button.type='button';let title,meta;if(slot.kind==='lesson'){title=slot.name;meta=`${slot.session}/${slot.total}회차 · ${slot.attendance==='attended'?'출석 완료':slot.attendance==='absent'?'불참':'레슨 예정'}`;}else if(slot.kind==='open'){title='예약 가능';meta='레슨생 예약 가능 시간';}else{title=slot.raw;meta='원문 확인 필요';}button.append(element('span','calendar-event-time',time),element('span','calendar-event-title',title),element('span','calendar-event-meta',meta));button.setAttribute('aria-label',`${day}요일 ${time} ${title} ${meta}`);button.onclick=()=>openMemberCard(dayIndex,time);events.append(button);}
  if(!visible.length)events.append(element('p','calendar-empty','표시할 레슨 일정이 없습니다.'));
  article.append(events);const blocked=TIMES.filter(time=>data[key(coach,dayIndex,time)].kind==='blocked').length;if(blocked)article.append(element('div','calendar-day-foot',`예약 불가 ${blocked}칸`));root.append(article);
 });
}
function setView(next,persist=true){view=next==='table'?'table':'calendar';$('#calendar-view').hidden=view!=='calendar';$('#table-view').hidden=view!=='table';$('#view-calendar').setAttribute('aria-pressed',String(view==='calendar'));$('#view-table').setAttribute('aria-pressed',String(view==='table'));$('#view-description').textContent=view==='calendar'?'레슨과 예약 가능한 시간만 날짜별로 표시':'표시 범위 06:00–21:40 · 원본 시간 행 48개';if(persist)try{localStorage.setItem(STORAGE_KEY+':view',view)}catch{}}
function render(){
 if(liveMode){refreshLiveCalendar();return;}
 const today=window.RallyDate.key();
 if(typeof window.renderWeekNavigation==='function')window.renderWeekNavigation(weekStart,today);
 $('#current-date').textContent=`오늘 ${window.RallyDate.label()} · 한국 시간${today<'2026-11-09'||today>'2026-11-15'?' · 현재 표는 11월 2주차 시연입니다.':''}`;
 renderCalendar(today);const table=$('#timetable');table.replaceChildren();const head=element('thead'),hr=element('tr');hr.append(element('th','','시간'));
 DAYS.forEach((name,i)=>{const isToday=today===dateAt(i);const th=element('th',isToday?'today-head':'',name);th.scope='col';if(isToday)th.setAttribute('aria-current','date');th.append(element('strong','',String(Number(dateAt(i).slice(-2)))));hr.append(th)});head.append(hr);table.append(head);const body=element('tbody');
 TIMES.forEach(time=>{const row=element('tr');row.append(element('td','',time));DAYS.forEach((day,i)=>{const td=element('td'),id=key(coach,i,time),slot=data[id];const b=element('button',`slot ${slot.kind} ${slot.kind==='lesson'?slot.attendance:''}`);b.type='button';
 if(slot.kind==='lesson'){b.append(element('span','slot-name',slot.name),element('span','session',`${slot.session}/${slot.total}`),element('small','',slot.attendance==='attended'?'✓ 출석 완료':slot.attendance==='absent'?'불참':'20분 · 레슨 예정'));}
 else if(slot.kind==='record'){b.append(element('span','slot-name',slot.raw),element('small','','원문 확인 필요'));}
 else b.textContent={blocked:'예약 불가',open:'+ 예약 가능',unknown:'·'}[slot.kind];
 b.setAttribute('aria-label',`${dateAt(i)} ${day}요일 ${time} ${slot.kind==='lesson'?`${slot.name} 예정 ${slot.session}/${slot.total}회차`:slot.kind==='record'?slot.raw:({blocked:'예약 불가',open:'예약 가능',unknown:'미설정'}[slot.kind])}`);b.title=slot.raw||b.getAttribute('aria-label');b.onclick=()=>openMemberCard(i,time);td.append(b);row.append(td)});body.append(row)});table.append(body);
 const selected=Object.entries(data).filter(([k])=>k.startsWith(coach+'|')).map(([,v])=>v);
 for(const [id,count] of [['total',selected.filter(s=>s.kind==='lesson').length],['attended',selected.filter(s=>s.kind==='lesson'&&s.attendance==='attended').length],['absent',selected.filter(s=>s.kind==='lesson'&&s.attendance==='absent').length],['open',selected.filter(s=>s.kind==='open').length]]){const el=$('#stat-'+id);el.replaceChildren(document.createTextNode(String(count)),element('small','',id==='open'?'칸':'건'))}
 $('#review-count').textContent=`원문 확인 필요 ${selected.filter(s=>s.kind==='record').length}칸 · 해당 항목은 등록 레슨 집계에서 제외`;
 const coupons=$('#coupon-list');coupons.replaceChildren();const items=window.RALLY_SOURCE.coupons.filter(c=>c.coach===coach);for(const item of items){coupons.append(element('li','',item.raw));}if(!items.length)coupons.append(element('li','empty','이 코치 구역에 기록된 쿠폰 명단이 없습니다.'));
}
function toggleFields(){const isLesson=$('#kind').value==='lesson';$('#lesson-fields').hidden=!isLesson;$('#lesson-fields').querySelectorAll('input,select').forEach(el=>{el.disabled=!isLesson;el.required=isLesson});$('#form-error').textContent=''}
function edit(day,time){active={id:key(coach,day,time),day,time};const slot=data[active.id];$('#dialog-date').textContent=`${dateAt(day)} ${DAYS[day]}요일`;$('#dialog-title').textContent=`${time} · ${coach} 코치`;$('#dialog-summary').textContent=slot.kind==='lesson'?'예정 회차와 출석 상태를 각각 관리하세요.':'미설정 시간은 예약을 받지 않습니다. 가능한 시간만 직접 열어주세요.';$('#source-preview').textContent=slot.sourceCell?`원본 ${slot.sourceCell}: ${slot.raw||'(빈칸)'}${slot.sourceRed?' · 빨강 배경':''}`:'해당 요일은 원본 코치 구역에 없습니다.';$('#kind').value=slot.kind;$('#student-name').value=slot.name||'';$('#session').value=slot.session||1;$('#total').value=slot.total||8;$('#attendance').value=slot.attendance||'scheduled';$('#memo').value=slot.memo||'';toggleFields();$('#editor').showModal()}
$('#kind').onchange=toggleFields;
$('#slot-form').onsubmit=e=>{e.preventDefault();if(!active)return;const kind=$('#kind').value;const previous=data[active.id];const slot={kind,memo:$('#memo').value.trim(),raw:previous.raw,sourceCell:previous.sourceCell,sourceRed:previous.sourceRed};if(kind==='record'&&!slot.raw?.trim()){$('#form-error').textContent='원문이 없는 시간입니다. 다른 상태를 선택하세요.';return}if(kind==='lesson'){const name=$('#student-name').value.trim(),session=Number($('#session').value),total=Number($('#total').value);if(!name||!Number.isInteger(session)||!Number.isInteger(total)||session<1||total<session||total>100){$('#form-error').textContent='이름과 회차를 확인하세요. 예정 회차는 전체 회차 이하여야 합니다.';return}Object.assign(slot,{name,session,total,attendance:$('#attendance').value})}data[active.id]=slot;const persisted=save();render();$('#editor').close();notify(persisted?'시연 일정이 저장되었습니다. 원본 시트에는 반영되지 않습니다.':'이번 화면에 반영했습니다. 새로고침 시 변경이 사라질 수 있습니다.')};
for(const id of ['close','cancel'])$('#'+id).onclick=()=>$('#editor').close();
$('#coach-select').onchange=e=>{if(liveMode){liveSelected=e.target.value;refreshLiveCalendar();return;}coach=e.target.value;render()};
$('#view-calendar').onclick=()=>setView('calendar');$('#view-table').onclick=()=>setView('table');setView(view,false);
$('#reset').onclick=()=>$('#reset-dialog').showModal();$('#reset-cancel').onclick=()=>$('#reset-dialog').close();$('#reset-confirm').onclick=()=>{data=initialSchedule();save();render();$('#reset-dialog').close();notify('읽어온 11월 2주차 기록으로 초기화했습니다.')};
function changeWeek(date){
 const target=new Date(date+'T00:00:00Z');
 target.setUTCDate(target.getUTCDate()-((target.getUTCDay()+6)%7));
 weekStart=target.toISOString().slice(0,10);
 if(liveMode){render();return;}
 data=initialSchedule();
 try{const saved=JSON.parse(localStorage.getItem(weekKey()));if(saved&&Object.keys(data).every(k=>saved[k]&&['unknown','open','blocked','lesson','record'].includes(saved[k].kind)))data=saved;}catch{}
 render();
}
render();
window.RallyDate.watch(render);

// Navigation uses date-only UTC arithmetic; today's date is supplied in Korea time.
if(typeof document.getElementById==='function'){
 const controls=element('div','week-navigation');
 for(const [label,offset] of [['이전 주',-7],['오늘',0],['다음 주',7]]){
  const button=element('button','button secondary',label);button.type='button';
  button.onclick=()=>changeWeek(offset?dateAt(offset):window.RallyDate.key());controls.append(button);
 }
 document.querySelector('.toolbar-actions').prepend(controls);
 let monthCursor=null;
 window.renderWeekNavigation=(start,today)=>{
  document.querySelector('.toolbar h2').textContent=start.slice(0,4)+'년 '+Number(start.slice(5,7))+'월';
  document.querySelector('.toolbar p').textContent=start+' — '+dateAt(6);
  document.querySelector('#current-date').textContent='오늘 '+window.RallyDate.label()+' · 한국 시간';
  for(const id of ['calendar-view','timetable'])document.getElementById(id).setAttribute('aria-label',start+' 주간 레슨 일정');
  const root=document.querySelector('.mini-month');root.replaceChildren();
  const month=monthCursor||start.slice(0,7),first=new Date(month+'-01T00:00:00Z');
  const title=element('div','mini-month-title');
  for(const [label,step] of [['‹',-1],[month,0],['›',1]]){
   if(!step){title.append(element('strong','',label));continue;}
   const button=element('button','month-arrow',label);button.type='button';button.setAttribute('aria-label',step<0?'이전 달':'다음 달');
   button.onclick=()=>{const d=new Date(first);d.setUTCMonth(d.getUTCMonth()+step);monthCursor=d.toISOString().slice(0,7);window.renderWeekNavigation(weekStart,window.RallyDate.key());};title.append(button);
  }
  root.append(title);const weekdays=element('div','mini-week');DAYS.forEach(day=>weekdays.append(element('span','',day)));root.append(weekdays);
  const grid=element('div','mini-days'),offset=(first.getUTCDay()+6)%7;
  for(let i=0;i<42;i++){
   const d=new Date(first);d.setUTCDate(1-offset+i);const date=d.toISOString().slice(0,10);
   const button=element('button',(date>=start&&date<=dateAt(6)?'selected ':'')+(date===today?'today ':'')+(date.slice(0,7)!==month?'outside':''),String(d.getUTCDate()));
   button.type='button';button.setAttribute('aria-label',date+' 주간 일정 보기');if(date===today)button.setAttribute('aria-current','date');
   button.onclick=()=>{monthCursor=null;changeWeek(date);};grid.append(button);
  }
  root.append(grid);
 };
 document.querySelector('#reset-dialog p').textContent='선택한 주의 브라우저 변경 사항을 초기화합니다. 11월 9일 주간만 원본 시연 기록이 있습니다.';
 changeWeek(window.RallyDate.key());
}
function openMemberCard(day,time){
 const slot=data[key(coach,day,time)];
 if(slot.kind!=='lesson'){edit(day,time);return;}
 const dialog=$('#member-card'),content=$('#member-card-content');
 $('#member-card-title').textContent=slot.name;
 $('#member-card-context').textContent=dateAt(day)+' '+DAYS[day]+'요일 '+time+' · '+coach+' 코치';
 content.replaceChildren(element('p','member-card-note','시연 일정 정보 · 실제 회원 계정 및 수강권 미연결'));
 const details=element('dl','member-details');
 for(const [label,value] of [['예정 회차',slot.session+'/'+slot.total+'회'],['출석 상태',slot.attendance==='attended'?'출석 완료':slot.attendance==='absent'?'불참':'레슨 예정'],['잔여 수강권','회원 계정 연결 후 확인'],['메모',slot.memo||'없음']])details.append(element('dt','',label),element('dd','',value));
 content.append(details);
 $('#member-card-edit').hidden=false;
 $('#member-card-edit').onclick=()=>{dialog.close();edit(day,time);};
 dialog.showModal();
}
$('#member-card-close').onclick=()=>$('#member-card').close();
function koreaParts(value){const iso=new Date(Date.parse(value)+9*3600000).toISOString();return {date:iso.slice(0,10),time:iso.slice(11,16)};}
function liveItems(payload){return payload.entries.filter(e=>e.status!=='cancelled').map(e=>({...e,...koreaParts(e.start),people:payload.bookings.filter(b=>b.status==='confirmed'&&Date.parse(b.start)===Date.parse(e.start))}));}
function liveLabel(e){return e.type==='blocked'?'예약 불가':e.people.length?e.people.map(b=>b.member).join(', '):e.status==='open'&&!e.full?'예약 가능':'마감';}
function liveCard(e){
 $('#member-card-title').textContent=liveLabel(e);
 $('#member-card-context').textContent=e.date+' '+e.time+' — '+koreaParts(e.end).time+' · '+e.coach;
 const details=element('dl','member-details');
 for(const [label,value] of [['예약 상태',e.people.length?'예약 확정':liveLabel(e)],['예약 인원',String(e.people.length)+'명'],['출석 상태',e.people.map(b=>({pending:'출석 처리 전',present:'출석 완료',absent:'불참',no_show:'미출석'}[b.attendance]||b.attendance)).join(', ')||'—']])details.append(element('dt','',label),element('dd','',value));
 $('#member-card-content').replaceChildren(details,element('p','member-card-note','실제 등록된 일정입니다. 수강권 상세·출석 수정은 연결 준비 중입니다.'));
 $('#member-card-edit').hidden=true;$('#member-card').showModal();
}
async function refreshLiveCalendar(force=false){
 if(rangeDialog?.open||dragRange)return;
 const request=++liveRequest,week=weekStart,today=window.RallyDate.key(),key=week+':'+liveSelected;
 if(window.renderWeekNavigation)window.renderWeekNavigation(week,today);
 $('#current-date').textContent='오늘 '+window.RallyDate.label()+' · 한국 시간';
 $('#calendar-view').inert=true;$('#timetable').inert=true;
 $('#save-status').textContent='DB 일정 조회 중';

 $('#review-count').textContent='';
 try{
  let payload;const cached=liveCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<60000)payload=cached.value;
  else {
   if(!liveInflight.has(key))liveInflight.set(key,(async()=>{const response=await fetch('/api/coach-calendar?day='+week+(liveSelected?'&coach='+liveSelected:''),{cache:'no-store'});if(response.status===401){location.replace('/login.html');throw Error();}if(!response.ok)throw Error();return response.json();})().finally(()=>liveInflight.delete(key)));
   payload=await liveInflight.get(key);liveCache.set(key,{value:payload,at:Date.now()});
  }
  if(request!==liveRequest)return;
  liveLastLoaded=Date.now();liveOwn=!payload.actor_id||payload.actor_id===payload.selected_coach_id;
  if(payload.coaches){const select=$('#coach-select');select.replaceChildren();for(const c of payload.coaches){const option=element('option','',c.name+(c.id===payload.actor_id?' (내 일정)':''));option.value=c.id;select.append(option);}select.value=payload.selected_coach_id;select.disabled=false;}
  const addButton=document.getElementById('open-range-button');if(addButton)addButton.hidden=!liveOwn;
  $('#calendar-view').inert=false;$('#timetable').inert=false;
  rangeProducts=payload.products||[];
  const items=liveItems(payload),root=$('#calendar-view');root.replaceChildren();
  const buttonFor=e=>{const b=element('button','calendar-event '+(e.type==='blocked'?'blocked':e.people.length?'lesson':'open'));b.type='button';b.append(element('span','calendar-event-time',e.time+' – '+koreaParts(e.end).time),element('span','calendar-event-title',liveLabel(e)));b.setAttribute('aria-label',e.date+' '+e.time+' '+liveLabel(e));b.onclick=()=>liveCard(e);return b;};
  DAYS.forEach((day,i)=>{const date=dateAt(i),article=element('article','calendar-day'+(date===today?' today':'')),head=element('div','calendar-day-head');head.append(element('span','',day+'요일'),element('strong','',String(Number(date.slice(-2)))));article.append(head);const events=element('div','calendar-events'),entries=items.filter(e=>e.date===date);for(const e of entries)events.append(buttonFor(e));if(!entries.length)events.append(element('p','calendar-empty','등록된 일정 없음'));article.append(events);root.append(article);});
  const table=$('#timetable'),thead=element('thead'),head=element('tr');table.replaceChildren();head.append(element('th','','시간'));DAYS.forEach((d,i)=>{const th=element('th',dateAt(i)===today?'today-head':'',d+' '+Number(dateAt(i).slice(-2)));th.scope='col';head.append(th);});thead.append(head);table.append(thead);
  const times=[...new Set([...TIMES.map(t=>t.padStart(5,'0')),...items.map(e=>e.time)])].sort(),body=element('tbody');
  for(const time of times){const row=element('tr');row.append(element('td','',time));DAYS.forEach((d,i)=>{const cell=element('td'),entries=items.filter(e=>e.date===dateAt(i)&&e.time===time);entries.forEach(e=>cell.append(buttonFor(e)));if(!entries.length&&liveOwn){const b=element('button','slot unknown','+ 시간 등록');b.type='button';b.setAttribute('aria-label',dateAt(i)+' '+time+' 시간 등록 화면 열기');b.dataset.day=dateAt(i);b.dataset.time=time;b.onclick=()=>openRange(dateAt(i),time,time);b.onpointerdown=event=>{if(event.button!==0||event.pointerType==='touch')return;event.preventDefault();b.focus();dragRange={date:b.dataset.day,start:time,end:time};paintRange();};b.onpointerenter=()=>{if(dragRange&&dragRange.date===b.dataset.day){dragRange.end=time;paintRange();}};cell.append(b);}row.append(cell);});body.append(row);}table.append(body);
  const bookings=payload.bookings.filter(b=>b.status==='confirmed');
  for(const [id,count] of [['total',bookings.length],['attended',bookings.filter(b=>b.attendance==='present').length],['absent',bookings.filter(b=>['absent','no_show'].includes(b.attendance)).length],['open',items.filter(e=>e.type==='lesson'&&e.status==='open'&&!e.full&&Date.parse(e.start)>Date.now()).length]])$('#stat-'+id).replaceChildren(document.createTextNode(String(count)),element('small','',id==='open'?'칸':'건'));
  $('#review-count').textContent='실제 DB 일정 · '+items.length+'건';$('#view-description').textContent=liveOwn?'한국 시간 · 내 일정':'공유 일정 · 조회 전용';
  $('#save-status').textContent='갱신 완료 · '+new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'});
 }catch(error){if(request!==liveRequest)return;$('#calendar-view').replaceChildren(element('p','calendar-empty','일정을 불러오지 못했습니다. 주간 또는 코치를 다시 선택해 주세요.'));$('#save-status').textContent='조회 실패 · 재시도 필요';}
}
if(liveMode){
 $('#coach-select').replaceChildren(element('option','',window.RALLY_SESSION.name));$('#coach-select').disabled=false;
 installRangeEditor();
 $('#reset').hidden=true;
 document.querySelector('.source-note p').textContent='같은 지점 코치의 일정을 조회할 수 있습니다. 일정 등록은 본인 일정에서 가능합니다.';
 document.querySelector('.sidebar-bottom').textContent='실제 DB 연결 · 코치 공유 일정';
 document.querySelector('.coupon-section').hidden=true;document.querySelector('.bottom-notes').hidden=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-liveLastLoaded>60000)refreshLiveCalendar();});
 window.addEventListener('pageshow',event=>{if(event.persisted&&Date.now()-liveLastLoaded>60000)refreshLiveCalendar();});
}

function minuteValue(time){const [h,m]=time.split(':').map(Number);return h*60+m;}
function rangeBounds(date,first,last){
 const start=Math.min(minuteValue(first),minuteValue(last)),end=Math.max(minuteValue(first),minuteValue(last))+20;
 const stamp=minutes=>new Date(Date.parse(date+'T00:00:00Z')+minutes*60000).toISOString().slice(0,16);
 return {start:stamp(start),end:stamp(end),count:(end-start)/20};
}
function paintRange(){
 document.querySelectorAll('#timetable button[data-day]').forEach(b=>{
  b.classList.toggle('range-selected',Boolean(dragRange&&b.dataset.day===dragRange.date&&minuteValue(b.dataset.time)>=Math.min(minuteValue(dragRange.start),minuteValue(dragRange.end))&&minuteValue(b.dataset.time)<=Math.max(minuteValue(dragRange.start),minuteValue(dragRange.end))));
 });
}
function openRange(date,first,last){
 if(!liveOwn||!rangeDialog||rangeDialog.open)return;
 const bounds=rangeBounds(date,first,last);
 document.getElementById('range-start').value=bounds.start;document.getElementById('range-end').value=bounds.end;
 const product=document.getElementById('range-product');product.replaceChildren();
 for(const p of rangeProducts.filter(p=>p.duration===20)){const o=element('option','',p.name);o.value=p.id;product.append(o);}
 document.getElementById('range-error').textContent='';
 document.getElementById('range-action').value='bulk-open';
 updateRangeSummary();rangeDialog.showModal();
}
function updateRangeSummary(){
 const first=document.getElementById('range-start').value,last=document.getElementById('range-end').value;
 const count=(Date.parse(last+':00+09:00')-Date.parse(first+':00+09:00'))/1200000;
 document.getElementById('range-summary').textContent=document.getElementById('range-action').value==='block'?'선택한 범위를 예약 불가로 등록합니다.':Number.isInteger(count)&&count>0?'20분 레슨 '+count+'개를 예약 가능으로 엽니다.':'시작·종료 시간을 20분 단위로 선택하세요.';
}
function installRangeEditor(){
 rangeDialog=element('dialog');rangeDialog.id='range-editor';rangeDialog.setAttribute('aria-labelledby','range-title');
 rangeDialog.innerHTML='<form id="range-form"><div class="dialog-head"><h2 id="range-title">선택한 시간 열기</h2><button type="button" class="close" id="range-close" aria-label="닫기">×</button></div><p class="field-note">같은 날짜에서 위아래로 드래그하세요. 선택 범위는 저장 전에 수정할 수 있습니다.</p><label for="range-action">시간 상태</label><select id="range-action"><option value="bulk-open">예약 가능 · 20분씩 나누기</option><option value="block">예약 불가</option></select><label for="range-product">레슨 상품</label><select id="range-product"></select><label for="range-start">시작 · 한국 시간</label><input type="datetime-local" id="range-start" required><label for="range-end">종료 · 한국 시간</label><input type="datetime-local" id="range-end" required><p id="range-summary" class="field-note"></p><p id="range-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" id="range-cancel">취소</button><button type="submit" class="button" id="range-save">선택한 시간 저장</button></div></form>';
 document.body.append(rangeDialog);
 for(const id of ['range-close','range-cancel'])document.getElementById(id).onclick=()=>rangeDialog.close();
 for(const id of ['range-start','range-end','range-action'])document.getElementById(id).onchange=updateRangeSummary;
 document.getElementById('range-form').onsubmit=async event=>{
  event.preventDefault();const saveButton=document.getElementById('range-save');if(saveButton.disabled)return;
  const action=document.getElementById('range-action').value,product=document.getElementById('range-product').value;
  if(action==='bulk-open'&&!product){document.getElementById('range-error').textContent='등록된 20분 레슨 상품이 없습니다.';return;}
  saveButton.disabled=true;document.getElementById('range-error').textContent='저장 중…';
  try{
   const response=await fetch('/api/booking-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{starts_at:document.getElementById('range-start').value+':00+09:00',ends_at:document.getElementById('range-end').value+':00+09:00',product_id:product}})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'저장하지 못했습니다.');
   rangeDialog.close();liveCache.clear();await refreshLiveCalendar(true);notify(action==='bulk-open'?result.count+'개의 레슨 시간을 열었습니다.':'예약 불가 시간을 등록했습니다.');
  }catch(error){document.getElementById('range-error').textContent=error.message;}finally{saveButton.disabled=false;}
 };
 const add=element('button','button','예약 시간 열기');add.type='button';add.id='open-range-button';add.onclick=()=>openRange(weekStart,'18:00','18:40');document.querySelector('.heading').append(add);
 const hint=element('p','range-hint','상세 시간표에서 같은 요일의 빈 시간을 드래그하면 20분씩 한 번에 열 수 있어요. 휴대폰에서는 빈 칸을 누른 뒤 종료 시간을 선택하세요.');
 document.querySelector('.toolbar').after(hint);
 window.addEventListener('pointerup',()=>{if(!dragRange)return;const range=dragRange;dragRange=null;paintRange();openRange(range.date,range.start,range.end);});
 window.addEventListener('pointercancel',()=>{dragRange=null;paintRange();});
}

