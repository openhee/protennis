import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

export class AuthUnavailable extends Error {}
export const homeFor = account => account.role === 'coach' ? '/coach.html' : '/index.html';

export function createAuthContext(request, env = process.env, transport = fetch) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith('sb_publishable_') || new URL(url).protocol !== 'https:') {
    throw new AuthUnavailable('Supabase is not configured');
  }
  const secure = Boolean(env.VERCEL) || new URL(request.url).protocol === 'https:';
  const cookieJar = new Map(parseCookieHeader(request.headers.get('cookie') || '').map(c => [c.name, c.value || '']));
  const pending = new Map();
  const client = createServerClient(url, key, {
    cookieOptions: { name: 'rally_auth', path: '/', httpOnly: true, sameSite: 'lax', secure },
    global: { fetch: (url, options = {}) => transport(url, { ...options, signal: AbortSignal.timeout(10000) }) },
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          cookieJar.set(name, value);
          pending.set(name, serializeCookieHeader(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure, path: '/' }));
        }
      }
    }
  });

  async function profile(user) {
    if (!user || user.is_anonymous) return null;
    // Authorization is always read from server-managed rows, never user_metadata.
    const { data: member, error } = await client.from('members')
      .select('id,branch_id,display_name,role,status').eq('auth_user_id', user.id).eq('status', 'active').maybeSingle();
    if (error) throw new AuthUnavailable('Member lookup failed');
    if (!member || !['coach', 'student'].includes(member.role)) return null;
    if (member.role === 'coach') {
      const { data: coach, error } = await client.from('coaches').select('member_id')
        .eq('member_id', member.id).eq('branch_id', member.branch_id).eq('active', true).maybeSingle();
      if (error) throw new AuthUnavailable('Coach lookup failed');
      if (!coach) return null;
    }
    return { id: member.id, branchId: member.branch_id, name: member.display_name, role: member.role };
  }
  return {
    async login(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.status >= 500 || error.name === 'AuthRetryableFetchError') throw new AuthUnavailable('Auth unavailable');
        return { error: error.status === 429 ? 'rate_limit' : 'credentials' };
      }
      const account = await profile(data.user);
      if (!account) { await this.logout(); return { error: 'unassigned' }; }
      return { account };
    },
    async account() {
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (error.status >= 500 || error.name === 'AuthRetryableFetchError') throw new AuthUnavailable('Auth unavailable');
        return null;
      }
      return profile(data.user);
    },
    async logout() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new AuthUnavailable('Logout unavailable');
      for (const name of cookieJar.keys()) {
        if (name === 'rally_session' || name === 'rally_auth' || name.startsWith('rally_auth.')) {
          pending.set(name, serializeCookieHeader(name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax', secure }));
        }
      }
    },
    finish(response) {
      // Apply rotated/chunked cookies even on redirects and errors. Never cache sessions.
      for (const value of pending.values()) response.headers.append('Set-Cookie', value);
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      return response;
    }
  };
}
