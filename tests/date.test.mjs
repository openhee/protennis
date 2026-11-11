import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile('public/date.js','utf8');
test('Korean calendar date changes at midnight KST, not midnight UTC',()=>{
 const context={window:{}};vm.runInNewContext(source,context);const date=context.window.RallyDate;
 assert.equal(date.key(new Date('2026-11-11T14:59:59Z')),'2026-11-11');
 assert.equal(date.key(new Date('2026-11-11T15:00:00Z')),'2026-11-12');
 assert.equal(date.key(new Date('2026-12-31T15:00:00Z')),'2027-01-01');
 assert.match(date.label(new Date('2026-11-11T15:00:00Z')),/목요일/);
 assert.equal(date.countdown('2026-11-12',new Date('2026-11-11T14:59:59Z')),'D-1');
 assert.equal(date.countdown('2026-11-12',new Date('2026-11-11T15:00:00Z')),'오늘');
 assert.equal(date.countdown('2026-11-12',new Date('2026-11-12T15:00:00Z')),'1일 전');
});
test('open page refreshes once on date rollover and when returning to tab',()=>{
 let now='2026-11-11T14:59:59Z',tick,visible,changed=0;
 class Clock extends Date { constructor(...args){super(...(args.length?args:[now]))} }
 const context={Date:Clock,window:{setInterval:fn=>{tick=fn},addEventListener(){}},document:{addEventListener:(_,fn)=>{visible=fn}}};
 vm.runInNewContext(source,context);context.window.RallyDate.watch(()=>changed++);
 tick();assert.equal(changed,0);now='2026-11-11T15:00:00Z';tick();assert.equal(changed,1);tick();assert.equal(changed,1);
 now='2026-11-12T15:00:00Z';visible();assert.equal(changed,2);
});
