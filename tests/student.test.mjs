import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile('dist/index.html','utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
class Element {
  children=[]; value=''; textContent=''; disabled=false; open=false;
  classList={toggle(){}};
  append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value;}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';this.value='';}
  setAttribute(){} addEventListener(){} showModal(){this.open=true;} close(){this.open=false;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('reservation starts today, moves forward seven days and cannot navigate into the past',async()=>{
 const p=page();await tick();
 assert.ok(p.calls[0].url.includes('week='+p.today));
 assert.equal(p.nodes.get('jump').min,p.today);assert.equal(p.nodes.get('previous').disabled,true);
 p.nodes.get('next-week').onclick();await tick();assert.equal(p.nodes.get('previous').disabled,false);
 p.nodes.get('today').onclick();await tick();assert.equal(p.nodes.get('jump').value,p.today);
 p.nodes.get('jump').value='2020-01-01';p.nodes.get('jump').onchange();await tick();assert.equal(p.nodes.get('jump').value,p.today);
});
function page(){
 const nodes=new Map();let init;const calls=[];
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const future=new Date(Date.now()+86400000).toISOString();
 const end=new Date(Date.parse(future)+1200000).toISOString();
 const state={fail:false,payload:{passes:[{id:'pass',product_id:'product',agreed_weekdays:[1,2,3,4,5,6,7],agreed_duration_minutes:20,agreed_sessions_per_week:2,name:'실제 수강권',from:'2020-01-01',until:'2099-12-31',remaining:4,held:1}],entries:[{id:'entry',product_id:'product',start:future,end,coach:'담당 코치',status:'open',type:'lesson',full:false}],bookings:[],calendar:[],weekBookings:[],next:{id:'later',pass_id:'pass',start:future,end,status:'confirmed'}}};
 const document={hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(){return new Element();},addEventListener(name,fn){if(name==='DOMContentLoaded')init=fn;}};
 const location={hash:'',replace(){}};
 const context={document,window:{RALLY_SESSION:{name:'신희찬'},addEventListener(){},scrollTo(){}},location,Intl,Date,crypto:{randomUUID:()=> 'request'},setInterval(){},fetch:async(url,opts)=>{calls.push({url,opts});return {status:state.fail?503:200,ok:!state.fail,json:async()=>state.fail?{error:'조회 오류'}:url.includes('booking-action')?{id:'reserved'}:state.payload};}};
 vm.runInNewContext(script,context);init();return {nodes,state,calls,today,future};
}
test('student dashboard renders real identity, credit balance, reservation and clears failed data',async()=>{
 const p=page();await tick();
 assert.equal(p.nodes.get('name').textContent,'신희찬 님');
 assert.equal(p.nodes.get('passes').children[0].children[1].textContent,'예약 가능 3회');
 p.nodes.get('jump').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(p.future));p.nodes.get('jump').onchange();await tick();
 const button=p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button')))[0];assert.equal(button.disabled,false);button.onclick();
 assert.match(p.nodes.get('summary').textContent,/실제 수강권.*예약 가능 2회/);
 await p.nodes.get('confirm').onclick();
 const call=p.calls.find(c=>c.url.includes('booking-action'));assert.deepEqual(JSON.parse(call.opts.body).payload,{entry_id:'entry',pass_id:'pass',request_id:'request'});
 p.state.fail=true;await p.nodes.get('reload').onclick();assert.equal(p.nodes.get('reserve-view').inert,true);assert.match(p.nodes.get('message').textContent,/조회 오류/);
});
test('expired and depleted passes disable booking before submission',async()=>{
 const p=page();p.state.payload.passes[0].remaining=1;await tick();
 p.nodes.get('jump').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(p.future));p.nodes.get('jump').onchange();await tick();
 assert.equal(p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button'))).length,0);
 p.nodes.get('show-unavailable').checked=true;p.nodes.get('show-unavailable').onchange();
 let button=p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button')))[0];assert.equal(button.disabled,true);assert.match(button.textContent,/횟수 소진/);
 p.state.payload.passes[0].until='2020-01-02';await p.nodes.get('reload').onclick();button=p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button')))[0];assert.match(button.textContent,/수강 기간 밖/);
});
test('home and reservation are separate; next lesson survives month navigation',async()=>{
 const p=page();await tick();const next=p.nodes.get('next-date').textContent;
 assert.equal(p.nodes.get('home-view').hidden,false);assert.equal(p.nodes.get('reserve-view').hidden,true);
 p.nodes.get('reserve-tab').onclick();assert.equal(p.nodes.get('home-view').hidden,true);assert.equal(p.nodes.get('reserve-view').hidden,false);
 p.nodes.get('month-prev').onclick();await tick();assert.equal(p.nodes.get('next-date').textContent,next);
 assert.ok(p.nodes.get('month-days').children.length>=35);
 assert.equal(p.nodes.get('pass-picker').hidden,true);
});
test('weekly allowance and wrong weekday hide unavailable slots',async()=>{
 const p=page();await tick();p.nodes.get('jump').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(p.future));p.nodes.get('jump').onchange();await tick();
 p.state.payload.weekBookings=[{pass_id:'pass',start:p.future,end:p.future},{pass_id:'pass',start:p.future,end:p.future}];await p.nodes.get('reload').onclick();assert.equal(p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button'))).length,0,p.nodes.get('message').textContent);
 p.state.payload.weekBookings=[];p.state.payload.passes[0].agreed_weekdays=[];await p.nodes.get('reload').onclick();assert.equal(p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button'))).length,0);
});
test('previous calendar week reservations do not exhaust the next week allowance',async()=>{
 const p=page();await tick();
 const earlier=new Date(Date.parse(p.future)-7*86400000).toISOString();
 p.state.payload.weekBookings=[{pass_id:'pass',start:earlier,end:earlier},{pass_id:'pass',start:earlier,end:earlier}];
 p.nodes.get('jump').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(p.future));p.nodes.get('jump').onchange();await tick();
 assert.equal(p.nodes.get('week-grid').children.flatMap(column=>column.children.filter(node=>node.className?.startsWith('time-button')))[0].disabled,false);
});
test('navigation caches weeks and months, tabs do not fetch, and no polling timer is installed',async()=>{
 const p=page();await tick();const initial=p.calls.length;
 p.nodes.get('reserve-tab').onclick();p.nodes.get('home-tab').onclick();assert.equal(p.calls.length,initial);
 p.nodes.get('next-week').onclick();await tick();assert.match(p.calls.at(-1).url,/scope=week/);
 const afterWeek=p.calls.length;p.nodes.get('previous').onclick();await tick();assert.equal(p.calls.length,afterWeek);
 p.nodes.get('month-next').onclick();await tick();assert.match(p.calls.at(-1).url,/scope=month/);
 const afterMonth=p.calls.length;p.nodes.get('month-prev').onclick();await tick();assert.equal(p.calls.length,afterMonth);
 assert.doesNotMatch(script,/setInterval\(/);
});
