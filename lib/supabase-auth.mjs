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
    async studentDashboard(account, week, month, scope = 'all') {
      const start = day => day + 'T00:00:00+09:00';
      // Display a rolling seven-day window, but count allowances by Monday–Sunday.
      const monday = day => {
        const date = new Date(day + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
        return date.toISOString().slice(0,10);
      };
      const lastDay = new Date(Date.parse(start(week)) + 6 * 86400000 + 9 * 3600000).toISOString().slice(0,10);
      const countFrom = start(monday(week));
      const endWeek = new Date(Date.parse(start(monday(lastDay))) + 7 * 86400000).toISOString();
      const [year, number] = month.split('-').map(Number);
      const endMonth = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01`;
      // All queries use the signed-in user's JWT and existing RLS; no service key.
      const ownLessons = () => client.from('schedule_entries')
        .select('id,starts_at,ends_at,coach_id,bookings!inner(id,pass_id,status,attendance)')
        .eq('branch_id', account.branchId).eq('bookings.member_id', account.id)
        .neq('status', 'cancelled').order('starts_at');
      const results = await Promise.all([
        scope !== 'month' ? client.rpc('booking_dashboard', { day: week }) : {data:null},
        scope !== 'month' ? client.from('passes').select('id,product_id,agreed_weekdays,agreed_duration_minutes,agreed_sessions_per_week')
          .eq('branch_id', account.branchId).eq('member_id', account.id).eq('status', 'active') : {data:[]},
        scope !== 'week' ? ownLessons().gte('starts_at', start(month + '-01')).lt('starts_at', start(endMonth)) : {data:[]},
        scope === 'all' ? ownLessons().eq('bookings.status', 'confirmed').gte('starts_at', new Date().toISOString()).limit(1) : {data:[]},
        scope !== 'month' ? ownLessons().eq('bookings.status', 'confirmed').gte('starts_at', countFrom).lt('starts_at', endWeek) : {data:[]}
      ]);
      if (results.some(result => result.error)) throw new AuthUnavailable('Student dashboard lookup failed');
      const [dashboard, metadata, monthRows, nextRows, weekRows] = results.map(result => result.data);
      const flatten = rows => rows.flatMap(row => row.bookings.map(booking => ({
        ...booking, entry_id: row.id, start: row.starts_at, end: row.ends_at
      })));
      if (scope === 'month') return { calendar: flatten(monthRows) };
      return { ...dashboard,
        passes: dashboard.passes.map(pass => ({ ...pass, ...metadata.find(row => row.id === pass.id) })),
        ...(scope === 'all' ? { calendar: flatten(monthRows), next: flatten(nextRows)[0] || null } : {}),
        weekBookings: flatten(weekRows)
      };
    },
    async bookingRpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
    async schedules(account, from, until) {
      let query = client.from('schedule_entries')
        .select('id,coach_id,starts_at,ends_at,entry_type,status,capacity,booking_mode,product_id')
        .eq('branch_id', account.branchId).gte('starts_at', from).lt('starts_at', until)
        .order('starts_at').limit(1000);
      if (account.role === 'coach') query = query.eq('coach_id', account.id);
      const { data, error } = await query;
      if (error) throw new Error('Schedule lookup failed');
      return data;
    },
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
      // getClaims verifies asymmetric JWTs with Supabase's cached JWKS. Unlike
      // getUser, it does not need an Auth server round trip on every request.
      // Supabase still falls back to the Auth server for legacy symmetric keys.
      const { data, error } = await client.auth.getClaims();
      if (error) {
        if (error.status >= 500 || error.name === 'AuthRetryableFetchError') throw new AuthUnavailable('Auth unavailable');
        return null;
      }
      const claims = data?.claims;
      return profile(claims?.sub ? { id: claims.sub, is_anonymous: claims.is_anonymous === true } : null);
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
