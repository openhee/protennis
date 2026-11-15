import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('public/idle-session.js','utf8');
function setup(){
 let clock=10000000,tick;const events={},timers=[],calls=[],writes=[],redirects=[],parts={};
 class Node { open=false;style={};textContent='';disabled=false;setAttribute(){} querySelector(id){return parts[id] ||= new Node();}showModal(){this.open=true;}close(){this.open=false;}addEventListener(){} }
 const dialog=new Node();const server={deadline:clock+1800000,fail:false};
 const FakeDate=class extends Date {static now(){return clock;}};
 const document={hidden:false,body:{append(){}},createElement:()=>dialog,addEventListener:(name,fn)=>events[name]=fn};
 const window={RALLY_SESSION:{idleKey:'session',idleExpiresAt:new Date(server.deadline).toISOString(),serverNow:new Date(clock).toISOString()},addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(source,{Date:FakeDate,window,document,location:{replace:url=>redirects.push(url)},localStorage:{setItem:(...args)=>writes.push(args)},setInterval:fn=>tick=fn,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},fetch:async(url,options)=>{
 calls.push({url,options});const expired=clock>=server.deadline;
 if(!expired&&url==='/auth/activity')server.deadline=clock+1800000;
 return {status:expired?401:server.fail?503:200,ok:!expired&&!server.fail,json:async()=>({sessionId:'session',expiresAt:new Date(server.deadline).toISOString(),serverNow:new Date(clock).toISOString()})};
 }});
 return {events,parts,dialog,server,calls,writes,redirects,timers,window,advance(ms){clock+=ms;},tick:()=>tick()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('29-minute warning and 30-minute server-confirmed logout without activity heartbeats',async()=>{
 const p=setup();p.advance(29*60000);p.tick();assert.equal(p.dialog.open,true);assert.match(p.parts['#idle-countdown'].textContent,/60초/);assert.equal(p.calls.length,0);
 p.advance(60000);p.tick();await flush();assert.equal(p.calls[0].url,'/auth/idle');assert.equal(p.redirects[0],'/login.html?reason=idle');
});
test('keep-login renews before expiry, but waking after expiry cannot renew',async()=>{
 const p=setup();p.advance(29*60000);p.tick();await p.parts['#idle-keep'].onclick();assert.equal(p.dialog.open,false);assert.equal(p.calls[0].url,'/auth/activity');
 p.advance(31*60000);await p.parts['#idle-keep'].onclick();assert.equal(p.calls.at(-1).url,'/auth/idle');assert.equal(p.redirects.length,1);
});
test('trusted input renews, synthetic input does not; storage checks never echo broadcasts',async()=>{
 const p=setup();p.events.pointerdown({isTrusted:false});assert.equal(p.calls.length,0);
 p.events.pointerdown({isTrusted:true});await flush();assert.equal(p.calls[0].url,'/auth/activity');const writes=p.writes.length;
 p.events.storage({key:'rally-idle:session',newValue:JSON.stringify({expiresAt:'hint'})});await flush();assert.equal(p.calls.at(-1).url,'/auth/idle');assert.equal(p.writes.length,writes);
 p.events.storage({key:'rally-idle:session',newValue:'{"logout":true}'});assert.equal(p.redirects[0],'/login.html');
});
