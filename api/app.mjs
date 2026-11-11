import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configuration, checkPassword, hashPassword, issueSession, readSession, cookie, homeFor } from '../lib/auth.mjs';
const attempts = new Map();
const dummyHash = hashPassword('not-a-real-account-password', '00000000000000000000000000000000');
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const assets = new Set(['coach.css', 'coach.js', 'coach-loader.js', 'coach-data.sample.js']);
const security = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function response(body, status = 200, headers = {}) { return new Response(body, { status, headers: { ...security, ...headers } }); }
function json(body, status = 200, headers = {}) { return response(JSON.stringify(body), status, { 'Content-Type': 'application/json', ...headers }); }
function redirect(path) { return response(null, 303, { Location: path }); }
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
async function serve(file, account) {
  let body = await readFile(join(process.cwd(), 'dist', file), 'utf8');
  if (file.endsWith('.html')) {
    // Remove cross-role navigation. Authorization is also enforced below on every request.
    if (account.role === 'coach') body = body.replace('<a href="index.html">↗　레슨생 화면</a>', '');
    body = body.replace('</body>', '<script src="/session-ui.js" defer></script></body>');
  }
  return response(body, 200, { 'Content-Type': types[file.split('.').pop()] });
}
export async function handle(request, env = process.env) {
  try {
    const path = new URL(request.url).pathname;
    if (['/login', '/login.html', '/login.js', '/login.css', '/session-ui.js', '/date.js'].includes(path) && request.method === 'GET') {
      const file = path === '/login' ? 'login.html' : path.slice(1);
      return response(await readFile(join(process.cwd(), 'public', file), 'utf8'), 200, { 'Content-Type': types[file.split('.').pop()] });
    }
    if (path === '/auth/logout' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, true) });
    }
    let config;
    try { config = configuration(env); } catch {
      if (path === '/' || path === '/coach.html' || path === '/index.html') return redirect('/login.html');
      return json({ error: '로그인 계정이 아직 설정되지 않았습니다. 운영자에게 문의해 주세요.' }, 503);
    }
    const account = readSession(request, config);
    if (path === '/auth/login' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: '잘못된 요청입니다.' }, 415);
      if (+request.headers.get('content-length') > 4096) return json({ error: '요청이 너무 큽니다.' }, 413);
      const text = await request.text();
      if (text.length > 4096) return json({ error: '요청이 너무 큽니다.' }, 413);
      let input;
      try { input = JSON.parse(text); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }
      if (!input || typeof input.email !== 'string' || typeof input.password !== 'string' || input.email.length > 254 || input.password.length > 256) return json({ error: '이메일과 비밀번호를 확인해 주세요.' }, 400);
      const email = input.email.trim().toLowerCase();
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
      if (attempts.size > 10000) return json({ error: '잠시 후 다시 시도해 주세요.' }, 429);
      const attempt = attempts.get(email) || { count: 0, until: now + 15 * 60 * 1000 };
      if (attempt.count >= 10) return json({ error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' }, 429, { 'Retry-After': '900' });
      attempt.count++; attempts.set(email, attempt);
      const user = config.accounts.find(a => a.email === email);
      const valid = await checkPassword(input.password, user?.passwordHash || await dummyHash);
      if (!user || !valid) return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
      attempts.delete(email);
      return json({ redirect: homeFor(user) }, 200, { 'Set-Cookie': cookie(issueSession(user, config), request) });
    }
    if (path === '/auth/session' && request.method === 'GET') return account ? json({ name: account.name, role: account.role, home: homeFor(account), storageId: issueStorageId(account) }) : json({ error: '로그인이 필요합니다.' }, 401);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: '허용하지 않는 요청입니다.' }, 405);
    if (!account) return redirect('/login.html');
    if (path === '/') return redirect(homeFor(account));
    const file = path.slice(1);
    const coachResource = file === 'coach.html' || assets.has(file);
    const studentResource = file === 'index.html';
    if (!coachResource && !studentResource) return response('Not found', 404);
    if ((coachResource && account.role !== 'coach') || (studentResource && account.role !== 'student')) return response('접근 권한이 없습니다. 본인 역할의 화면을 이용해 주세요.', 403, { 'Content-Type': 'text/plain; charset=utf-8' });
    const result = await serve(file, account);
    return request.method === 'HEAD' ? new Response(null, { status: result.status, headers: result.headers }) : result;
  } catch { return json({ error: '요청 처리 중 문제가 발생했습니다.' }, 500); }
}
// A non-secret, account-specific key prevents demo state being shared across logins.
function issueStorageId(account) { return Buffer.from(account.email).toString('base64url'); }
export default { fetch: request => handle(request) };
