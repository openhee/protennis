(() => {
  if (document.getElementById('rally-christmas-tree')) return;

  const style = document.createElement('style');
  style.textContent = `
    #rally-christmas-tree {
      --tree-width: 110px; --tree-height: 150px;
      position: fixed; left: 18px; bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      width: var(--tree-width); height: calc(var(--tree-height) + 28px);
      perspective: 650px; pointer-events: none; z-index: 21;
    }
    #rally-christmas-tree * { pointer-events: none; }
    .heading.rally-tree-heading { position: relative; }
    .rally-tree-heading #rally-christmas-tree {
      --tree-width: 80px; --tree-height: 84px;
      position: absolute; left: 52%; top: 50%; bottom: auto;
      transform: translate(-50%, -50%); z-index: 1;
    }
    .rally-tree-orbit {
      position: absolute; bottom: 0; width: 100%; height: var(--tree-height);
      transform-style: preserve-3d; animation: rally-tree-spin 12s linear infinite;
    }
    .rally-tree-light {
      position: absolute; left: 50%; bottom: var(--height); width: 5px; height: 5px;
      border-radius: 50%; background: var(--color); color: var(--color);
      box-shadow: 0 0 5px currentColor;
      transform: translateX(-50%) rotateY(var(--angle)) translateZ(var(--radius));
      animation: rally-tree-glow var(--tempo) ease-in-out var(--delay) infinite alternate;
    }
    .rally-tree-star {
      position: absolute; top: 0; left: calc(50% - 13px); width: 26px; height: 26px;
      filter: drop-shadow(0 0 5px #d5aa48);
    }
    .rally-tree-shadow {
      position: absolute; bottom: -3px; left: 10%; width: 80%; height: 10px;
      border-radius: 50%; background: radial-gradient(ellipse, #28533a25, transparent 70%);
    }
    #rally-christmas-tree.is-paused * { animation-play-state: paused; }
    @keyframes rally-tree-spin { to { transform: rotateY(360deg); } }
    @keyframes rally-tree-glow { from { opacity: .45; } to { opacity: 1; } }
    @media (max-width: 700px) {
      #rally-christmas-tree { --tree-width: 66px; --tree-height: 90px; left: 8px; }
      .rally-tree-light { width: 3px; height: 3px; }
      .heading.rally-tree-heading { padding-right: 70px; min-height: 100px; }
      .rally-tree-heading #rally-christmas-tree {
        --tree-width: 56px; --tree-height: 65px;
        left: auto; right: 0; transform: translateY(-50%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #rally-christmas-tree * { animation: none; }
    }
    @media print { #rally-christmas-tree { display: none; } }
  `;
  document.head.append(style);

  const tree = document.createElement('div');
  tree.id = 'rally-christmas-tree';
  tree.setAttribute('aria-hidden', 'true');
  tree.innerHTML = '<span class="rally-tree-shadow"></span><div class="rally-tree-orbit"></div><svg class="rally-tree-star" viewBox="0 0 32 32" focusable="false"><path d="M16 2 20 11 30 12 22 19 25 29 16 24 7 29 10 19 2 12 12 11Z" fill="#f4d47e" stroke="#b88b35" stroke-width="1.2"/></svg>';
  const orbit = tree.querySelector('.rally-tree-orbit');
  const palette = ['#bc5552', '#e0bc60', '#468b69', '#e8cf91'];
  for (let i = 0; i < 64; i++) {
    const fraction = i / 63;
    const light = document.createElement('span');
    light.className = 'rally-tree-light';
    light.style.cssText = `--height:${fraction * 96}%;--radius:calc(var(--tree-width) * ${(1 - fraction) * .45});--angle:${i * 28}deg;--color:${palette[i % palette.length]};--tempo:${2.5 + i % 5 * .6}s;--delay:-${i % 7}s;`;
    orbit.append(light);
  }
  const coachHeading = document.querySelector('main .heading');
  if (coachHeading) {
    coachHeading.classList.add('rally-tree-heading');
    coachHeading.append(tree);
  } else {
    document.body.append(tree);
  }
  const pause = () => tree.classList.toggle('is-paused', document.hidden);
  document.addEventListener('visibilitychange', pause);
  pause();
})();
