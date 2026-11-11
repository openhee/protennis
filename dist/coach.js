'use strict';
const STORAGE_KEY='rally-coach-demo-2026-11-w2-source-v2'+(window.RALLY_SOURCE.synthetic?'-synthetic':'')+':'+(window.RALLY_ACCOUNT||'offline');
const DAYS=['월','화','수','목','금','토','일'];
const TIMES=Array.from({length:48},(_,i)=>`${6+Math.floor(i/3)}:${String(i%3*20).padStart(2,'0')}`);
const COACHES=['이광한','신홍경','하초희','유주희','담당 미확인'];
const key=(coach,day,time)=>`${coach}|${day}|${time}`;
function initialSchedule(){
 const data={};
 for(const coach of COACHES)for(let day=0;day<7;day++)for(const time of TIMES){
 data[key(coach,day,time)]={kind:'unknown',memo:''};
 }
 for(const record of window.RALLY_SOURCE.records){
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
let data=initialSchedule(),coach=COACHES.includes(window.RALLY_COACH_NAME)?window.RALLY_COACH_NAME:COACHES[0],active=null,toastTimer;
$('#coach-select').value=coach;
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&Object.keys(data).every(k=>saved[k]&&['unknown','open','blocked','lesson','record'].includes(saved[k].kind)))data=saved;}catch{}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300)}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));$('#save-status').textContent='이 브라우저에 저장됨 · 실제 예약 및 알림 없음';return true}catch{$('#save-status').textContent='저장 공간 사용 불가 · 새로고침 시 변경이 사라집니다';return false}}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function render(){
 const today=window.RallyDate.key();
 $('#current-date').textContent=`오늘 ${window.RallyDate.label()} · 한국 시간${today<'2026-11-09'||today>'2026-11-15'?' · 현재 표는 11월 2주차 시연입니다.':''}`;
 const table=$('#timetable');table.replaceChildren();const head=element('thead'),hr=element('tr');hr.append(element('th','','시간'));
 DAYS.forEach((name,i)=>{const isToday=today===`2026-11-${String(9+i).padStart(2,'0')}`;const th=element('th',isToday?'today-head':'',name);th.scope='col';if(isToday)th.setAttribute('aria-current','date');th.append(element('strong','',String(9+i)));hr.append(th)});head.append(hr);table.append(head);const body=element('tbody');
 TIMES.forEach(time=>{const row=element('tr');row.append(element('td','',time));DAYS.forEach((day,i)=>{const td=element('td'),id=key(coach,i,time),slot=data[id];const b=element('button',`slot ${slot.kind} ${slot.kind==='lesson'?slot.attendance:''}`);b.type='button';
 if(slot.kind==='lesson'){b.append(element('span','slot-name',slot.name),element('span','session',`${slot.session}/${slot.total}`),element('small','',slot.attendance==='attended'?'✓ 출석 완료':slot.attendance==='absent'?'불참':'20분 · 레슨 예정'));}
 else if(slot.kind==='record'){b.append(element('span','slot-name',slot.raw),element('small','','원문 확인 필요'));}
 else b.textContent={blocked:'예약 불가',open:'+ 예약 가능',unknown:'·'}[slot.kind];
 b.setAttribute('aria-label',`11월 ${9+i}일 ${day}요일 ${time} ${slot.kind==='lesson'?`${slot.name} 예정 ${slot.session}/${slot.total}회차`:slot.kind==='record'?slot.raw:({blocked:'예약 불가',open:'예약 가능',unknown:'미설정'}[slot.kind])}`);b.title=slot.raw||b.getAttribute('aria-label');b.onclick=()=>edit(i,time);td.append(b);row.append(td)});body.append(row)});table.append(body);
 const selected=Object.entries(data).filter(([k])=>k.startsWith(coach+'|')).map(([,v])=>v);
 for(const [id,count] of [['total',selected.filter(s=>s.kind==='lesson').length],['attended',selected.filter(s=>s.kind==='lesson'&&s.attendance==='attended').length],['absent',selected.filter(s=>s.kind==='lesson'&&s.attendance==='absent').length],['open',selected.filter(s=>s.kind==='open').length]]){const el=$('#stat-'+id);el.replaceChildren(document.createTextNode(String(count)),element('small','',id==='open'?'칸':'건'))}
 $('#review-count').textContent=`원문 확인 필요 ${selected.filter(s=>s.kind==='record').length}칸 · 해당 항목은 등록 레슨 집계에서 제외`;
 const coupons=$('#coupon-list');coupons.replaceChildren();const items=window.RALLY_SOURCE.coupons.filter(c=>c.coach===coach);for(const item of items){coupons.append(element('li','',item.raw));}if(!items.length)coupons.append(element('li','empty','이 코치 구역에 기록된 쿠폰 명단이 없습니다.'));
}
function toggleFields(){const isLesson=$('#kind').value==='lesson';$('#lesson-fields').hidden=!isLesson;$('#lesson-fields').querySelectorAll('input,select').forEach(el=>{el.disabled=!isLesson;el.required=isLesson});$('#form-error').textContent=''}
function edit(day,time){active={id:key(coach,day,time),day,time};const slot=data[active.id];$('#dialog-date').textContent=`2026.11.${String(9+day).padStart(2,'0')} ${DAYS[day]}요일`;$('#dialog-title').textContent=`${time} · ${coach} 코치`;$('#dialog-summary').textContent=slot.kind==='lesson'?'예정 회차와 출석 상태를 각각 관리하세요.':'미설정 시간은 예약을 받지 않습니다. 가능한 시간만 직접 열어주세요.';$('#source-preview').textContent=slot.sourceCell?`원본 ${slot.sourceCell}: ${slot.raw||'(빈칸)'}${slot.sourceRed?' · 빨강 배경':''}`:'해당 요일은 원본 코치 구역에 없습니다.';$('#kind').value=slot.kind;$('#student-name').value=slot.name||'';$('#session').value=slot.session||1;$('#total').value=slot.total||8;$('#attendance').value=slot.attendance||'scheduled';$('#memo').value=slot.memo||'';toggleFields();$('#editor').showModal()}
$('#kind').onchange=toggleFields;
$('#slot-form').onsubmit=e=>{e.preventDefault();if(!active)return;const kind=$('#kind').value;const previous=data[active.id];const slot={kind,memo:$('#memo').value.trim(),raw:previous.raw,sourceCell:previous.sourceCell,sourceRed:previous.sourceRed};if(kind==='record'&&!slot.raw?.trim()){$('#form-error').textContent='원문이 없는 시간입니다. 다른 상태를 선택하세요.';return}if(kind==='lesson'){const name=$('#student-name').value.trim(),session=Number($('#session').value),total=Number($('#total').value);if(!name||!Number.isInteger(session)||!Number.isInteger(total)||session<1||total<session||total>100){$('#form-error').textContent='이름과 회차를 확인하세요. 예정 회차는 전체 회차 이하여야 합니다.';return}Object.assign(slot,{name,session,total,attendance:$('#attendance').value})}data[active.id]=slot;const persisted=save();render();$('#editor').close();notify(persisted?'시연 일정이 저장되었습니다. 원본 시트에는 반영되지 않습니다.':'이번 화면에 반영했습니다. 새로고침 시 변경이 사라질 수 있습니다.')};
for(const id of ['close','cancel'])$('#'+id).onclick=()=>$('#editor').close();
$('#coach-select').onchange=e=>{coach=e.target.value;render()};
$('#reset').onclick=()=>$('#reset-dialog').showModal();$('#reset-cancel').onclick=()=>$('#reset-dialog').close();$('#reset-confirm').onclick=()=>{data=initialSchedule();save();render();$('#reset-dialog').close();notify('읽어온 11월 2주차 기록으로 초기화했습니다.')};
render();
window.RallyDate.watch(render);
