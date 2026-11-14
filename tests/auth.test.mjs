import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handle } from '../api/app.mjs';
const env = { SUPABASE_URL: 'https://project.example.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const root = 'https://rally.example.test';
const signing = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicJwk = signing.publicKey.export({ format: 'jwk' });
const jwtHeader = { alg: 'ES256', kid: 'test-signing-key', typ: 'JWT' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function accessToken(user, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const unsigned = `${encode(jwtHeader)}.${encode({ sub: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', is_anonymous: user.is_anonymous, iss: `${env.SUPABASE_URL}/auth/v1`, iat: Math.floor(Date.now() / 1000), exp: expiresAt })}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: signing.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
function request(path, { method = 'GET', body, cookie, origin = root } = {}) {
  return new Request(root + path, { method, headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
const cookies = res => res.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
// Real SDK and cookie adapter; only the external HTTP boundary is mocked.
function backend(options = {}) {
  const state = { role: 'coach', memberActive: true, coachActive: true, assigned: true, revoked: false, failDB: false, refreshes: 0, userChecks: 0, ...options };
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'account@example.test', aud: 'authenticated', role: 'authenticated', is_anonymous: options.anonymous || false, user_metadata: { role: 'coach', ...(options.large ? { padding: 'x'.repeat(6000) } : {}) } };
  const session = () => { const expires_at = Math.floor(Date.now() / 1000) + 3600; return { access_token: accessToken(user, expires_at), refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, expires_at, user }; };
  const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const transport = async (url, options) => {
    const u = new URL(url); const headers = new Headers(options.headers);
    assert.equal(headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
    if (u.pathname === '/auth/v1/.well-known/jwks.json') return reply({ keys: [{ ...publicJwk, kid: jwtHeader.kid, alg: jwtHeader.alg, use: 'sig' }] });
    if (u.pathname === '/auth/v1/token') {
      const body = JSON.parse(options.body);
      if (u.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshes++;
        if (state.revoked || body.refresh_token !== 'refresh-token') return reply({ error_code: 'refresh_token_not_found', msg: 'invalid' }, 400);
      } else if (body.password !== 'correct-password') return reply({ error_code: 'invalid_credentials', msg: 'invalid' }, 400);
      state.revoked = false; return reply(session());
    }
    if (u.pathname === '/auth/v1/user') {
      state.userChecks++;
      return !state.revoked && headers.get('authorization')?.startsWith('Bearer ey') ? reply(user) : reply({ error_code: 'bad_jwt', msg: 'invalid' }, 401);
    }
    if (u.pathname === '/auth/v1/logout') { state.revoked = true; return new Response(null, { status: 204 }); }
    if (u.pathname.startsWith('/rest/v1/')) {
      assert.match(headers.get('authorization') || '', /^Bearer ey/);
      if (state.failDB) return reply({ message: 'database unavailable' }, 503);
      if (u.pathname === '/rest/v1/rpc/booking_dashboard') return reply({ passes: [], entries: [], bookings: [], products: [] });
      if (u.pathname === '/rest/v1/rpc/booking_action') return reply({ id: 'booking-id' });
      if (u.pathname.endsWith('/members')) {
        assert.equal(u.searchParams.get('auth_user_id'), 'eq.' + user.id); assert.equal(u.searchParams.get('status'), 'eq.active');
        return reply(state.assigned && state.memberActive ? [{ id: 'member-id', branch_id: 'branch-id', display_name: '테스트 계정', role: state.role, status: 'active' }] : []);
      }
      assert.equal(u.pathname, '/rest/v1/coaches');
      assert.equal(u.searchParams.get('member_id'), 'eq.member-id'); assert.equal(u.searchParams.get('branch_id'), 'eq.branch-id'); assert.equal(u.searchParams.get('active'), 'eq.true');
      return reply(state.coachActive ? [{ member_id: 'member-id' }] : []);
    }
    throw Error('Unexpected mock request');
  };
  return { state, session, run: (path, opts, config = env) => handle(request(path, opts), config, transport) };
}
async function login(b, extra = {}) {
  const res = await b.run('/auth/login', { method: 'POST', body: { email: 'account@example.test', password: 'correct-password', ...extra } });
  assert.equal(res.status, 200, await res.clone().text()); return { res, cookie: cookies(res) };
}
test('missing Supabase config fails closed; public login works; old env is ignored', async () => {
  const b = backend(); assert.equal((await b.run('/login.html', {}, {})).status, 200);
  assert.equal((await b.run('/', {}, {})).headers.get('location'), '/login.html');
  assert.equal((await b.run('/auth/login', { method: 'POST', body: {} }, { AUTH_SECRET: 'old-secret', AUTH_ACCOUNTS_JSON: '[]' })).status, 503);
});

test('live booking routes require authentication, matching role and same origin', async () => {
 const student=backend({role:'student'}),coach=backend();
 assert.equal((await student.run('/api/booking-dashboard?day=2026-11-16')).status,401);
 const {cookie}=await login(student),{cookie:coachCookie}=await login(coach);
 assert.equal((await student.run('/booking.html',{cookie})).status,200);
 assert.equal((await student.run('/api/booking-dashboard?day=invalid',{cookie})).status,400);
 assert.equal((await student.run('/api/booking-dashboard?day=2026-11-16',{cookie})).status,200);
 assert.equal((await student.run('/api/booking-action',{cookie,method:'POST',body:{action:'open',payload:{}}})).status,403);
 assert.equal((await coach.run('/api/booking-action',{cookie:coachCookie,method:'POST',body:{action:'reserve',payload:{}}})).status,403);
 assert.equal((await student.run('/api/booking-action',{cookie,method:'POST',origin:'https://evil.test',body:{action:'reserve',payload:{}}})).status,403);
 assert.equal((await student.run('/api/booking-action',{cookie,method:'POST',body:{action:'reserve',payload:{}}})).status,200);
});
test('unauthenticated pages require login while public presentation assets avoid auth lookups', async () => {
  const b = backend();
  for (const path of ['/', '/coach.html', '/index.html']) assert.equal((await b.run(path)).headers.get('location'), '/login.html');
  for (const path of ['/coach.css', '/coach.js', '/coach-loader.js', '/coach-data.sample.js']) assert.equal((await b.run(path)).status, 200);
  assert.equal(b.state.userChecks, 0);
  assert.equal((await b.run('/auth/session')).status, 401);
});
test('coach accesses only coach resources; secure cookies and minimal session response', async () => {
  const b = backend(); const { res, cookie } = await login(b); assert.equal((await res.json()).redirect, '/coach.html');
  for (const header of res.headers.getSetCookie()) { assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=Lax/); }
  const page = await b.run('/coach.html', { cookie }); assert.equal(page.status, 200); const html = await page.text(); assert.doesNotMatch(html, /href="index.html"/); assert.match(html, /window\.RALLY_SESSION=Object\.freeze/);
  for (const path of ['/coach.css', '/coach.js', '/coach-loader.js', '/coach-data.sample.js']) assert.equal((await b.run(path, { cookie })).status, 200);
  assert.equal((await b.run('/index.html', { cookie })).status, 403);
  for (const path of ['/dist/coach.html', '/coach-data.js', '/.env.local', '/api/app']) assert.equal((await b.run(path, { cookie })).status, 404);
  const session = await b.run('/auth/session', { cookie }); assert.match(session.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await session.json(), { name: '테스트 계정', role: 'coach', home: '/coach.html', storageId: 'member-id' }); assert.equal(b.state.userChecks, 0);
});
test('student cannot escalate with posted role or editable metadata', async () => {
  const b = backend({ role: 'student' }); const { cookie, res } = await login(b, { role: 'coach' }); assert.equal((await res.json()).redirect, '/booking.html');
  const legacy=await b.run('/index.html',{cookie});assert.equal(legacy.status,303);assert.equal(legacy.headers.get('location'),'/booking.html');
  assert.equal((await b.run('/',{cookie})).headers.get('location'),'/booking.html');
  const actual=await b.run('/booking.html',{cookie});assert.equal(actual.status,200);assert.doesNotMatch(await actual.text(),/지우|김민준|6\s*\/\s*8/);
  assert.equal((await b.run('/coach.html', { cookie })).status, 403);
  for (const path of ['/coach.js', '/coach-data.sample.js']) assert.equal((await b.run(path, { cookie })).status, 200);
});
test('unassigned, inactive, anonymous and unsupported admin users cannot log in', async () => {
  for (const options of [{ assigned: false }, { memberActive: false }, { coachActive: false }, { anonymous: true }, { role: 'admin' }]) {
    const b = backend(options); const res = await b.run('/auth/login', { method: 'POST', body: { email: 'unassigned@example.test', password: 'correct-password' } });
    assert.equal(res.status, 403); assert.ok(b.state.revoked); for (const h of res.headers.getSetCookie()) assert.match(h, /Max-Age=0/);
  }
});
test('DB permission changes apply immediately; DB failure denies access', async () => {
  const b = backend(); const { cookie } = await login(b);
  b.state.role = 'student'; assert.equal((await b.run('/coach.html', { cookie })).status, 403);
  b.state.memberActive = false; assert.equal((await b.run('/auth/session', { cookie })).status, 401);
  b.state.failDB = true; assert.equal((await b.run('/coach.html', { cookie })).status, 503);
});
test('forged and legacy cookies cannot authenticate', async () => {
  const b = backend(); const forged = { ...b.session(), access_token: 'forged', user: { id: 'forged', user_metadata: { role: 'coach' } } };
  const cookie = 'rally_auth=base64-' + Buffer.from(JSON.stringify(forged)).toString('base64url');
  assert.equal((await b.run('/auth/session', { cookie })).status, 401);
  assert.equal((await b.run('/auth/session', { cookie: 'rally_session=old-token' })).status, 401);
});
test('expired session refreshes and rotated cookies survive redirects', async () => {
  const b = backend(); const expired = { ...b.session(), expires_at: Math.floor(Date.now() / 1000) - 30 };
  const cookie = 'rally_auth=base64-' + Buffer.from(JSON.stringify(expired)).toString('base64url'); const res = await b.run('/', { cookie });
  assert.equal(res.status, 303); assert.equal(res.headers.get('location'), '/coach.html'); assert.equal(b.state.refreshes, 1);
  assert.ok(res.headers.getSetCookie().length > 0); assert.match(res.headers.get('cache-control'), /no-store/);
});
test('chunked sessions work; logout clears all chunks and revokes the session', async () => {
  const b = backend({ large: true }); const { cookie, res } = await login(b); assert.ok(res.headers.getSetCookie().length > 1);
  assert.equal((await b.run('/auth/session', { cookie })).status, 200);
  const out = await b.run('/auth/logout', { method: 'POST', cookie }); assert.equal(out.status, 200); assert.ok(b.state.revoked);
  assert.equal(out.headers.getSetCookie().length, res.headers.getSetCookie().length); for (const h of out.headers.getSetCookie()) assert.match(h, /Max-Age=0/);
  assert.equal((await b.run('/auth/session', { cookie: cookies(out) })).status, 401);
});
test('bad credentials, cross-origin mutations and malformed bodies fail', async () => {
  const b = backend(); assert.equal((await b.run('/auth/login', { method: 'POST', body: { email: 'bad@example.test', password: 'bad' } })).status, 401);
  for (const path of ['/auth/login', '/auth/logout']) assert.equal((await b.run(path, { method: 'POST', origin: 'https://evil.test', body: {} })).status, 403);
  assert.equal((await b.run('/auth/login', { method: 'POST', body: null })).status, 400);
  assert.equal((await b.run('/auth/login', { method: 'POST', body: { oversized: 'x'.repeat(5000) } })).status, 413);
});
test('repeated failed attempts are rate limited', async () => {
  const b = backend(); for (let i = 0; i < 10; i++) assert.equal((await b.run('/auth/login', { method: 'POST', body: { email: 'ratelimit@example.test', password: 'wrong' } })).status, 401);
  assert.equal((await b.run('/auth/login', { method: 'POST', body: { email: 'ratelimit@example.test', password: 'wrong' } })).status, 429);
});
test('Vercel serves protected content through auth handler', async () => {
  const cfg = JSON.parse(await readFile('vercel.json', 'utf8')); assert.equal(cfg.outputDirectory, 'public');
  assert.deepEqual(cfg.regions, ['sin1']);
  assert.deepEqual(cfg.rewrites, [{ source: '/(.*)', destination: '/api/app' }]); assert.ok(!cfg.functions['api/app.mjs'].includeFiles.includes('coach-data.js'));
});
