import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { hashPassword, configuration } from '../lib/auth.mjs';
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback()}});
const rl=createInterface({input:process.stdin,output,terminal:true});
try{
 let env={};
 try{env=parseEnv(await readFile('.env.local','utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
 const existing=env.AUTH_ACCOUNTS_JSON?JSON.parse(env.AUTH_ACCOUNTS_JSON):[];
 const email=(await rl.question('로그인 이메일: ')).trim().toLowerCase();
 const name=(await rl.question('표시 이름: ')).trim();
 const role=(await rl.question('역할 (coach/student, 기본 coach): ')).trim()||'coach';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||!['coach','student'].includes(role))throw Error('이메일, 이름 또는 역할을 확인하세요.');
 if(existing.some(a=>a.email===email))throw Error('같은 이메일이 이미 등록되어 있습니다. 기존 설정은 변경하지 않았습니다.');
 process.stdout.write('비밀번호 (12자 이상, 입력 숨김): ');muted=true;
 const password=await rl.question('');muted=false;process.stdout.write('\n');
 process.stdout.write('비밀번호 확인: ');muted=true;
 const repeat=await rl.question('');muted=false;process.stdout.write('\n');
 if(password.length<12||password.length>256||password!==repeat)throw Error('비밀번호가 짧거나 일치하지 않습니다. 설정은 저장하지 않았습니다.');
 const accounts=[...existing,{email,name,role,passwordHash:await hashPassword(password)}];
 const secret=env.AUTH_SECRET||randomBytes(48).toString('base64url');
 configuration({AUTH_SECRET:secret,AUTH_ACCOUNTS_JSON:JSON.stringify(accounts)});
 await writeFile('.env.local',`AUTH_SECRET=${secret}\nAUTH_ACCOUNTS_JSON='${JSON.stringify(accounts).replaceAll("'",'\\u0027')}'\n`,{mode:0o600});
 console.log('계정을 .env.local에 저장했습니다. 비밀번호 원문은 저장하지 않았습니다.');
 console.log('Vercel의 Environment Variables에 AUTH_SECRET 및 AUTH_ACCOUNTS_JSON 값을 등록하고 재배포하세요. JSON 값의 바깥 작은따옴표는 제외합니다.');
}catch(error){console.error(error.message);process.exitCode=1}finally{muted=false;rl.close()}
