// Sistem confirm() yerine tema uyumlu onay penceresi
(function () {
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // opts: { icon, title, bodyHtml, confirmText, cancelText, tone: 'primary' | 'danger' }
  function appConfirm(opts) {
    return new Promise((resolve) => {
      const tone = opts.tone === 'danger' ? 'danger' : 'primary';
      const backdrop = document.createElement('div');
      backdrop.className = 'cd-backdrop';
      backdrop.innerHTML = `
        <div class="cd-box" role="dialog" aria-modal="true">
          <div class="cd-head">
            <span class="cd-icon cd-${tone}">${opts.icon || '❓'}</span>
            <h3 class="cd-title">${esc(opts.title)}</h3>
          </div>
          <div class="cd-body">${opts.bodyHtml || ''}</div>
          <div class="cd-actions">
            <button type="button" class="cd-btn cd-cancel">${esc(opts.cancelText || 'Vazgeç')}</button>
            <button type="button" class="cd-btn cd-confirm cd-${tone}">${esc(opts.confirmText || 'Tamam')}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add('cd-open'));

      const prevFocus = document.activeElement;
      const btnOk = backdrop.querySelector('.cd-confirm');
      const btnNo = backdrop.querySelector('.cd-cancel');
      btnNo.focus();

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.remove('cd-open');
        setTimeout(() => backdrop.remove(), 160);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(false);
        } else if (e.key === 'Enter' && document.activeElement !== btnNo) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }
      document.addEventListener('keydown', onKey, true);
      btnOk.addEventListener('click', () => close(true));
      btnNo.addEventListener('click', () => close(false));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    });
  }


  // Metin girişli pencere. opts: { icon, title, bodyHtml, label, placeholder, value, confirmText, validate }
  // validate(value) -> Promise<string> : boş string = geçerli, dolu string = hata mesajı
  // Sonuç: girilen metin ya da iptalde null
  function appPrompt(opts) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'cd-backdrop';
      backdrop.innerHTML = `
        <form class="cd-box" role="dialog" aria-modal="true" autocomplete="off">
          <div class="cd-head">
            <span class="cd-icon cd-primary">${opts.icon || '✏️'}</span>
            <h3 class="cd-title">${esc(opts.title)}</h3>
          </div>
          <div class="cd-body">${opts.bodyHtml || ''}</div>
          <label class="cd-label">${esc(opts.label || '')}</label>
          <input class="cd-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false"
                 placeholder="${esc(opts.placeholder || '')}" value="${esc(opts.value || '')}" maxlength="64">
          <div class="cd-error" aria-live="polite"></div>
          <div class="cd-actions">
            <button type="button" class="cd-btn cd-cancel">Vazgeç</button>
            <button type="submit" class="cd-btn cd-confirm cd-primary">${esc(opts.confirmText || 'Tamam')}</button>
          </div>
        </form>`;
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add('cd-open'));

      const form = backdrop.querySelector('form');
      const input = backdrop.querySelector('.cd-input');
      const errEl = backdrop.querySelector('.cd-error');
      const btnOk = backdrop.querySelector('.cd-confirm');
      const btnNo = backdrop.querySelector('.cd-cancel');
      let busy = false;
      setTimeout(() => { input.focus(); input.select(); }, 60);

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.remove('cd-open');
        setTimeout(() => backdrop.remove(), 160);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape' && opts.dismissible !== false) { e.preventDefault(); close(null); }
      }
      document.addEventListener('keydown', onKey, true);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        const value = input.value.trim();
        if (!value) { errEl.textContent = 'Bir kod girin.'; return; }
        busy = true;
        btnOk.disabled = true;
        btnOk.textContent = 'Kontrol ediliyor...';
        errEl.textContent = '';
        let err = '';
        try {
          err = opts.validate ? await opts.validate(value) : '';
        } catch (ex) {
          err = 'Bağlantı hatası, tekrar deneyin.';
        }
        busy = false;
        btnOk.disabled = false;
        btnOk.textContent = opts.confirmText || 'Tamam';
        if (err) { errEl.textContent = err; input.focus(); return; }
        close(value);
      });
      btnNo.addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop && opts.dismissible !== false) close(null); });
    });
  }

  // Set bitirme onayı: iki takımın skoru, kazanan vurgulu
  function confirmEndSet(board) {
    const a = board.teamA;
    const b = board.teamB;
    const tie = a.points === b.points;
    const winnerKey = tie ? null : (a.points > b.points ? 'teamA' : 'teamB');
    const setsToWin = (board.rules && board.rules.setsToWin) || 2;
    const nextA = a.setsWon + (winnerKey === 'teamA' ? 1 : 0);
    const nextB = b.setsWon + (winnerKey === 'teamB' ? 1 : 0);
    const endsMatch = nextA >= setsToWin || nextB >= setsToWin;

    const side = (t, key) => `
      <div class="cd-team ${winnerKey === key ? 'is-winner' : ''}">
        ${winnerKey === key ? '<span class="cd-win-tag">Kazanan</span>' : ''}
        <span class="cd-team-name" style="--tc:${esc(t.color || '#ffed00')}">${esc(t.name)}</span>
        <span class="cd-team-pts">${t.points}</span>
      </div>`;

    const note = tie
      ? '<div class="cd-note cd-warn">Skor eşit. Kazanan belli değil, istersen yine de bitirebilirsin.</div>'
      : `<div class="cd-note">Set skoru: <b>${nextA} - ${nextB}</b>${endsMatch ? ' · <b>Maç biter</b>' : ''}</div>`;

    return appConfirm({
      icon: '🏁',
      title: `${board.currentSet}. Seti bitir`,
      bodyHtml: `<div class="cd-score">${side(a, 'teamA')}<span class="cd-vs">-</span>${side(b, 'teamB')}</div>${note}`,
      confirmText: endsMatch ? 'Seti ve maçı bitir' : 'Seti bitir'
    });
  }

  window.cdEscape = esc;
  window.appConfirm = appConfirm;
  window.appPrompt = appPrompt;
  window.confirmEndSet = confirmEndSet;
})();
