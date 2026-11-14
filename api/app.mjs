import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAuthContext, AuthUnavailable, homeFor } from '../lib/supabase-auth.mjs';
const attempts = new Map();
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
// These files contain presentation code and synthetic demo data only. Serving
// them without an auth lookup avoids several Supabase round trips while a page
// is loading. Protected HTML and real coach data still require authorization.
const publicAssets = new Set(['coach.css', 'coach.js', 'coach-loader.js', 'coach-data.sample.js']);
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
    const session = JSON.stringify({
      name: account.name,
      role: account.role,
      home: homeFor(account),
      storageId: issueStorageId(account)
    }).replaceAll('<', '\\u003c');
    // Reuse the authorization result that was already needed to serve this
    // page. Client scripts no longer call /auth/session again after navigation.
    body = body.replace('</body>', `<script>window.RALLY_SESSION=Object.freeze(${session})</script><script src="/session-ui.js" defer></script></body>`);
  }
  return response(body, 200, { 'Content-Type': types[file.split('.').pop()] });
}
export async function handle(request, env = process.env, transport = fetch) {
  let auth;
  let result;
  try { result = await route(); }
  catch (error) { result = json({ error: error instanceof AuthUnavailable ? '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '요청 처리 중 문제가 발생했습니다.' }, error instanceof AuthUnavailable ? 503 : 500); }
  return auth ? auth.finish(result) : result;
  async function route() {
    const path = new URL(request.url).pathname;
    if (['/login', '/login.html', '/login.js', '/login.css', '/session-ui.js', '/date.js'].includes(path) && request.method === 'GET') {
      const file = path === '/login' ? 'login.html' : path.slice(1);
      return response(await readFile(join(process.cwd(), 'public', file), 'utf8'), 200, { 'Content-Type': types[file.split('.').pop()] });
    }
    const requestedFile = path.slice(1);
    if (request.method === 'GET' && publicAssets.has(requestedFile)) {
      return response(await readFile(join(process.cwd(), 'dist', requestedFile), 'utf8'), 200, {
        'Content-Type': types[requestedFile.split('.').pop()],
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        'Vary': 'Accept-Encoding'
      });
    }
    if (request.method === 'POST' && !sameOrigin(request)) return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403);
    try { auth = createAuthContext(request, env, transport); } catch {
      if (path === '/' || path === '/coach.html' || path === '/index.html') return redirect('/login.html');
      return json({ error: '로그인 계정이 아직 설정되지 않았습니다. 운영자에게 문의해 주세요.' }, 503);
    }
    if (path === '/auth/logout' && request.method === 'POST') {
      await auth.logout();
      return json({ ok: true });
    }
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
      const { account: user, error } = await auth.login(email, input.password);
      if (error === 'rate_limit') return json({ error: '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
      if (error === 'credentials') return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
      if (error === 'unassigned') return json({ error: '사용 가능한 회원 권한이 등록되지 않았습니다. 운영자에게 문의해 주세요.' }, 403);
      attempts.delete(email);
      return json({ redirect: homeFor(user) });
    }
    const account = await auth.account();
    if (path === '/auth/session' && request.method === 'GET') return account ? json({ name: account.name, role: account.role, home: homeFor(account), storageId: issueStorageId(account) }) : json({ error: '로그인이 필요합니다.' }, 401);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: '허용하지 않는 요청입니다.' }, 405);
    if (!account) return redirect('/login.html');
    if (path === '/') return redirect(homeFor(account));
    const file = path.slice(1);
    const coachResource = file === 'coach.html';
    const studentResource = file === 'index.html';
    if (!coachResource && !studentResource) return response('Not found', 404);
    if ((coachResource && account.role !== 'coach') || (studentResource && account.role !== 'student')) return response('접근 권한이 없습니다. 본인 역할의 화면을 이용해 주세요.', 403, { 'Content-Type': 'text/plain; charset=utf-8' });
    const result = await serve(file, account);
    return request.method === 'HEAD' ? new Response(null, { status: result.status, headers: result.headers }) : result;
  }
}
// A non-secret, account-specific key prevents demo state being shared across logins.
function issueStorageId(account) { return account.id; }
export default { fetch: request => handle(request) };
