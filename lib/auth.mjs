import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const COOKIE = 'rally_session';
export const TTL = 8 * 60 * 60;
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(password, encoded) {
  const [, salt, hash] = encoded.split(':');
  const actual = await hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(actual.split(':')[2], 'hex'), Buffer.from(hash, 'hex'));
}
export function configuration(env = process.env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error('Authentication is not configured');
  const accounts = JSON.parse(env.AUTH_ACCOUNTS_JSON || '[]');
  if (!Array.isArray(accounts) || !accounts.length || accounts.length > 100) throw new Error('Invalid accounts');
  const seen = new Set();
  for (const account of accounts) {
    if (typeof account.email !== 'string' || typeof account.name !== 'string' || !['coach', 'student'].includes(account.role) || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.passwordHash || '')) throw new Error('Invalid account');
    account.email = account.email.trim().toLowerCase();
    if (seen.has(account.email)) throw new Error('Duplicate account');
    seen.add(account.email);
  }
  return { secret: env.AUTH_SECRET, accounts };
}
const sign = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');
const revision = (account, secret) => sign(`${account.email}:${account.role}:${account.passwordHash}`, secret);
export function issueSession(account, config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: account.email, exp: Math.floor(now / 1000) + TTL, rev: revision(account, config.secret), nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${sign(payload, config.secret)}`;
}
export function readSession(request, config, now = Date.now()) {
  try {
    const token = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!token || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const signature = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(sign(parts[0], config.secret), 'base64url');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    const account = config.accounts.find(a => a.email === payload.sub);
    return account && payload.rev === revision(account, config.secret) ? account : null;
  } catch { return null; }
}
export function cookie(value, request, expired = false) {
  const secure = process.env.VERCEL || new URL(request.url).protocol === 'https:';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expired ? 0 : TTL}${secure ? '; Secure' : ''}`;
}
export const homeFor = account => account.role === 'coach' ? '/coach.html' : '/index.html';
