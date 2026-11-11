import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword, configuration } from '../lib/auth.mjs';
const [email,name]=process.argv.slice(2);
if(!email||!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Usage: node scripts/create-initial-coach.mjs email name');
try{await access('.env.local');throw Error('Existing .env.local found; no changes made.')}catch(error){if(error.code!=='ENOENT')throw error}
const password=randomBytes(18).toString('base64url');
const env={AUTH_SECRET:randomBytes(48).toString('base64url'),AUTH_ACCOUNTS_JSON:JSON.stringify([{email:email.trim().toLowerCase(),name,role:'coach',passwordHash:await hashPassword(password)}])};
configuration(env);
await mkdir('outputs',{recursive:true});
await writeFile('.env.local',`AUTH_SECRET=${env.AUTH_SECRET}\nAUTH_ACCOUNTS_JSON='${env.AUTH_ACCOUNTS_JSON.replaceAll("'",'\\u0027')}'\n`,{flag:'wx',mode:0o600});
await writeFile('outputs/login-setup.txt',`랠리 코치 로그인 안내 (로컬 보관용, 공유 금지)\n\n이메일: ${email}\n표시 이름: ${name}\n역할: coach\n비밀번호: ${password}\n\n로컬 실행: npm run dev\n로그인: http://localhost:3000/login.html\n\nVercel 활성화:\n1. .env.local의 AUTH_SECRET, AUTH_ACCOUNTS_JSON 값을 Settings > Environment Variables에 각각 등록합니다. JSON을 감싸는 바깥 작은따옴표는 제외합니다.\n2. Output Directory가 public인지 확인하고 Redeploy합니다.\n3. 배포된 주소의 /login.html에서 위 계정으로 로그인합니다.\n\n이 파일과 .env.local은 Git 제외 대상입니다.\n`,{flag:'wx',mode:0o600});
console.log('Created coach account configuration and outputs/login-setup.txt. No credentials printed.');
