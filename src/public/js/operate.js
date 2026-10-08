// Operator (Referee/Scorer) Control Panel JS
(function () {
  'use strict';

  // iPhone Safari (ana ekran uygulaması değil): sayfa kaydırılabilir, kart alanı sabit.
  // Yukarı kaydırınca Safari adres/sekme çubuklarını küçültür, kart alanı tüm ekranı kaplar.
  // Kapatmak için adrese ?bars=0, tekrar açmak için ?bars=1 ekle.
  (function setupSafariBarTrick() {
    try {
      const q = new URLSearchParams(window.location.search).get('bars');
      if (q === '0') localStorage.setItem('operate:noBarTrick', '1');
      if (q === '1') localStorage.removeItem('operate:noBarTrick');
      const disabled = localStorage.getItem('operate:noBarTrick') === '1';
      const isIphone = /iPhone|iPod/.test(navigator.userAgent);
      const standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      if (isIphone && !standalone && !disabled) {
        document.documentElement.classList.add('ios-bar-trick');
        window.addEventListener('load', () => window.scrollTo(0, 0));
      }
    } catch (e) {}
  })();

  let currentBoard = null;
  let boardId = null;
  let eventSource = null;
  let timeoutInterval = null;
  let whistleBlownAt = null;
  let clockInterval = null;
  let clockState = { running: false, startedAt: null, elapsedMs: 0 };
  let audioCtx = null;

  // Extract scoreboard ID or operator token from URL path (/operate/:id) or query params (?id=...)
  function extractBoardId() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && (pathParts[0] === 'operate' || pathParts[0] === 'operate.html')) {
      return decodeURIComponent(pathParts[1]).trim();
    }
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('id') || params.get('board') || params.get('token') ||
      (pathParts.length === 1 && pathParts[0] !== 'operate' && pathParts[0] !== 'operate.html' ? pathParts[0] : '');
    if (fromUrl) return fromUrl;
    // Ana ekrandan açılınca adres çubuğu yok: son kullanılan maç kodunu hatırla
    const saved = readSavedCode();
    if (saved) {
      try { history.replaceState(null, '', `/operate/${encodeURIComponent(saved)}`); } catch (e) {}
      return saved;
    }
    return '';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const CODE_STORAGE_KEY = 'operate:lastCode';

  function readSavedCode() {
    try { return (localStorage.getItem(CODE_STORAGE_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function saveCode(code) {
    try { localStorage.setItem(CODE_STORAGE_KEY, code); } catch (e) {}
  }

  // Kodla maç var mı? Varsa { code } döner, yoksa hata metni
  async function checkBoardCode(code) {
    const enc = encodeURIComponent(code);
    let res = await fetch(`/api/board/${enc}`);
    if (!res.ok) res = await fetch(`/api/board/by-operator/${enc}`);
    return res.ok;
  }

  async function changeBoardCode() {
    const current = (window.__operateCode || '').trim();
    const title = currentBoard && currentBoard.title ? currentBoard.title : '';
    const code = await window.appPrompt({
      icon: '🔁',
      title: 'Maç kodunu değiştir',
      bodyHtml: title ? `Şu an: <b>${escapeHtml(title)}</b>` : 'Skorunu gireceğin maçın kodunu yaz.',
      label: 'Maç kodu',
      placeholder: 'Örn: p9kq',
      value: '',
      confirmText: 'Maça geç',
      dismissible: Boolean(current),
      validate: async (v) => ((await checkBoardCode(v.trim())) ? '' : 'Bu kodla maç bulunamadı.')
    });
    if (!code) return;
    saveCode(code.trim());
    window.location.href = `/operate/${encodeURIComponent(code.trim())}`;
  }

  const btnChangeCode = document.getElementById('btn-change-code');
  const modalOpSettings = document.getElementById('modal-op-settings');
  function setSettingsOpen(open) {
    if (modalOpSettings) modalOpSettings.classList.toggle('active', open);
  }
  const btnOpSettings = document.getElementById('btn-op-settings');
  if (btnOpSettings) btnOpSettings.addEventListener('click', () => setSettingsOpen(true));
  const btnCloseOpSettings = document.getElementById('btn-close-op-settings');
  if (btnCloseOpSettings) btnCloseOpSettings.addEventListener('click', () => setSettingsOpen(false));
  if (modalOpSettings) {
    modalOpSettings.addEventListener('click', (e) => { if (e.target === modalOpSettings) setSettingsOpen(false); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSettingsOpen(false); });

  if (btnChangeCode) {
    btnChangeCode.addEventListener('click', () => {
      setSettingsOpen(false);
      changeBoardCode();
    });
  }

  // Dişli üzerindeki nokta bağlantı durumunu yansıtır
  const gearDot = document.getElementById('gear-dot');
  const connDotForGear = document.getElementById('conn-dot');
  if (connDotForGear && gearDot) {
    const syncGearDot = () => gearDot.classList.toggle('disconnected', connDotForGear.classList.contains('disconnected'));
    new MutationObserver(syncGearDot).observe(connDotForGear, { attributes: true, attributeFilter: ['class'] });
    syncGearDot();
  }

  // DOM Elements
  const elConnDot = document.getElementById('conn-dot');
  const elConnText = document.getElementById('conn-text');
  const elMatchTitle = document.getElementById('match-title');
  const elMatchSub = document.getElementById('match-sub');
  const elSetPill = document.getElementById('set-pill');
  const elHistoryList = document.getElementById('history-list');
  const elClockVal = document.getElementById('set-clock-val');
  const elClockPlay = document.getElementById('btn-clock-play');
  const elClockToggle = document.getElementById('btn-clock-toggle');
  const elTimeoutBanner = document.getElementById('timeout-banner');
  const elTimeoutTimer = document.getElementById('timeout-timer');
  const elTimeoutTeamName = document.getElementById('timeout-team-name');
  const elLeftBadge = document.getElementById('left-to-badge');
  const elRightBadge = document.getElementById('right-to-badge');

  // Left & Right Team DOM Elements
  const leftCard = document.getElementById('left-team-card');
  const leftLogo = document.getElementById('left-team-logo');
  const leftName = document.getElementById('left-team-name');
  const leftShort = document.getElementById('left-team-short');
  const leftSets = document.getElementById('left-sets-badge');
  const leftServeBtn = document.getElementById('left-serve-btn');
  const leftToDot1 = document.getElementById('left-to-dot-1');
  const leftToDot2 = document.getElementById('left-to-dot-2');
  const leftPointArea = document.getElementById('left-point-area');
  const leftPointVal = document.getElementById('left-point-val');
  const leftSubPointBtn = document.getElementById('left-sub-point');
  const leftTimeoutBtn = document.getElementById('left-timeout-btn');

  const rightCard = document.getElementById('right-team-card');
  const rightLogo = document.getElementById('right-team-logo');
  const rightName = document.getElementById('right-team-name');
  const rightShort = document.getElementById('right-team-short');
  const rightSets = document.getElementById('right-sets-badge');
  const rightServeBtn = document.getElementById('right-serve-btn');
  const rightToDot1 = document.getElementById('right-to-dot-1');
  const rightToDot2 = document.getElementById('right-to-dot-2');
  const rightPointArea = document.getElementById('right-point-area');
  const rightPointVal = document.getElementById('right-point-val');
  const rightSubPointBtn = document.getElementById('right-sub-point');
  const rightTimeoutBtn = document.getElementById('right-timeout-btn');

  // Sound Synth via Web Audio API
  function playBeep(freq = 800, type = 'sine', duration = 0.08) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playWhistle() {
    playBeep(1200, 'square', 0.25);
    setTimeout(() => playBeep(1400, 'square', 0.25), 80);
  }

  // Toast Notification
  function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderColor = isError ? 'var(--crimson-light)' : 'var(--border-color)';
    toast.innerHTML = isError ? `⚠️ ${message}` : `✓ ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  // ---- Action kuyruğu + iyimser (optimistic) sayı güncellemesi ----
  // Basışlar sırayla sunucuya gider. Sayı ekranda anında değişir, sunucu onaylayınca kesinleşir.
  const actionQueue = [];      // { action, payload, team, delta, resolve }
  let queueBusy = false;
  let displayBase = null;      // kuyruk başladığında sunucudaki sayılar { teamA, teamB }
  let slowBarTimer = null;
  const REQUEST_TIMEOUT_MS = 6000;
  // Sayıyı öngörülemez şekilde değiştiren eylemler: sonrasındaki iyimser artışlar uygulanmaz
  const POINT_RESET_ACTIONS = ['end_set', 'undo', 'reset_current_set', 'reset_match', 'set_points'];

  function pointDelta(action, payload) {
    const amount = Number(payload && payload.amount) || 1;
    switch (action) {
      case 'point_a': return { team: 'teamA', delta: amount };
      case 'point_b': return { team: 'teamB', delta: amount };
      case 'sub_point_a': return { team: 'teamA', delta: -amount };
      case 'sub_point_b': return { team: 'teamB', delta: -amount };
      default: return null;
    }
  }

  function hasPending(teamKey) {
    return actionQueue.some((it) => it.team === teamKey);
  }

  function areaFor(teamKey) {
    const isSwapped = Boolean(currentBoard && currentBoard.courtSwapped);
    const isLeft = (teamKey === 'teamA') !== isSwapped;
    return isLeft ? leftPointArea : rightPointArea;
  }

  // Ekranda gösterilecek sayı: kuyruk boşsa sunucu değeri, değilse taban + bekleyen basışlar
  function displayPoints(teamKey, serverPoints) {
    if (actionQueue.length === 0 || !displayBase) return serverPoints || 0;
    let v = displayBase[teamKey];
    for (const it of actionQueue) {
      if (POINT_RESET_ACTIONS.includes(it.action)) break;
      if (it.team === teamKey) v = Math.max(0, v + it.delta);
    }
    return v;
  }

  function showNetBar() {
    let bar = document.getElementById('net-pending-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'net-pending-bar';
      bar.className = 'net-pending-bar';
      document.body.appendChild(bar);
    }
    bar.textContent = `⏳ Bağlantı yavaş: ${actionQueue.length} işlem gönderiliyor...`;
    bar.classList.add('visible');
  }

  function hideNetBar() {
    const bar = document.getElementById('net-pending-bar');
    if (bar) bar.classList.remove('visible');
  }

  function updatePendingUi() {
    ['teamA', 'teamB'].forEach((key) => {
      const area = areaFor(key);
      if (area) area.classList.toggle('is-pending', hasPending(key));
    });
    const bar = document.getElementById('net-pending-bar');
    if (actionQueue.length === 0) {
      clearTimeout(slowBarTimer);
      slowBarTimer = null;
      hideNetBar();
    } else if (bar && bar.classList.contains('visible')) {
      showNetBar();
    } else if (!slowBarTimer) {
      slowBarTimer = setTimeout(() => {
        slowBarTimer = null;
        if (actionQueue.length > 0) showNetBar();
      }, 1000);
    }
  }

  function flashConfirmed(teamKey) {
    const area = areaFor(teamKey);
    if (!area) return;
    area.classList.remove('is-confirmed');
    void area.offsetWidth;
    area.classList.add('is-confirmed');
    setTimeout(() => area.classList.remove('is-confirmed'), 500);
  }

  async function postAction(action, payload) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await fetch(`/api/board/${encodeURIComponent(boardId)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: ctrl ? ctrl.signal : undefined
      });
      const data = await response.json();
      return { ok: response.ok && data.success, data };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Bağlantı kopukken kuyruktaki her basışın tek tek zaman aşımına girmesini beklemeyiz:
  // ağ hatasında bekleyen tüm basışlar geri alınır.
  function failPendingActions() {
    const dropped = actionQueue.splice(0, actionQueue.length);
    dropped.forEach((it) => it.resolve(false));
    return dropped.length;
  }

  async function processQueue() {
    if (queueBusy) return;
    queueBusy = true;
    try {
      while (actionQueue.length > 0) {
        const item = actionQueue[0];
        let ok = false;
        let board = null;
        let networkFailed = false;
        try {
          const res = await postAction(item.action, item.payload);
          ok = res.ok;
          board = res.data && res.data.board;
          if (!ok) showToast((res.data && res.data.error) || 'İşlem gerçekleştirilemedi', true);
        } catch (err) {
          networkFailed = true;
        }

        if (networkFailed) {
          const n = failPendingActions();
          showToast(n > 1 ? `Bağlantı hatası! ${n} işlem gönderilemedi.` : 'Bağlantı hatası! İşlem gönderilemedi.', true);
          haptic([60, 40, 60]);
        } else {
          actionQueue.shift();
          if (!ok) haptic([60, 40, 60]);
        }

        try {
          if (!networkFailed && board && board.teamA && board.teamB) {
            displayBase = { teamA: board.teamA.points, teamB: board.teamB.points };
            renderBoard(board);
          } else if (currentBoard) {
            renderBoard(currentBoard);
          }
          if (ok && item.team) flashConfirmed(item.team);
        } catch (err) {
          console.error('Operate render error', err);
        }
        updatePendingUi();
        if (!networkFailed) item.resolve(ok);
      }
    } finally {
      queueBusy = false;
      displayBase = null;
      try {
        if (currentBoard) renderBoard(currentBoard);
      } catch (err) {
        console.error('Operate render error', err);
      }
      updatePendingUi();
      if (actionQueue.length > 0) processQueue();
    }
  }

  // Emniyet: kuyruk boşken turuncu uyarı veya bekliyor işareti asla kalmasın
  function refreshPendingUi() {
    if (actionQueue.length === 0) updatePendingUi();
  }
  setInterval(refreshPendingUi, 1500);
  window.addEventListener('online', refreshPendingUi);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshPendingUi();
  });

  // Action Dispatcher for Operator
  function sendAction(action, payload = {}) {
    if (!boardId) return Promise.resolve(false);
    return new Promise((resolve) => {
      const pd = pointDelta(action, payload);
      if (actionQueue.length === 0 && currentBoard) {
        displayBase = { teamA: currentBoard.teamA.points, teamB: currentBoard.teamB.points };
      }
      actionQueue.push({ action, payload, team: pd ? pd.team : null, delta: pd ? pd.delta : 0, resolve });
      if (currentBoard) renderBoard(currentBoard);
      updatePendingUi();
      processQueue();
    });
  }

  // ---- Titreşim (haptic) ----
  // Android: navigator.vibrate. iOS Safari'de vibrate yok; iOS 17.4+ için gizli "switch" kutusu hilesi.
  const hasVibrate = typeof navigator.vibrate === 'function';
  let iosHapticLabel = null;

  function haptic(pattern) {
    if (hasVibrate) {
      navigator.vibrate(pattern);
      return;
    }
    // Sadece kullanıcı dokunuşu (click) içinde çalışır
    try {
      if (!iosHapticLabel) {
        iosHapticLabel = document.createElement('label');
        iosHapticLabel.setAttribute('aria-hidden', 'true');
        iosHapticLabel.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none;';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.setAttribute('switch', '');
        iosHapticLabel.appendChild(box);
        document.body.appendChild(iosHapticLabel);
      }
      iosHapticLabel.click();
    } catch (e) {}
  }

  // Sayı verildiğinde belirgin, diğer butonlarda hafif titreşim
  function hapticFor(target) {
    if (target.classList.contains('point-tap-area')) haptic(45);
    else haptic(15);
  }

  // Basılınca anında görsel geri bildirim (ağdan bağımsız)
  document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest && e.target.closest('button, .point-tap-area');
    if (!target || target.disabled) return;
    target.classList.remove('is-pressed');
    void target.offsetWidth;
    target.classList.add('is-pressed');
    setTimeout(() => target.classList.remove('is-pressed'), 260);
    if (hasVibrate) hapticFor(target);
  }, { passive: true });

  document.addEventListener('click', (e) => {
    if (hasVibrate) return;
    const target = e.target.closest && e.target.closest('button, .point-tap-area');
    if (target && !target.disabled) hapticFor(target);
  }, true);

  // Server time synchronization (immune to client device clock skew)
  let serverTimeOffset = 0; // serverTime - Date.now()

  function syncServerTime(serverTime) {
    if (typeof serverTime === 'number' && serverTime > 0) {
      serverTimeOffset = serverTime - Date.now();
    }
  }

  function getServerNow() {
    return Date.now() + serverTimeOffset;
  }

  // Set Clock Logic
  function renderSetClock(state) {
    clockState = state || { running: false, startedAt: null, elapsedMs: 0 };
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
    updateClockDisplay();
    updateClockButtons();
    if (clockState.running) {
      clockInterval = setInterval(updateClockDisplay, 250);
    }
  }

  function clockElapsedMs() {
    const base = clockState.elapsedMs || 0;
    if (!clockState.running || !clockState.startedAt) return base;
    return base + Math.max(0, getServerNow() - clockState.startedAt);
  }

  function updateClockDisplay() {
    if (!elClockVal) return;
    const total = Math.floor(clockElapsedMs() / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    elClockVal.textContent = `${mm}:${ss}`;
  }

  function updateClockButtons() {
    if (!elClockPlay || !elClockToggle) return;
    const running = Boolean(clockState.running);
    const paused = !running && clockElapsedMs() > 0;

    elClockPlay.disabled = running;
    elClockPlay.title = paused ? 'Devam Et' : 'Başlat';

    elClockToggle.disabled = !running && !paused;
    elClockToggle.classList.toggle('is-stop', paused);
    elClockToggle.title = running ? 'Duraklat' : 'Durdur';

    if (elClockVal) elClockVal.classList.toggle('is-running', running);
  }

  // Timeout Banner & Timer
  function hideTimeoutBanner() {
    if (elTimeoutBanner) elTimeoutBanner.classList.remove('active');
    if (elLeftBadge) elLeftBadge.style.display = 'none';
    if (elRightBadge) elRightBadge.style.display = 'none';
    if (leftCard) leftCard.classList.remove('timeout-active');
    if (rightCard) rightCard.classList.remove('timeout-active');
    if (timeoutInterval) {
      clearInterval(timeoutInterval);
      timeoutInterval = null;
    }
  }

  function startLocalTimeoutTimer(endsAt) {
    if (timeoutInterval) clearInterval(timeoutInterval);
    timeoutInterval = null;

    function update() {
      const remaining = Math.max(0, Math.ceil((endsAt - getServerNow()) / 1000));
      if (elTimeoutTimer) elTimeoutTimer.textContent = `${remaining}s`;

      if (currentBoard && currentBoard.timeoutState) {
        const teamKey = currentBoard.timeoutState.team;
        const isSwapped = Boolean(currentBoard.courtSwapped);
        const isLeftTimeout = (teamKey === 'teamA' && !isSwapped) || (teamKey === 'teamB' && isSwapped);
        if (leftCard) leftCard.classList.toggle('timeout-active', isLeftTimeout);
        if (rightCard) rightCard.classList.toggle('timeout-active', !isLeftTimeout);
        if (elLeftBadge) {
          elLeftBadge.style.display = isLeftTimeout ? 'inline-block' : 'none';
          if (isLeftTimeout) elLeftBadge.textContent = `${remaining}s`;
        }
        if (elRightBadge) {
          elRightBadge.style.display = !isLeftTimeout ? 'inline-block' : 'none';
          if (!isLeftTimeout) elRightBadge.textContent = `${remaining}s`;
        }
      }

      if (remaining > 0) return;
      hideTimeoutBanner();
      if (whistleBlownAt !== endsAt) {
        whistleBlownAt = endsAt;
        playWhistle();
      }
    }

    update();
    if (elTimeoutBanner && elTimeoutBanner.classList.contains('active')) {
      timeoutInterval = setInterval(update, 500);
    }
  }

  // Render State
  function renderBoard(board) {
    if (!board) return;
    if (board.serverTime) syncServerTime(board.serverTime);
    // Eski (geç gelen) durum yeniyi ezmesin
    if (board !== currentBoard && currentBoard && board.updatedAt && currentBoard.updatedAt && board.updatedAt < currentBoard.updatedAt) return;
    currentBoard = board;

    if (elMatchTitle) elMatchTitle.textContent = board.title || 'Voleybol Müsabakası';
    if (elMatchSub) elMatchSub.textContent = board.subtitle || 'Canlı Yayın';
    if (elSetPill) elSetPill.textContent = `${board.currentSet || 1}. SET`;

    // History rendering
    if (elHistoryList) {
      elHistoryList.innerHTML = '';
      if (board.setHistory && board.setHistory.length > 0) {
        board.setHistory.forEach((h) => {
          const item = document.createElement('div');
          item.className = 'history-item';
          const leftSc = board.courtSwapped ? h.scoreB : h.scoreA;
          const rightSc = board.courtSwapped ? h.scoreA : h.scoreB;
          item.textContent = `${h.set}. Set: ${leftSc}-${rightSc}`;
          elHistoryList.appendChild(item);
        });
      }
    }

    // Determine Left & Right based on courtSwapped
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    // Render Left
    if (leftName) leftName.textContent = leftData.name || 'EV SAHİBİ';
    if (leftShort) leftShort.textContent = leftData.shortName || '';
    if (leftSets) leftSets.textContent = `${leftData.setsWon || 0} Set`;
    if (leftPointVal) leftPointVal.textContent = displayPoints(isSwapped ? 'teamB' : 'teamA', leftData.points);

    if (leftLogo) {
      if (leftData.logo) {
        leftLogo.src = leftData.logo;
        leftLogo.style.display = 'block';
        leftLogo.onerror = () => { leftLogo.src = '/assets/volleyball.svg'; };
      } else {
        leftLogo.src = '/assets/volleyball.svg';
        leftLogo.style.display = 'block';
      }
    }

    if (leftCard) {
      leftCard.style.borderColor = leftData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
      leftCard.classList.toggle('serving-active', Boolean(leftData.isServing));
    }
    if (leftServeBtn) leftServeBtn.className = `serve-btn ${leftData.isServing ? 'is-serving' : ''}`;
    if (leftToDot1) leftToDot1.className = `to-dot ${(leftData.timeouts || 0) >= 1 ? 'used' : ''}`;
    if (leftToDot2) leftToDot2.className = `to-dot ${(leftData.timeouts || 0) >= 2 ? 'used' : ''}`;
    if (leftTimeoutBtn) leftTimeoutBtn.disabled = (leftData.timeouts || 0) >= 2;

    // Render Right
    if (rightName) rightName.textContent = rightData.name || 'DEPLASMAN';
    if (rightShort) rightShort.textContent = rightData.shortName || '';
    if (rightSets) rightSets.textContent = `${rightData.setsWon || 0} Set`;
    if (rightPointVal) rightPointVal.textContent = displayPoints(isSwapped ? 'teamA' : 'teamB', rightData.points);

    if (rightLogo) {
      if (rightData.logo) {
        rightLogo.src = rightData.logo;
        rightLogo.style.display = 'block';
        rightLogo.onerror = () => { rightLogo.src = '/assets/volleyball.svg'; };
      } else {
        rightLogo.src = '/assets/volleyball.svg';
        rightLogo.style.display = 'block';
      }
    }

    if (rightCard) {
      rightCard.style.borderColor = rightData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
      rightCard.classList.toggle('serving-active', Boolean(rightData.isServing));
    }
    if (rightServeBtn) rightServeBtn.className = `serve-btn ${rightData.isServing ? 'is-serving' : ''}`;
    if (rightToDot1) rightToDot1.className = `to-dot ${(rightData.timeouts || 0) >= 1 ? 'used' : ''}`;
    if (rightToDot2) rightToDot2.className = `to-dot ${(rightData.timeouts || 0) >= 2 ? 'used' : ''}`;
    if (rightTimeoutBtn) rightTimeoutBtn.disabled = (rightData.timeouts || 0) >= 2;

    // Set Clock
    renderSetClock(board.setClock);

    // Handle Timeout Banner
    if (board.timeoutState && board.timeoutState.active) {
      if (elTimeoutBanner) elTimeoutBanner.classList.add('active');
      const team = board[board.timeoutState.team];
      if (elTimeoutTeamName) elTimeoutTeamName.textContent = `${team ? team.name : ''} Molası`;
      startLocalTimeoutTimer(board.timeoutState.endsAt);
    } else {
      hideTimeoutBanner();
      whistleBlownAt = null;
    }
  }

  // Click Listeners
  if (leftPointArea) {
    leftPointArea.addEventListener('click', () => {
      playBeep(880, 'triangle', 0.1);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'point_b' : 'point_a');
    });
  }

  if (rightPointArea) {
    rightPointArea.addEventListener('click', () => {
      playBeep(880, 'triangle', 0.1);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'point_a' : 'point_b');
    });
  }

  if (leftSubPointBtn) {
    leftSubPointBtn.addEventListener('click', () => {
      playBeep(440, 'sine', 0.08);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'sub_point_b' : 'sub_point_a');
    });
  }

  if (rightSubPointBtn) {
    rightSubPointBtn.addEventListener('click', () => {
      playBeep(440, 'sine', 0.08);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'sub_point_a' : 'sub_point_b');
    });
  }

  if (leftServeBtn) {
    leftServeBtn.addEventListener('click', () => {
      playBeep(660, 'sine', 0.08);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction('set_serve', { team: isSwapped ? 'teamB' : 'teamA' });
    });
  }

  if (rightServeBtn) {
    rightServeBtn.addEventListener('click', () => {
      playBeep(660, 'sine', 0.08);
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction('set_serve', { team: isSwapped ? 'teamA' : 'teamB' });
    });
  }

  if (leftTimeoutBtn) {
    leftTimeoutBtn.addEventListener('click', () => {
      playWhistle();
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'timeout_b' : 'timeout_a', { duration: 30 });
    });
  }

  if (rightTimeoutBtn) {
    rightTimeoutBtn.addEventListener('click', () => {
      playWhistle();
      const isSwapped = currentBoard && currentBoard.courtSwapped;
      sendAction(isSwapped ? 'timeout_a' : 'timeout_b', { duration: 30 });
    });
  }

  if (elClockPlay) {
    elClockPlay.addEventListener('click', () => {
      playBeep(660, 'triangle', 0.08);
      sendAction('clock_start');
    });
  }

  if (elClockToggle) {
    elClockToggle.addEventListener('click', () => {
      playBeep(440, 'triangle', 0.08);
      sendAction(clockState.running ? 'clock_pause' : 'clock_reset');
    });
  }

  const btnEndTimeout = document.getElementById('btn-end-timeout');
  if (btnEndTimeout) {
    btnEndTimeout.addEventListener('click', () => {
      sendAction('end_timeout');
    });
  }

  [elLeftBadge, elRightBadge].forEach((badge) => {
    if (!badge) return;
    badge.title = 'Molayı bitir';
    badge.addEventListener('click', () => sendAction('end_timeout'));
  });

  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      playBeep(520, 'sine', 0.1);
      sendAction('undo');
      showToast('Son hareket geri alındı');
    });
  }

  const btnSwap = document.getElementById('btn-swap');
  if (btnSwap) {
    btnSwap.addEventListener('click', () => {
      playBeep(600, 'sine', 0.1);
      sendAction('swap_sides');
      showToast('Saha yönü değiştirildi');
    });
  }

  const btnEndSet = document.getElementById('btn-end-set');
  if (btnEndSet) {
    btnEndSet.addEventListener('click', async () => {
      if (!currentBoard) return;
      const setNo = currentBoard.currentSet;
      if (await window.confirmEndSet(currentBoard)) {
        playWhistle();
        sendAction('end_set');
        showToast(`${setNo}. Set tamamlandı!`);
      }
    });
  }

  const btnShowHistory = document.getElementById('btn-show-history');
  if (btnShowHistory) {
    btnShowHistory.addEventListener('click', () => {
      sendAction('show_history');
      showToast('Sayı geçmişi gösteriliyor (5 sn)');
    });
  }

  const btnShowResult = document.getElementById('btn-show-result');
  if (btnShowResult) {
    btnShowResult.addEventListener('click', () => {
      sendAction('show_result');
      showToast('Maç sonucu gösteriliyor (10 sn)');
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    const k = e.key ? e.key.toLowerCase() : '';
    const isSwapped = currentBoard && currentBoard.courtSwapped;

    // Q/A: Team Left +/- 1 Point
    if (k === 'q') {
      sendAction(isSwapped ? 'point_b' : 'point_a');
      playBeep(880, 'triangle', 0.1);
    } else if (k === 'a' && !e.ctrlKey && !e.metaKey) {
      sendAction(isSwapped ? 'sub_point_b' : 'sub_point_a');
      playBeep(440, 'sine', 0.08);
    }
    // P/L: Team Right +/- 1 Point
    else if (k === 'p') {
      sendAction(isSwapped ? 'point_a' : 'point_b');
      playBeep(880, 'triangle', 0.1);
    } else if (k === 'l') {
      sendAction(isSwapped ? 'sub_point_a' : 'sub_point_b');
      playBeep(440, 'sine', 0.08);
    }
    // Arrow Left/Right: Set Serve
    else if (e.code === 'ArrowLeft') {
      sendAction('set_serve', { team: isSwapped ? 'teamB' : 'teamA' });
      playBeep(660, 'sine', 0.08);
    } else if (e.code === 'ArrowRight') {
      sendAction('set_serve', { team: isSwapped ? 'teamA' : 'teamB' });
      playBeep(660, 'sine', 0.08);
    }
    // Space: Toggle Serve
    else if (e.code === 'Space') {
      e.preventDefault();
      sendAction('set_serve', {});
      playBeep(660, 'sine', 0.08);
    }
    // Ctrl+Z: Undo
    else if (k === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendAction('undo');
      playBeep(520, 'sine', 0.1);
    }
    // R: End Set
    else if (k === 'r' && !e.ctrlKey && !e.metaKey) {
      sendAction('end_set');
    }
  });

  // Connect SSE for Real-time State Synchronization
  function connectSSE() {
    if (!boardId) return;
    if (eventSource) {
      try { eventSource.close(); } catch (e) {}
    }

    if (elConnDot) elConnDot.className = 'conn-dot disconnected';
    if (elConnText) elConnText.textContent = 'Bağlanıyor...';

    eventSource = new EventSource(`/api/board/${encodeURIComponent(boardId)}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        if (board.serverTime) syncServerTime(board.serverTime);
        renderBoard(board);
        if (elConnDot) elConnDot.className = 'conn-dot';
        if (elConnText) elConnText.textContent = 'Canlı (SSE)';
      } catch (err) {
        console.error('SSE JSON error', err);
      }
    });

    eventSource.addEventListener('ping', (e) => {
      if (e.data) syncServerTime(Number(e.data));
      if (elConnDot) elConnDot.className = 'conn-dot';
    });

    eventSource.onerror = () => {
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Koptu (Yenileniyor...)';
    };
  }

  // Initial Load & Board Resolution
  async function initOperator() {
    boardId = extractBoardId();
    if (!boardId) {
      if (elMatchTitle) elMatchTitle.textContent = 'Maç kodu girilmedi';
      if (elMatchSub) elMatchSub.textContent = 'Skorunu gireceğin maçın kodunu yaz.';
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Bağlantı Yok';
      changeBoardCode();
      return;
    }
    const enteredCode = boardId;
    window.__operateCode = enteredCode;
    const codeLabel = document.getElementById('code-label');
    if (codeLabel) codeLabel.textContent = enteredCode.length > 10 ? enteredCode.slice(0, 10) + '…' : enteredCode;

    if (elConnText) elConnText.textContent = 'Bağlanıyor...';

    try {
      let res = await fetch(`/api/board/${encodeURIComponent(boardId)}`);
      let data = null;
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback: try by-operator
        const opRes = await fetch(`/api/board/by-operator/${encodeURIComponent(boardId)}`);
        if (opRes.ok) {
          data = await opRes.json();
        }
      }

      const board = (data && data.board) ? data.board : data;
      if (!board || board.error) {
        if (elMatchTitle) elMatchTitle.textContent = 'Skorboard Bulunamadı';
        if (elMatchSub) elMatchSub.textContent = (board && board.error) ? board.error : 'Skorboard bulunamadı.';
        if (elConnDot) elConnDot.className = 'conn-dot disconnected';
        if (elConnText) elConnText.textContent = 'Bulunamadı';
        if (enteredCode === readSavedCode()) { try { localStorage.removeItem(CODE_STORAGE_KEY); } catch (e) {} }
        return;
      }

      boardId = board.id || boardId;
      saveCode(enteredCode);
      renderBoard(board);
      connectSSE();
    } catch (e) {
      console.error('Operator init error:', e);
      if (elMatchTitle) elMatchTitle.textContent = 'Bağlantı Hatası';
      if (elMatchSub) elMatchSub.textContent = 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.';
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Hata';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOperator);
  } else {
    initOperator();
  }
})();
