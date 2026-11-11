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
vm.createContext(ui);vm.runInContext(code,ui);
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
console.log('PASS: UI initialization, coach switching, source details, attendance independent of planned session, browser storage and reset handlers.');
