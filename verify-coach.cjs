const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(`${__dirname}/dist/coach.js`, 'utf8');
new vm.Script(code);
const prefix = code.slice(0, code.indexOf('const $='));
const context={window:{}};
const dataFile=process.argv.includes('--sample')||!fs.existsSync(`${__dirname}/dist/coach-data.js`)?'coach-data.sample.js':'coach-data.js';
vm.runInNewContext(fs.readFileSync(`${__dirname}/dist/${dataFile}`, 'utf8'),context);
const data = vm.runInNewContext(prefix + ';initialSchedule()',context);
const slots = Object.values(data);
assert.equal(slots.length, 1680);
assert.equal(slots.filter(s => s.raw?.trim()).length, 176);
assert.equal(slots.filter(s => s.kind === 'open').length, 0);
assert.equal(context.window.RALLY_SOURCE.coupons.length,17);
for(const record of context.window.RALLY_SOURCE.records){
 const slot=data[`${record.coach}|${record.day}|${record.time}`];
 assert.equal(slot.raw,record.raw);
 assert.equal(slot.sourceCell,record.cell);
 if(record.red&&!record.raw.trim())assert.equal(slot.kind,'blocked');
 if(!record.red&&!record.raw.trim())assert.equal(slot.kind,'unknown');
 if(/차감|보강|부상/.test(record.raw))assert.equal(slot.kind,'record');
}
assert.equal(new Date(Date.UTC(2026, 10, 9)).getUTCDay(), 1);
for (const slot of slots.filter(s => s.kind === 'lesson')) {
  assert.ok(slot.session <= slot.total);
  assert.equal(slot.attendance, 'scheduled');
}
console.log(`PASS: 1680 slots; 176 original entries preserved; 17 coupon records; ${slots.filter(s=>s.kind==='lesson').length} parsed lessons; ${slots.filter(s=>s.kind==='record').length} records needing review; no automatically open slots.`);

// Exercise actual UI handlers in a minimal DOM; visual layout needs a browser.
class Node {
 constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.attrs={};}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 setAttribute(k,v){this.attrs[k]=v}
 getAttribute(k){return this.attrs[k]}
 querySelectorAll(){return []}
 showModal(){this.open=true}
 close(){this.open=false}
}
const nodes={};
const html=fs.readFileSync(`${__dirname}/dist/coach.html`,'utf8');
for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes['#'+id]=new Node();
const storage={};
const ui={window:context.window,document:{querySelector:s=>{assert.ok(nodes[s],`Missing DOM node ${s}`);return nodes[s]},createElement:()=>new Node(),createTextNode:text=>({textContent:text})},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},setTimeout:()=>1,clearTimeout:()=>{}};
vm.createContext(ui);
vm.runInContext(fs.readFileSync(`${__dirname}/public/date.js`,'utf8'),ui);
vm.runInContext(code,ui);
assert.equal(nodes['#calendar-view'].children.length,7);
assert.equal(nodes['#calendar-view'].hidden,false);
assert.equal(nodes['#table-view'].hidden,true);
nodes['#view-table'].onclick();
assert.equal(nodes['#calendar-view'].hidden,true);
assert.equal(nodes['#table-view'].hidden,false);
nodes['#view-calendar'].onclick();
vm.runInContext("edit(1,'7:40')",ui);
assert.equal(nodes['#student-name'].value,data['이광한|1|7:40'].name);
assert.equal(nodes['#session'].value,3);
nodes['#attendance'].value='attended';
nodes['#slot-form'].onsubmit({preventDefault(){}});
assert.equal(vm.runInContext("data[key('이광한',1,'7:40')].attendance",ui),'attended');
assert.equal(vm.runInContext("data[key('이광한',1,'7:40')].session",ui),3);
nodes['#coach-select'].onchange({target:{value:'하초희'}});
vm.runInContext("edit(1,'10:00')",ui);
assert.equal(nodes['#kind'].value,'record');
assert.match(nodes['#source-preview'].textContent,/10분 보강/);
nodes['#reset-confirm'].onclick();
assert.equal(vm.runInContext("data[key('이광한',1,'7:40')].attendance",ui),'scheduled');
assert.ok(Object.keys(storage).length);
console.log('PASS: calendar/table switching, coach switching, source details, attendance independent of planned session, browser storage and reset handlers.');
for(const [date,column] of [['2026-11-11',3],['2026-11-12',4],['2026-11-16',-1],['2027-11-12',-1]]){
 ui.window.RallyDate.key=()=>date;
 vm.runInContext('render()',ui);
 const headers=nodes['#timetable'].children[0].children[0].children;
 assert.deepEqual(headers.flatMap((node,i)=>node.className==='today-head'?[i]:[]),column<0?[]:[column]);
}
console.log('PASS: today column moves to Thursday on Nov 12; no highlight outside the demo week/year.');
vm.runInContext("changeWeek('2026-11-18')",ui);
assert.equal(vm.runInContext('weekStart',ui),'2026-11-16');
assert.equal(vm.runInContext("Object.values(data).filter(s=>s.kind==='lesson').length",ui),0);
vm.runInContext("data[key('이광한',0,'6:00')]={kind:'open',memo:''};save();changeWeek('2026-11-09')",ui);
assert.notEqual(vm.runInContext("data[key('이광한',0,'6:00')].kind",ui),'open');
vm.runInContext("changeWeek('2026-11-16')",ui);
assert.equal(vm.runInContext("data[key('이광한',0,'6:00')].kind",ui),'open');
vm.runInContext("changeWeek('2027-01-01')",ui);
assert.equal(vm.runInContext('weekStart',ui),'2026-12-28');
assert.equal(vm.runInContext('dateAt(6)',ui),'2027-01-03');
console.log('PASS: week isolation, saved week restoration and year boundary navigation.');
vm.runInContext("changeWeek('2026-11-09');coach='이광한';openMemberCard(1,'7:40')",ui);
assert.equal(nodes['#member-card'].open,true);
assert.equal(nodes['#member-card-title'].textContent,data['이광한|1|7:40'].name);
nodes['#member-card-edit'].onclick();
assert.equal(nodes['#member-card'].open,false);
assert.equal(nodes['#editor'].open,true);
console.log('PASS: lesson cell opens member card and edit action opens the matching slot.');
ui.liveFixture={entries:[{id:'entry-1',start:'2026-11-17T10:00:00Z',end:'2026-11-17T10:20:00Z',type:'lesson',status:'open',coach:'신홍경',full:true}],bookings:[{id:'booking-1',start:'2026-11-17T10:00:00Z',member:'신희찬',status:'confirmed',attendance:'pending'}]};
ui.fetch=async()=>({ok:true,status:200,json:async()=>ui.liveFixture});
vm.runInContext("weekStart='2026-11-16'",ui);
(async()=>{
 await vm.runInContext('refreshLiveCalendar()',ui);
 const tuesday=nodes['#calendar-view'].children[1];
 const event=tuesday.children[1].children[0];
 assert.equal(event.children[0].textContent,'19:00 – 19:20');
 assert.equal(event.children[1].textContent,'신희찬');
 event.onclick();assert.equal(nodes['#member-card-title'].textContent,'신희찬');
 assert.equal(nodes['#stat-total'].children[0].textContent,'1');
 ui.liveFixture={entries:[],bookings:[]};await vm.runInContext('refreshLiveCalendar()',ui);
 assert.equal(nodes['#calendar-view'].children[1].children[1].children[0].textContent,'등록된 일정 없음');
 console.log('PASS: live API renders Korean-time bookings, member cards, counts and empty state.');
})().catch(error=>{console.error(error);process.exitCode=1;});
