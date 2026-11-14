// Local source data is excluded from Git. Fall back to synthetic demo data.
(async function () {
  // The server protects coach.html and embeds the verified account. This
  // loader only namespaces browser-only demo state for that account.
  try {
    // coach.html embeds the session it has already verified. The fallback
    // supports an older cached page while a new deployment rolls out.
    let session = window.RALLY_SESSION;
    if (!session) {
      const response = await fetch('/auth/session', { cache: 'no-store' });
      if (!response.ok) { location.replace('/login.html'); return; }
      session = await response.json();
    }
    if (session.role !== 'coach') { location.replace(session.home); return; }
    window.RALLY_ACCOUNT = session.storageId;
    window.RALLY_COACH_NAME = session.name;
  } catch {
    document.querySelector('.source-note p').textContent = '로그인 상태를 확인하지 못했습니다. 연결을 확인하고 새로고침해 주세요.';
    return;
  }
  function load(src, success, failure) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = success;
    script.onerror = failure || (() => {});
    document.head.append(script);
  }
  function start() { load('coach.js'); }
  load('coach-data.js', start, () => load('coach-data.sample.js', () => {
    document.querySelector('.source-note p').textContent = '가상 회원으로 구성한 시연 데이터입니다. 실제 레슨생 정보와 연결되지 않습니다. 변경 내용은 이 브라우저에만 저장됩니다.';
    start();
  }));
})();
