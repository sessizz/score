// Yönetici başka bir kullanıcı adına giriş yaptığında sayfanın üstünde "yönetici hesabına dön" şeridi gösterir
(function () {
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function init() {
    let data;
    try {
      data = await (await fetch('/api/auth/me')).json();
    } catch (e) {
      return;
    }
    if (!data || !data.authenticated || !data.impersonator) return;

    const bar = document.createElement('div');
    bar.className = 'imp-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <span class="imp-text">👁️ <b>${esc(data.user.email)}</b> hesabındasınız</span>
      <button type="button" class="imp-btn">↩ Yönetici hesabına dön</button>`;
    document.body.prepend(bar);

    const style = document.createElement('style');
    style.textContent = `
      .imp-bar {
        position: sticky; top: 0; z-index: 3000;
        display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px 14px;
        padding: 8px 16px;
        background: var(--fb-yellow, #ffed00); color: #1a2846;
        font: 600 0.88rem var(--font-main, system-ui, sans-serif);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      }
      .imp-text { overflow-wrap: anywhere; text-align: center; }
      .imp-btn {
        padding: 5px 12px; border-radius: 6px; border: 1px solid #1a2846;
        background: #1a2846; color: #fff; font: inherit; font-weight: 800; cursor: pointer;
      }
      .imp-btn:hover { background: #22345c; }
      .imp-btn:disabled { opacity: 0.6; cursor: default; }`;
    document.head.appendChild(style);

    const btn = bar.querySelector('.imp-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await fetch('/api/auth/stop-impersonating', { method: 'POST' });
      } catch (e) {}
      window.location.href = '/admin';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
