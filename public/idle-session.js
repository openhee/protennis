(() => {
  const session = window.RALLY_SESSION;
  if (!session?.idleExpiresAt || !session.idleKey) return;
  const key = 'rally-idle:' + session.idleKey;
  let expires = Date.parse(session.idleExpiresAt);
  let offset = Date.parse(session.serverNow) - Date.now();
  let lastSent = 0, lastInput = 0, trailing, sending = false, leaving = false, checking = false;
  const now = () => Date.now() + offset;
  const badge = document.createElement('span');
  badge.id = 'session-remaining';
  badge.setAttribute('role', 'timer');
  badge.setAttribute('aria-live', 'off');
  badge.title = '아무 활동이 없으면 표시된 시간이 지난 뒤 로그아웃됩니다.';
  badge.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:30;padding:7px 11px;border:1px solid #dce5d7;border-radius:20px;background:#f7faf3;color:#49623f;font:12px/1.4 Arial,"Malgun Gothic",sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px #0000000a;pointer-events:none';
  document.body.append(badge);
  function updateBadge() {
    const seconds = Math.max(0, Math.ceil((expires - now()) / 1000));
    badge.textContent = '로그인 유지 ' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    badge.style.color = seconds <= 60 ? '#a63232' : '#49623f';
    badge.style.background = seconds <= 60 ? '#fff1ef' : '#f7faf3';
  }
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'idle-title');
  dialog.style.cssText = 'border:0;border-radius:16px;padding:28px;max-width:420px;width:90%;color:#214e3b';
  dialog.innerHTML = '<h2 id="idle-title">곧 자동 로그아웃됩니다</h2><p id="idle-countdown"></p><p id="idle-error" role="status"></p><button type="button" id="idle-keep">로그인 유지</button> <button type="button" id="idle-out">로그아웃</button>';
  document.body.append(dialog);
  const count = dialog.querySelector('#idle-countdown'), error = dialog.querySelector('#idle-error');
  const keep = dialog.querySelector('#idle-keep');
  function publish(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function leave(reason = 'idle', broadcast = true) {
    if (leaving) return;
    leaving = true; clearTimeout(trailing);
    if (broadcast) publish({ logout: true });
    location.replace('/login.html' + (reason === 'idle' ? '?reason=idle' : ''));
  }
  window.RALLY_LOGOUT = async () => {
    try {
      const response = await fetch('/auth/logout', { method: 'POST' });
      if (!response.ok) throw Error('로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
      leave('manual');
    } catch (e) { error.textContent = e.message; if (!dialog.open) dialog.showModal(); }
  };
  function accept(result, broadcast = true) {
    if (result.sessionId !== session.idleKey) { leave('manual', false); return; }
    expires = Date.parse(result.expiresAt);
    offset = Date.parse(result.serverNow) - Date.now();
    updateBadge();
    if (broadcast) publish(result);
    if (expires - now() > 60000 && dialog.open) dialog.close();
    error.textContent = '';
  }
  async function check() {
    if (checking || leaving) return;
    checking = true;
    try {
      const response = await fetch('/auth/idle', { cache: 'no-store' });
      if (response.status === 401) { leave(); return; }
      if (!response.ok) throw Error();
      accept(await response.json(), false);
    } catch { if (now() >= expires) leave(); }
    finally { checking = false; }
  }
  async function touch() {
    if (sending || leaving) return;
    if (now() >= expires) { await check(); return; }
    sending = true; lastSent = Date.now(); keep.disabled = true;
    try {
      const response = await fetch('/auth/activity', { method: 'POST' });
      if (response.status === 401) { leave(); return; }
      if (!response.ok) throw Error();
      accept(await response.json());
    } catch { error.textContent = '로그인 유지에 실패했습니다. 연결을 확인하고 다시 눌러 주세요.'; }
    finally { sending = false; keep.disabled = false; }
  }
  function activity(event) {
    if (!event.isTrusted || document.hidden || leaving || dialog.open) return;
    lastInput = Date.now();
    clearTimeout(trailing);
    if (lastInput - lastSent >= 30000) touch();
    // Persist the last interaction, not a periodic heartbeat. Navigation uses a flush below.
    trailing = setTimeout(() => { if (lastInput > lastSent) touch(); }, 1200);
  }
  for (const name of ['pointerdown', 'keydown', 'input']) document.addEventListener(name, activity, { passive: true });
  keep.onclick = () => touch();
  dialog.querySelector('#idle-out').onclick = () => window.RALLY_LOGOUT();
  dialog.addEventListener('cancel', event => event.preventDefault());
  function tick() {
    if (leaving) return;
    updateBadge();
    const left = expires - now();
    if (left <= 0) { check(); return; }
    if (left <= 60000) {
      count.textContent = Math.ceil(left / 1000) + '초 후 로그아웃됩니다. 계속 이용하려면 로그인 유지를 눌러 주세요.';
      if (!dialog.open) dialog.showModal();
    }
  }
  window.addEventListener('storage', event => {
    if (event.key !== key || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue);
      if (value.logout) leave('manual', false);
      // Storage notifications are hints only; the server remains authoritative.
      else check();
    } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { check(); tick(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) check(); });
  window.addEventListener('pagehide', () => {
    if (!leaving && !dialog.open && lastInput > lastSent && now() < expires)
      fetch('/auth/activity', { method: 'POST', keepalive: true }).catch(() => {});
  });
  setInterval(tick, 1000); // Local countdown only; no automatic activity heartbeat.
  tick();
})();
