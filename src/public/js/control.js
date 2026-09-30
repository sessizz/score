// Referee & Scorekeeper Control Panel JS
(function () {
  let currentBoard = null;
  let boardId = 'fenerbahce';
  let eventSource = null;
  let timeoutInterval = null;
  let whistleBlownAt = null;
  let clockInterval = null;
  let clockState = { running: false, startedAt: null, elapsedMs: 0 };

  // Extract boardId from URL path (/control/:id) or query param (?id=...)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && pathParts[0] === 'control') {
    boardId = pathParts[1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) boardId = urlParams.get('id');
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
  let audioCtx = null;
  function playBeep(freq = 800, type = 'sine', duration = 0.08) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    } catch (e) {
      // Audio context might be restricted before gesture
    }
  }

  function playWhistle() {
    playBeep(1200, 'square', 0.25);
    setTimeout(() => playBeep(1400, 'square', 0.25), 80);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  // Bağlantı kopukken her basışın tek tek zaman aşımına girmesini beklemeyiz
  function failPendingActions() {
    const dropped = actionQueue.splice(0, actionQueue.length);
    dropped.forEach((it) => it.resolve(false));
    return dropped.length;
  }

  function applyResponseBoard(board) {
    if (!board || !board.teamA || !board.teamB) return;
    if (currentBoard && board.updatedAt && currentBoard.updatedAt && board.updatedAt < currentBoard.updatedAt) return;
    currentBoard = board;
    renderBoard(board);
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
          if (!ok) showToast((res.data && res.data.error) || 'İşlem başarısız!', true);
        } catch (err) {
          networkFailed = true;
        }

        if (networkFailed) {
          const n = failPendingActions();
          showToast(n > 1 ? `Bağlantı hatası! ${n} işlem gönderilemedi.` : 'Bağlantı hatası! İşlem gönderilemedi.', true);
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        } else {
          actionQueue.shift();
          if (!ok && navigator.vibrate) navigator.vibrate([60, 40, 60]);
        }

        try {
          if (!networkFailed && board && board.teamA && board.teamB) {
            displayBase = { teamA: board.teamA.points, teamB: board.teamB.points };
            applyResponseBoard(board);
          } else if (currentBoard) {
            renderBoard(currentBoard);
          }
          if (ok && item.team) flashConfirmed(item.team);
        } catch (err) {
          console.error('Control render error', err);
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
        console.error('Control render error', err);
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

  // Action Dispatcher
  function sendAction(action, payload = {}) {
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

  // ---- Titreşim (haptic) + basış efekti ----
  const hasVibrate = typeof navigator.vibrate === 'function';
  let iosHapticLabel = null;

  function haptic(pattern) {
    if (hasVibrate) {
      navigator.vibrate(pattern);
      return;
    }
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

  function hapticFor(target) {
    haptic(target.classList.contains('point-tap-area') ? 45 : 15);
  }

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

  // Connect SSE
  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }

    elConnDot.className = 'conn-dot disconnected';
    elConnText.textContent = 'Bağlanıyor...';

    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        if (board.serverTime) syncServerTime(board.serverTime);
        currentBoard = board;
        renderBoard(board);
        elConnDot.className = 'conn-dot';
        elConnText.textContent = 'Canlı (SSE)';
      } catch (err) {
        console.error('Failed to parse board state', err);
      }
    });

    eventSource.addEventListener('ping', (e) => {
      if (e.data) syncServerTime(Number(e.data));
      elConnDot.className = 'conn-dot';
    });

    eventSource.onerror = () => {
      elConnDot.className = 'conn-dot disconnected';
      elConnText.textContent = 'Koptu (Yenileniyor...)';
    };
  }

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

  // Render State
  function renderBoard(board) {
    if (board && board.serverTime) syncServerTime(board.serverTime);
    elMatchTitle.textContent = board.title || 'Fenerbahçe Küçük Erkek Voleybol Ligi';
    elMatchSub.textContent = board.subtitle || 'Canlı Yayın';
    elSetPill.textContent = `${board.currentSet}. SET`;

    // History rendering
    elHistoryList.innerHTML = '';
    if (board.setHistory && board.setHistory.length > 0) {
      board.setHistory.forEach((h) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.textContent = `${h.set}. Set: ${h.scoreA}-${h.scoreB}`;
        elHistoryList.appendChild(item);
      });
    }

    // Determine Left & Right based on courtSwapped
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    // Render Left
    leftName.textContent = leftData.name;
    leftShort.textContent = leftData.shortName;
    leftSets.textContent = `${leftData.setsWon} Set`;
    leftPointVal.textContent = displayPoints(isSwapped ? 'teamB' : 'teamA', leftData.points);
    if (leftData.logo) {
      leftLogo.src = leftData.logo;
      leftLogo.style.display = 'block';
    } else {
      leftLogo.style.display = 'none';
    }
    leftCard.style.borderColor = leftData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
    leftServeBtn.className = `serve-btn ${leftData.isServing ? 'is-serving' : ''}`;
    leftToDot1.className = `to-dot ${leftData.timeouts >= 1 ? 'used' : ''}`;
    leftToDot2.className = `to-dot ${leftData.timeouts >= 2 ? 'used' : ''}`;

    // Render Right
    rightName.textContent = rightData.name;
    rightShort.textContent = rightData.shortName;
    rightSets.textContent = `${rightData.setsWon} Set`;
    rightPointVal.textContent = displayPoints(isSwapped ? 'teamA' : 'teamB', rightData.points);
    if (rightData.logo) {
      rightLogo.src = rightData.logo;
      rightLogo.style.display = 'block';
    } else {
      rightLogo.style.display = 'none';
    }
    rightCard.style.borderColor = rightData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
    rightServeBtn.className = `serve-btn ${rightData.isServing ? 'is-serving' : ''}`;
    rightToDot1.className = `to-dot ${rightData.timeouts >= 1 ? 'used' : ''}`;
    rightToDot2.className = `to-dot ${rightData.timeouts >= 2 ? 'used' : ''}`;

    // Set Clock
    renderSetClock(board.setClock);

    // Handle Timeout Banner
    if (board.timeoutState && board.timeoutState.active) {
      elTimeoutBanner.classList.add('active');
      const team = board[board.timeoutState.team];
      elTimeoutTeamName.textContent = `${team ? team.name : ''} Molası`;
      startLocalTimeoutTimer(board.timeoutState.endsAt);
    } else {
      hideTimeoutBanner();
      whistleBlownAt = null;
    }
  }

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
    const total = Math.floor(clockElapsedMs() / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    elClockVal.textContent = `${mm}:${ss}`;
  }

  function updateClockButtons() {
    const running = Boolean(clockState.running);
    const paused = !running && clockElapsedMs() > 0;

    elClockPlay.disabled = running;
    elClockPlay.title = paused ? 'Devam Et' : 'Başlat';

    // Sayaç duraklatılınca pause ikonu stop'a döner, ikinci basış sayacı sıfırlar
    elClockToggle.disabled = !running && !paused;
    elClockToggle.classList.toggle('is-stop', paused);
    elClockToggle.title = running ? 'Duraklat' : 'Durdur';

    elClockVal.classList.toggle('is-running', running);
  }

  const elLeftBadge = document.getElementById('left-to-badge');
  const elRightBadge = document.getElementById('right-to-badge');

  function hideTimeoutBanner() {
    elTimeoutBanner.classList.remove('active');
    if (elLeftBadge) elLeftBadge.style.display = 'none';
    if (elRightBadge) elRightBadge.style.display = 'none';
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
      elTimeoutTimer.textContent = `${remaining}s`;

      if (currentBoard && currentBoard.timeoutState) {
        const teamKey = currentBoard.timeoutState.team;
        const isSwapped = Boolean(currentBoard.courtSwapped);
        const isLeftTimeout = (teamKey === 'teamA' && !isSwapped) || (teamKey === 'teamB' && isSwapped);
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
      // Mola bitti: banner'ı kaldır, düdüğü bu mola için bir kez çal
      hideTimeoutBanner();
      if (whistleBlownAt !== endsAt) {
        whistleBlownAt = endsAt;
        playWhistle();
      }
    }

    update();
    // Süre çoktan dolmuşsa update() banner'ı kapattı, sayacı başlatma
    if (elTimeoutBanner.classList.contains('active')) {
      timeoutInterval = setInterval(update, 500);
    }
  }

  // Click Listeners
  leftPointArea.addEventListener('click', () => {
    playBeep(880, 'triangle', 0.1);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'point_b' : 'point_a');
  });

  rightPointArea.addEventListener('click', () => {
    playBeep(880, 'triangle', 0.1);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'point_a' : 'point_b');
  });

  leftSubPointBtn.addEventListener('click', () => {
    playBeep(440, 'sine', 0.08);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'sub_point_b' : 'sub_point_a');
  });

  rightSubPointBtn.addEventListener('click', () => {
    playBeep(440, 'sine', 0.08);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'sub_point_a' : 'sub_point_b');
  });

  leftServeBtn.addEventListener('click', () => {
    playBeep(660, 'sine', 0.08);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction('set_serve', { team: isSwapped ? 'teamB' : 'teamA' });
  });

  rightServeBtn.addEventListener('click', () => {
    playBeep(660, 'sine', 0.08);
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction('set_serve', { team: isSwapped ? 'teamA' : 'teamB' });
  });

  leftTimeoutBtn.addEventListener('click', () => {
    playWhistle();
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'timeout_b' : 'timeout_a', { duration: 30 });
  });

  rightTimeoutBtn.addEventListener('click', () => {
    playWhistle();
    const isSwapped = currentBoard && currentBoard.courtSwapped;
    sendAction(isSwapped ? 'timeout_a' : 'timeout_b', { duration: 30 });
  });

  elClockPlay.addEventListener('click', () => {
    playBeep(660, 'triangle', 0.08);
    sendAction('clock_start');
  });

  elClockToggle.addEventListener('click', () => {
    playBeep(440, 'triangle', 0.08);
    sendAction(clockState.running ? 'clock_pause' : 'clock_reset');
  });

  document.getElementById('btn-end-timeout').addEventListener('click', () => {
    sendAction('end_timeout');
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    playBeep(520, 'sine', 0.1);
    sendAction('undo');
    showToast('Son hareket geri alındı');
  });

  document.getElementById('btn-swap').addEventListener('click', () => {
    playBeep(600, 'sine', 0.1);
    sendAction('swap_sides');
    showToast('Saha yönü değiştirildi');
  });

  document.getElementById('btn-end-set').addEventListener('click', async () => {
    if (!currentBoard) return;
    const setNo = currentBoard.currentSet;
    if (await window.confirmEndSet(currentBoard)) {
      playWhistle();
      sendAction('end_set');
      showToast(`${setNo}. Set tamamlandı!`);
    }
  });

  function confirmResetMatch() {
    return window.appConfirm({
      icon: '🗑️',
      tone: 'danger',
      title: 'Maçı sıfırla',
      bodyHtml: 'Tüm setler, skorlar ve sayı geçmişi silinecek. Bu işlem geri alınamaz.',
      confirmText: 'Evet, sıfırla'
    });
  }

  // Settings Modal & OBS Links Modal
  const modalSettings = document.getElementById('modal-settings');
  const modalObs = document.getElementById('modal-obs');
  const modalControlPicker = document.getElementById('modal-control-logo-picker');
  const controlPickerGrid = document.getElementById('control-picker-grid');
  const controlPickerSearch = document.getElementById('control-picker-search');
  const btnCloseControlPicker = document.getElementById('btn-close-control-picker');
  const btnCancelControlPicker = document.getElementById('btn-cancel-control-picker');

  let controlLogos = [];
  let controlPickerTarget = null; // 'a' or 'b'

  const selectLogoA = document.getElementById('control-select-logo-a');
  const selectLogoB = document.getElementById('control-select-logo-b');
  const selectTeamA = document.getElementById('control-select-team-a');
  const selectTeamB = document.getElementById('control-select-team-b');
  const previewImgA = document.getElementById('control-preview-img-a');
  const previewImgB = document.getElementById('control-preview-img-b');

  async function loadControlLogos() {
    try {
      const res = await fetch('/api/logos');
      const data = await res.json();
      if (data.success && Array.isArray(data.logos)) {
        controlLogos = data.logos;
        populateControlTeamSelects();
        populateControlLogoSelects();
      }
    } catch (err) {
      console.error('Failed to load teams/logos in control', err);
    }
  }

  function applyTeamToForm(target, team) {
    if (!team) return;
    const nameInput = document.getElementById(`setting-name-${target}`);
    const shortInput = document.getElementById(`setting-short-${target}`);
    const logoInput = document.getElementById(`setting-logo-${target}`);
    const color1Input = document.getElementById(`setting-color-${target}`);
    const color2Input = document.getElementById(`setting-color-${target}2`);
    const selectLogo = target === 'a' ? selectLogoA : selectLogoB;
    const selectTeam = target === 'a' ? selectTeamA : selectTeamB;
    const previewImg = target === 'a' ? previewImgA : previewImgB;

    if (nameInput && team.name) nameInput.value = team.name;
    if (shortInput && team.shortName) shortInput.value = team.shortName;
    if (color1Input && team.color) color1Input.value = team.color;
    if (color2Input && team.color2) color2Input.value = team.color2;

    const teamLogoUrl = team.logo || team.url || '';
    if (logoInput) logoInput.value = teamLogoUrl;
    if (selectLogo) selectLogo.value = teamLogoUrl;
    if (selectTeam && team.id) selectTeam.value = team.id;

    if (previewImg) {
      if (teamLogoUrl) {
        previewImg.src = teamLogoUrl;
        previewImg.style.display = 'block';
      } else {
        previewImg.style.display = 'none';
      }
    }

    showToast(`✓ "${team.name}" takımı ve renkleri seçildi!`);
  }

  function populateControlTeamSelects() {
    if (!selectTeamA || !selectTeamB) return;
    let teamOptions = [
      '<option value="">-- Kayıtlı Takımlardan Seç (veya aşağıdan elle girin) --</option>',
      ...controlLogos.map(t => `<option value="${t.id}">${escapeHtml(t.name)} ${t.shortName ? `(${escapeHtml(t.shortName)})` : ''}</option>`)
    ];

    selectTeamA.innerHTML = teamOptions.join('');
    selectTeamB.innerHTML = teamOptions.join('');

    if (currentBoard && currentBoard.teamA && currentBoard.teamA.name) {
      const matchA = controlLogos.find(t => t.name.toLowerCase() === currentBoard.teamA.name.toLowerCase());
      if (matchA) selectTeamA.value = matchA.id;
    }
    if (currentBoard && currentBoard.teamB && currentBoard.teamB.name) {
      const matchB = controlLogos.find(t => t.name.toLowerCase() === currentBoard.teamB.name.toLowerCase());
      if (matchB) selectTeamB.value = matchB.id;
    }
  }

  if (selectTeamA) {
    selectTeamA.addEventListener('change', (e) => {
      const teamId = e.target.value;
      if (!teamId) return;
      const team = controlLogos.find(t => t.id === teamId);
      if (team) applyTeamToForm('a', team);
    });
  }

  if (selectTeamB) {
    selectTeamB.addEventListener('change', (e) => {
      const teamId = e.target.value;
      if (!teamId) return;
      const team = controlLogos.find(t => t.id === teamId);
      if (team) applyTeamToForm('b', team);
    });
  }

  function populateControlLogoSelects() {
    if (!selectLogoA || !selectLogoB) return;
    const currentA = (document.getElementById('setting-logo-a') && document.getElementById('setting-logo-a').value)
      || (currentBoard && currentBoard.teamA && currentBoard.teamA.logo)
      || '';
    const currentB = (document.getElementById('setting-logo-b') && document.getElementById('setting-logo-b').value)
      || (currentBoard && currentBoard.teamB && currentBoard.teamB.logo)
      || '';

    let optionsA = controlLogos.map(l => `<option value="${l.url || l.logo || ''}" ${(l.url === currentA || l.logo === currentA) ? 'selected' : ''}>${escapeHtml(l.name)}</option>`);
    let optionsB = controlLogos.map(l => `<option value="${l.url || l.logo || ''}" ${(l.url === currentB || l.logo === currentB) ? 'selected' : ''}>${escapeHtml(l.name)}</option>`);

    if (currentA && !controlLogos.some(l => (l.url === currentA || l.logo === currentA))) {
      optionsA.unshift(`<option value="${currentA}" selected>Mevcut Logo (${currentA})</option>`);
    }
    if (currentB && !controlLogos.some(l => (l.url === currentB || l.logo === currentB))) {
      optionsB.unshift(`<option value="${currentB}" selected>Mevcut Logo (${currentB})</option>`);
    }

    selectLogoA.innerHTML = optionsA.join('');
    selectLogoB.innerHTML = optionsB.join('');

    if (currentA) {
      selectLogoA.value = currentA;
      if (previewImgA) previewImgA.src = currentA;
    }
    if (currentB) {
      selectLogoB.value = currentB;
      if (previewImgB) previewImgB.src = currentB;
    }
  }

  if (selectLogoA) {
    selectLogoA.addEventListener('change', (e) => {
      document.getElementById('setting-logo-a').value = e.target.value;
      if (previewImgA) previewImgA.src = e.target.value;
    });
  }

  if (selectLogoB) {
    selectLogoB.addEventListener('change', (e) => {
      document.getElementById('setting-logo-b').value = e.target.value;
      if (previewImgB) previewImgB.src = e.target.value;
    });
  }

  // Open Visual Picker Modal in Control Panel
  document.querySelectorAll('.btn-control-open-picker').forEach(btn => {
    btn.addEventListener('click', () => {
      controlPickerTarget = btn.dataset.target; // 'a' or 'b'
      renderControlPickerGrid();
      if (modalControlPicker) {
        modalControlPicker.classList.add('active');
        if (controlPickerSearch) {
          controlPickerSearch.value = '';
          controlPickerSearch.focus();
        }
      }
    });
  });

  function renderControlPickerGrid() {
    if (!controlPickerGrid) return;
    const q = (controlPickerSearch ? controlPickerSearch.value : '').trim().toLowerCase();
    const currentVal = controlPickerTarget === 'a' 
      ? document.getElementById('setting-logo-a').value 
      : document.getElementById('setting-logo-b').value;

    const filtered = controlLogos.filter(l => !q || (l.name || '').toLowerCase().includes(q) || (l.shortName || '').toLowerCase().includes(q));

    controlPickerGrid.innerHTML = filtered.map(l => {
      const isSelected = (l.url && l.url === currentVal) || (l.logo && l.logo === currentVal);
      const c1 = l.color || '#ffed00';
      const thumb = (l.logo || l.url)
        ? `<img src="${l.logo || l.url}" alt="" onerror="this.src='/assets/volleyball.svg'">`
        : `<span style="font-weight: 800; font-size: 0.9rem; color: ${c1};">${escapeHtml(l.shortName || l.name.slice(0, 3))}</span>`;
      return `
        <div class="logo-picker-item ${isSelected ? 'selected' : ''}" data-id="${l.id}" data-url="${l.logo || l.url || ''}">
          <div class="logo-picker-thumb" style="border-top: 3px solid ${c1};">
            ${thumb}
          </div>
          <div class="logo-picker-title">${escapeHtml(l.name)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(l.shortName || '')}</div>
        </div>
      `;
    }).join('');

    controlPickerGrid.querySelectorAll('.logo-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const teamId = item.dataset.id;
        const selectedTeam = controlLogos.find(t => t.id === teamId) || controlLogos.find(t => (t.logo || t.url) === item.dataset.url);
        if (!selectedTeam) return;

        applyTeamToForm(controlPickerTarget, selectedTeam);
        if (modalControlPicker) modalControlPicker.classList.remove('active');
      });
    });
  }

  if (controlPickerSearch) {
    controlPickerSearch.addEventListener('input', renderControlPickerGrid);
  }
  if (btnCloseControlPicker) {
    btnCloseControlPicker.addEventListener('click', () => modalControlPicker.classList.remove('active'));
  }
  if (btnCancelControlPicker) {
    btnCancelControlPicker.addEventListener('click', () => modalControlPicker.classList.remove('active'));
  }

  // Eyedropper / Damlalık buttons
  document.querySelectorAll('.btn-control-eyedropper').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team; // 'a' or 'b'
      const color1Input = document.getElementById(`setting-color-${team}`);
      const color2Input = document.getElementById(`setting-color-${team}2`);
      const logoInput = document.getElementById(`setting-logo-${team}`);
      const nameInput = document.getElementById(`setting-name-${team}`);
      const logoImg = document.getElementById(`control-preview-img-${team}`);

      const logoUrl = (logoImg && logoImg.src) ? logoImg.src : (logoInput ? logoInput.value : '');
      const teamTitle = nameInput && nameInput.value.trim() ? nameInput.value.trim() : (team === 'a' ? '1. Takım' : '2. Takım');

      if (typeof window.openLogoEyedropper === 'function') {
        window.openLogoEyedropper({
          logoUrl,
          teamTitle,
          initialColor1: color1Input ? color1Input.value : '#ffed00',
          initialColor2: color2Input ? color2Input.value : '#002d72',
          onApply: (c1, c2) => {
            if (color1Input) {
              color1Input.value = c1;
              color1Input.dispatchEvent(new Event('change'));
            }
            if (color2Input) {
              color2Input.value = c2;
              color2Input.dispatchEvent(new Event('change'));
            }
          }
        });
      }
    });
  });

  document.getElementById('btn-open-settings').addEventListener('click', async () => {
    if (!currentBoard) return;
    await loadControlLogos();

    document.getElementById('setting-title').value = currentBoard.title || '';
    document.getElementById('setting-subtitle').value = currentBoard.subtitle || '';
    document.getElementById('setting-name-a').value = currentBoard.teamA.name || '';
    document.getElementById('setting-short-a').value = currentBoard.teamA.shortName || '';
    document.getElementById('setting-color-a').value = currentBoard.teamA.color || currentBoard.teamA.accentColor || '#ffed00';
    if (document.getElementById('setting-color-a2')) {
      document.getElementById('setting-color-a2').value = currentBoard.teamA.color2 || currentBoard.teamA.secondaryColor || '#002d72';
    }
    
    const logoA = currentBoard.teamA.logo || '/assets/fenerbahce.svg';
    document.getElementById('setting-logo-a').value = logoA;

    const logoB = currentBoard.teamB.logo || '/assets/opponent.svg';
    document.getElementById('setting-logo-b').value = logoB;

    populateControlLogoSelects();

    if (selectLogoA) selectLogoA.value = logoA;
    if (previewImgA) previewImgA.src = logoA;

    document.getElementById('setting-name-b').value = currentBoard.teamB.name || '';
    document.getElementById('setting-short-b').value = currentBoard.teamB.shortName || '';
    document.getElementById('setting-color-b').value = currentBoard.teamB.color || currentBoard.teamB.accentColor || '#d61c35';
    if (document.getElementById('setting-color-b2')) {
      document.getElementById('setting-color-b2').value = currentBoard.teamB.color2 || currentBoard.teamB.secondaryColor || '#ffed00';
    }
    
    if (selectLogoB) selectLogoB.value = logoB;
    if (previewImgB) previewImgB.src = logoB;

    document.getElementById('setting-max-sets').value = currentBoard.rules.maxSets || 5;
    document.getElementById('setting-set-points').value = currentBoard.rules.setPoints || 25;
    document.getElementById('setting-final-points').value = currentBoard.rules.finalSetPoints || 15;

    // Operator Link
    const opInput = document.getElementById('setting-operator-url');
    if (opInput) {
      opInput.value = `${window.location.origin}/operate/${currentBoard.id}`;
    }

    modalSettings.classList.add('active');
  });

  // Copy Operator Link
  const btnCopyOp = document.getElementById('btn-copy-operator-link');
  if (btnCopyOp) {
    btnCopyOp.addEventListener('click', () => {
      const opInput = document.getElementById('setting-operator-url');
      if (!opInput || !opInput.value) return;
      navigator.clipboard.writeText(opInput.value).then(() => {
        showToast('Skorcu kumanda linki kopyalandı!');
      }).catch(() => {
        prompt('Link:', opInput.value);
      });
    });
  }

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    modalSettings.classList.remove('active');
  });

  document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Save Teams
    await sendAction('update_teams', {
      teamA: {
        name: document.getElementById('setting-name-a').value.trim(),
        shortName: document.getElementById('setting-short-a').value.trim(),
        accentColor: document.getElementById('setting-color-a').value,
        color: document.getElementById('setting-color-a').value,
        color2: document.getElementById('setting-color-a2') ? document.getElementById('setting-color-a2').value : '#002d72',
        logo: document.getElementById('setting-logo-a').value.trim()
      },
      teamB: {
        name: document.getElementById('setting-name-b').value.trim(),
        shortName: document.getElementById('setting-short-b').value.trim(),
        accentColor: document.getElementById('setting-color-b').value,
        color: document.getElementById('setting-color-b').value,
        color2: document.getElementById('setting-color-b2') ? document.getElementById('setting-color-b2').value : '#ffed00',
        logo: document.getElementById('setting-logo-b').value.trim()
      }
    });

    // Save Rules & Meta
    await sendAction('update_rules', {
      rules: {
        maxSets: parseInt(document.getElementById('setting-max-sets').value, 10),
        setPoints: parseInt(document.getElementById('setting-set-points').value, 10),
        finalSetPoints: parseInt(document.getElementById('setting-final-points').value, 10)
      }
    });

    await sendAction('update_meta', {
      title: document.getElementById('setting-title').value.trim(),
      subtitle: document.getElementById('setting-subtitle').value.trim()
    });

    modalSettings.classList.remove('active');
    showToast('Ayarlar kaydedildi!');
  });

  document.getElementById('btn-reset-match').addEventListener('click', async () => {
    if (await confirmResetMatch()) {
      sendAction('reset_match');
      modalSettings.classList.remove('active');
      showToast('Maç sıfırlandı!');
    }
  });

  // Point History Modal
  const modalHistory = document.getElementById('modal-history');
  const elHistoryLog = document.getElementById('history-log');

  function renderHistoryLog() {
    if (!currentBoard) return;
    const log = currentBoard.pointLog || [];
    const bySet = new Map();
    log.forEach((e) => {
      if (!bySet.has(e.set)) bySet.set(e.set, []);
      bySet.get(e.set).push(e);
    });
    if (bySet.size === 0) {
      elHistoryLog.innerHTML = '<div style="opacity:.7;">Henüz kayıtlı sayı yok.</div>';
      return;
    }
    let html = '';
    [...bySet.keys()].sort((a, b) => b - a).forEach((setNo) => {
      let a = 0;
      let b = 0;
      const rows = bySet.get(setNo).map((e, i) => {
        if (e.team === 'teamA') a++; else b++;
        const team = currentBoard[e.team];
        const time = e.t ? new Date(e.t).toLocaleTimeString('tr-TR') : '';
        return `<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid var(--border-color);">
          <span style="width:2em;opacity:.6;">${i + 1}</span>
          <span style="flex:1;font-weight:700;color:${escapeHtml(team.color || '#fff')};">${escapeHtml(team.name)}</span>
          <span style="width:4.5em;text-align:right;">${a} - ${b}</span>
          <span style="width:6em;text-align:right;opacity:.6;">${time}</span>
        </div>`;
      });
      html += `<h4 style="margin:12px 0 4px;font-weight:800;">${setNo}. Set (${a} - ${b})</h4>${rows.reverse().join('')}`;
    });
    elHistoryLog.innerHTML = html;
  }

  document.getElementById('btn-history').addEventListener('click', () => {
    renderHistoryLog();
    modalHistory.classList.add('active');
  });
  document.getElementById('btn-close-history').addEventListener('click', () => {
    modalHistory.classList.remove('active');
  });
  document.getElementById('btn-show-history-overlay').addEventListener('click', () => {
    sendAction('show_history');
    showToast('Sayı geçmişi overlay üzerinde gösteriliyor');
  });

  // OBS Modal Links
  document.getElementById('btn-open-obs').addEventListener('click', () => {
    const origin = window.location.origin;
    document.getElementById('obs-topbar-url').value = `${origin}/overlay/${boardId}?theme=topbar`;
    document.getElementById('obs-lowerthird-url').value = `${origin}/overlay/${boardId}?theme=lowerthird`;
    document.getElementById('obs-bug-url').value = `${origin}/overlay/${boardId}?theme=bug`;
    document.getElementById('obs-live-url').value = `${origin}/live/${boardId}`;
    modalObs.classList.add('active');
  });

  document.getElementById('btn-close-obs').addEventListener('click', () => {
    modalObs.classList.remove('active');
  });

  // Copy buttons
  document.querySelectorAll('.btn-copy-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetInputId = btn.getAttribute('data-target');
      const input = document.getElementById(targetInputId);
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        const originalText = btn.textContent;
        btn.textContent = 'Kopyalandı!';
        setTimeout(() => (btn.textContent = originalText), 1800);
      }
    });
  });

  // Comprehensive Keyboard Shortcuts (Barlow / Skorboard.dc style + standard)
  window.addEventListener('keydown', (e) => {
    // Ignore when typing in input
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
    // Arrow Left/Right: Score +1
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
    // R: New Set
    else if (k === 'r' && !e.ctrlKey && !e.metaKey) {
      if (e.shiftKey) {
        confirmResetMatch().then((ok) => { if (ok) sendAction('reset_match'); });
      } else {
        sendAction('end_set');
      }
    }
  });

  // Session Auth Verification
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!data.authenticated || !data.user) {
        window.location.href = '/login';
        return;
      }
    } catch (e) {
      window.location.href = '/login';
    }
  }

  // Initialize
  checkAuth();
  loadControlLogos();
  connectSSE();
})();
