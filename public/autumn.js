(() => {
  if (document.getElementById('autumn-leaves')) return;

  const style = document.createElement('style');
  style.textContent = `
    #autumn-leaves { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 20; }
    #autumn-leaves * { pointer-events: none; }
    .autumn-leaf { position: absolute; top: -40px; left: var(--left); opacity: 0; animation: autumn-fall var(--duration) linear var(--delay) infinite; }
    .autumn-leaf svg { display: block; width: var(--size); height: var(--size); animation: autumn-sway 5s ease-in-out var(--delay) infinite alternate; }
    #autumn-leaves.is-paused, #autumn-leaves.is-paused * { animation-play-state: paused; }
    @keyframes autumn-fall {
      0% { transform: translate3d(0, -30px, 0); opacity: 0; }
      8%, 85% { opacity: .48; }
      100% { transform: translate3d(16px, calc(100vh + 80px), 0); opacity: 0; }
    }
    @keyframes autumn-sway {
      from { transform: translateX(-12px) rotate(-30deg) rotateY(0deg); }
      to { transform: translateX(12px) rotate(55deg) rotateY(45deg); }
    }
    @media (max-width: 700px) {
      .autumn-leaf:nth-child(n+5) { display: none; }
    }
    @media (prefers-reduced-motion: reduce), print {
      #autumn-leaves { display: none; }
      #autumn-leaves * { animation: none; }
    }
  `;
  document.head.append(style);

  const layer = document.createElement('div');
  layer.id = 'autumn-leaves';
  layer.setAttribute('aria-hidden', 'true');
  // Keep the decoration at the edges, away from the calendar and lesson cards.
  const positions = ['1%', '96%', '3%', '93%', '5%', '98%', '2%', '95%'];
  const colors = ['#b87932', '#c7a24b', '#a85f37', '#c99042'];
  positions.forEach((left, i) => {
    const leaf = document.createElement('span');
    leaf.className = 'autumn-leaf';
    leaf.style.cssText = `--left:${left};--duration:${22 + i * 2}s;--delay:-${i * 5 + 3}s;--size:${16 + i % 3 * 3}px;`;
    leaf.innerHTML = `<svg viewBox="0 0 32 40" focusable="false" aria-hidden="true"><path d="M16 2C10 8 2 11 4 21c1 8 9 12 13 12 8-4 13-11 10-18C25 9 19 6 16 2Z" fill="${colors[i % colors.length]}"/><path d="M16 9c-2 11-1 21 3 29M15 18l-6-5m7 12 7-8" fill="none" stroke="#79552f" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    layer.append(leaf);
  });
  document.body.append(layer);
  const pause = () => layer.classList.toggle('is-paused', document.hidden);
  document.addEventListener('visibilitychange', pause);
  pause();
})();
