// Local source data is excluded from Git. Fall back to synthetic demo data.
(function () {
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
