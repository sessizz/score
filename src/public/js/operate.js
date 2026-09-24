// Operator (Referee/Scorer) Control Panel JS
(function () {
  'use strict';

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
    return params.get('id') || params.get('board') || params.get('token') || (pathParts.length === 1 && pathParts[0] !== 'operate' ? pathParts[0] : 'fenerbahce');
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

  // Action Dispatcher for Operator
  async function sendAction(action, payload = {}) {
    if (!boardId) return false;
    try {
      const response = await fetch(`/api/board/${encodeURIComponent(boardId)}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        showToast(data.error || 'İşlem gerçekleştirilemedi', true);
        return false;
      }
      return true;
    } catch (err) {
      showToast('Bağlantı hatası!', true);
      return false;
    }
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
    return base + Math.max(0, Date.now() - clockState.startedAt);
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
    if (timeoutInterval) {
      clearInterval(timeoutInterval);
      timeoutInterval = null;
    }
  }

  function startLocalTimeoutTimer(endsAt) {
    if (timeoutInterval) clearInterval(timeoutInterval);
    timeoutInterval = null;

    function update() {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (elTimeoutTimer) elTimeoutTimer.textContent = `${remaining}s`;

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
    if (leftPointVal) leftPointVal.textContent = leftData.points || 0;

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
    if (rightPointVal) rightPointVal.textContent = rightData.points || 0;

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
    btnEndSet.addEventListener('click', () => {
      if (!currentBoard) return;
      const pA = currentBoard.teamA.points;
      const pB = currentBoard.teamB.points;
      const winnerName = pA > pB ? currentBoard.teamA.name : currentBoard.teamB.name;
      if (confirm(`Mevcut seti bitirmek istiyor musunuz?\nKazanan: ${winnerName} (${pA} - ${pB})`)) {
        playWhistle();
        sendAction('end_set');
        showToast(`${currentBoard.currentSet}. Set tamamlandı!`);
      }
    });
  }

  const btnNewSet = document.getElementById('btn-new-set');
  if (btnNewSet) {
    btnNewSet.addEventListener('click', () => {
      sendAction('new_set');
      showToast('Yeni set başlatıldı');
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
        renderBoard(board);
        if (elConnDot) elConnDot.className = 'conn-dot';
        if (elConnText) elConnText.textContent = 'Canlı (SSE)';
      } catch (err) {
        console.error('SSE JSON error', err);
      }
    });

    eventSource.addEventListener('ping', () => {
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
      if (elMatchTitle) elMatchTitle.textContent = 'Skorboard Kodu Bulunamadı';
      if (elMatchSub) elMatchSub.textContent = 'URL adresinde geçerli bir skorboard kodu bulunamadı (Örn: /operate/abcd)';
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Bağlantı Yok';
      return;
    }

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
        return;
      }

      boardId = board.id || boardId;
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
