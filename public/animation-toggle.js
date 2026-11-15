(() => {
  if (document.getElementById('animation-toggle')) return;
  const key = 'rally.decorations.enabled';
  let enabled = true;
  try { enabled = localStorage.getItem(key) !== 'false'; } catch {}

  const style = document.createElement('style');
  style.textContent = `
    html[data-decorations="off"] #autumn-leaves,
    html[data-decorations="off"] #rally-christmas-tree { display: none !important; }
    html[data-decorations="off"] #autumn-leaves *,
    html[data-decorations="off"] #rally-christmas-tree * { animation-play-state: paused !important; }
    #animation-toggle {
      position: fixed; right: 12px; bottom: calc(48px + env(safe-area-inset-bottom, 0px));
      z-index: 30; display: inline-flex; align-items: center; gap: 8px;
      min-height: 44px; padding: 8px 12px; border: 1px solid #dce4d6;
      border-radius: 24px; background: #fffffff2; color: #294d3d;
      font: 500 12px/1.4 system-ui, sans-serif; cursor: pointer;
      box-shadow: 0 2px 8px #203e2d0d;
    }
    #animation-toggle:focus-visible { outline: 2px solid #28543f; outline-offset: 3px; }
    #animation-toggle .animation-track {
      width: 28px; height: 16px; border-radius: 10px; background: #a9b1a7;
      position: relative; flex: none;
    }
    #animation-toggle .animation-track::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 12px; height: 12px; border-radius: 50%; background: white;
    }
    #animation-toggle[aria-checked="true"] .animation-track { background: #28543f; }
    #animation-toggle[aria-checked="true"] .animation-track::after { left: 14px; }
    @media print { #animation-toggle { display: none; } }
  `;
  document.head.append(style);
  const button = document.createElement('button');
  button.id = 'animation-toggle';
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', '낙엽과 트리 애니메이션');
  button.innerHTML = '<span>애니메이션</span><span class="animation-track" aria-hidden="true"></span><span class="animation-state" aria-hidden="true"></span>';
  const apply = () => {
    document.documentElement.dataset.decorations = enabled ? 'on' : 'off';
    button.setAttribute('aria-checked', String(enabled));
    button.querySelector('.animation-state').textContent = enabled ? '켬' : '끔';
  };
  apply();
  button.addEventListener('click', () => {
    enabled = !enabled;
    apply();
    try { localStorage.setItem(key, String(enabled)); } catch {}
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    enabled = event.newValue !== 'false';
    apply();
  });
  document.body.append(button);
})();
