import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handle } from '../api/app.mjs';
import { hashPassword, configuration, issueSession, readSession, TTL } from '../lib/auth.mjs';
const password='test-only-long-password';
const accounts=[
  {email:'coach@example.test',name:'테스트 코치',role:'coach',passwordHash:await hashPassword(password)},
  {email:'student@example.test',name:'테스트 회원',role:'student',passwordHash:await hashPassword(password)}
];
const env={AUTH_SECRET:'test-only-secret-that-is-not-used-for-any-deployment',AUTH_ACCOUNTS_JSON:JSON.stringify(accounts)};
const config=configuration(env);
const root='https://rally.example.test';
function request(path,{method='GET',body,cookie,origin=root,headers={}}={}){
 return new Request(root+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
async function login(role='coach',extra={}){
 const result=await handle(request('/auth/login',{method:'POST',body:{email:role+'@example.test',password,...extra}}),env);
 assert.equal(result.status,200);
 return {result,cookie:result.headers.get('set-cookie').split(';')[0]};
}
test('login page available without account settings; unset server fails closed',async()=>{
 assert.equal((await handle(request('/login.html'),{})).status,200);
 const home=await handle(request('/'),{});assert.equal(home.headers.get('location'),'/login.html');
 assert.equal((await handle(request('/auth/login',{method:'POST',body:{email:'x',password:'x'}}),{})).status,503);
});
test('unauthenticated page and data requests require login',async()=>{
 for(const path of ['/','/coach.html','/index.html','/coach-data.sample.js','/coach.js']){
  const res=await handle(request(path),env);assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/login.html');
 }
 assert.equal((await handle(request('/auth/session'),env)).status,401);
});
test('coach can access only coach page and assets, including direct URL checks',async()=>{
 const {result,cookie}=await login();
 assert.equal((await result.json()).redirect,'/coach.html');
 assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(result.headers.get('set-cookie'),/Secure/);
 const page=await handle(request('/coach.html',{cookie}),env);assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);
 assert.doesNotMatch(await page.text(),/href="index.html"/);
 for(const path of ['/coach.css','/coach.js','/coach-loader.js','/coach-data.sample.js'])assert.equal((await handle(request(path,{cookie}),env)).status,200);
 assert.equal((await handle(request('/index.html',{cookie}),env)).status,403);
 assert.equal((await handle(request('/',{cookie}),env)).headers.get('location'),'/coach.html');
 for(const path of ['/dist/coach.html','/dist/index.html','/dist/coach-data.js','/coach-data.js','/.env.local','/api/app'])assert.equal((await handle(request(path,{cookie}),env)).status,404);
 const session=await (await handle(request('/auth/session',{cookie}),env)).json();assert.equal(session.role,'coach');assert.equal(session.passwordHash,undefined);
});
test('student cannot read coach pages or data; posted role is ignored',async()=>{
 const {cookie,result}=await login('student',{role:'coach'});
 assert.equal((await result.json()).redirect,'/index.html');
 assert.equal((await handle(request('/index.html',{cookie}),env)).status,200);
 for(const path of ['/coach.html','/coach-data.sample.js','/coach.js'])assert.equal((await handle(request(path,{cookie}),env)).status,403);
});
test('invalid, modified, expired and revoked sessions are rejected',async()=>{
 const token=issueSession(config.accounts[0],config);
 assert.ok(readSession(request('/',{cookie:'rally_session='+token}),config));
 for(const invalid of ['coach','unsigned-token',token+'x',token.split('.')[0]+'.AAAA'])assert.equal(readSession(request('/',{cookie:'rally_session='+invalid}),config),null);
 const expired=issueSession(config.accounts[0],config,Date.now()-(TTL+5)*1000);
 assert.equal(readSession(request('/',{cookie:'rally_session='+expired}),config),null);
 const changed=configuration({...env,AUTH_ACCOUNTS_JSON:JSON.stringify([{...accounts[0],role:'student'}])});
 assert.equal(readSession(request('/',{cookie:'rally_session='+token}),changed),null);
 assert.equal(readSession(request('/',{cookie:'rally_session='+token}),{...config,accounts:[]}),null);
});
test('bad credentials and cross-origin mutations fail; logout expires the cookie',async()=>{
 const res=await handle(request('/auth/login',{method:'POST',body:{email:accounts[0].email,password:'wrong'}}),env);assert.equal(res.status,401);assert.equal(res.headers.get('set-cookie'),null);
 for(const path of ['/auth/login','/auth/logout'])assert.equal((await handle(request(path,{method:'POST',origin:'https://other.example',body:{}}),env)).status,403);
 assert.equal((await handle(request('/auth/login',{method:'POST',body:null}),env)).status,400);
 const {cookie}=await login();const out=await handle(request('/auth/logout',{method:'POST',cookie}),env);
 assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await handle(request('/auth/session',{cookie:'rally_session='}),env)).status,401);
});
test('repeated failed login attempts receive a rate limit',async()=>{
 for(let i=0;i<10;i++)assert.equal((await handle(request('/auth/login',{method:'POST',body:{email:'unknown@example.test',password:'wrong'}}),env)).status,401);
 assert.equal((await handle(request('/auth/login',{method:'POST',body:{email:'unknown@example.test',password:'wrong'}}),env)).status,429);
});
test('deployment publishes only login assets, routes everything through server',async()=>{
 const cfg=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(cfg.outputDirectory,'public');
 assert.deepEqual(cfg.rewrites,[{source:'/(.*)',destination:'/api/app'}]);
 assert.ok(!cfg.functions['api/app.mjs'].includeFiles.includes('coach-data.js'));
});
