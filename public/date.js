// Calendar dates always follow the academy's timezone, not the viewer's timezone.
(function () {
  const zone = 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  function key(now = new Date()) {
    const values = Object.fromEntries(parts.formatToParts(now).map(p => [p.type, p.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function label(now = new Date()) {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: zone, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  }
  function countdown(date, now = new Date()) {
    const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(key(now) + 'T00:00:00Z')) / 86400000);
    return days === 0 ? '오늘' : days > 0 ? `D-${days}` : `${-days}일 전`;
  }
  function watch(callback) {
    let previous = key();
    function refresh() { const current = key(); if (current !== previous) { previous = current; callback(); } }
    if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', refresh);
    if (typeof window.addEventListener === 'function') window.addEventListener('pageshow', refresh);
    if (typeof window.setInterval === 'function') window.setInterval(refresh, 30000);
  }
  window.RallyDate = { key, label, countdown, watch };
})();
