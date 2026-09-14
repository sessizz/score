// Operator (Referee/Scorer) Control Panel JS
(function () {
  'use strict';

  let currentBoard = null;
  let boardId = null;
  let operatorToken = null;
  let eventSource = null;
  let timeoutInterval = null;
  let clockInterval = null;
  let clockState = { running: false, startedAt: null, elapsedMs: 0 };
  let audioCtx = null;

  // Extract token from URL path (/operate/:token) or query params
  function extractToken() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && (pathParts[0] === 'operate' || pathParts[0] === 'operate.html')) {
      return decodeURIComponent(pathParts[1]).trim();
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || params.get('op') || params.get('id') || params.get('board') || (pathParts.length === 1 && pathParts[0] !== 'operate' ? pathParts[0] : null);
  }

  // Safe DOM helper
  function on(idOrEl, event, handler) {
    const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (el) {
      el.addEventListener(event, handler);
    }
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

  // Audio Synth via Web Audio API
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
    const targetId = boardId || operatorToken;
    if (!targetId || !operatorToken) return false;
    try {
      const response = await fetch(`/api/board/${encodeURIComponent(targetId)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Token': operatorToken
        },
        body: JSON.stringify({ action, payload, operatorToken })
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

  // Clock format & ticker
  function formatTime(ms) {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getActiveElapsedMs() {
    let ms = clockState.elapsedMs || 0;
    if (clockState.running && clockState.startedAt) {
      ms += Math.max(0, Date.now() - clockState.startedAt);
    }
    return ms;
  }

  function syncClockDisplay() {
    if (elClockVal) {
      elClockVal.textContent = formatTime(getActiveElapsedMs());
    }
    if (elClockPlay && elClockToggle) {
      if (clockState.running) {
        elClockPlay.classList.add('is-active');
        elClockToggle.classList.remove('is-active');
      } else {
        elClockPlay.classList.remove('is-active');
        elClockToggle.classList.toggle('is-active', (clockState.elapsedMs || 0) > 0);
      }
    }
  }

  function startClockTicker() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(syncClockDisplay, 250);
  }

  // Render Board
  function renderBoard(board) {
    if (!board) return;
    currentBoard = board;

    if (elMatchTitle && board.title) elMatchTitle.textContent = board.title;
    if (elMatchSub && board.subtitle) elMatchSub.textContent = board.subtitle;

    // Clock
    clockState = board.setClock || { running: false, startedAt: null, elapsedMs: 0 };
    syncClockDisplay();
    startClockTicker();

    // Set Status
    if (elSetPill) elSetPill.textContent = `${board.currentSet || 1}. SET`;

    // Set History
    if (elHistoryList) {
      if (board.setHistory && board.setHistory.length > 0) {
        elHistoryList.innerHTML = board.setHistory.map(h => {
          const leftSc = board.courtSwapped ? h.scoreB : h.scoreA;
          const rightSc = board.courtSwapped ? h.scoreA : h.scoreB;
          return `<div class="history-pill">${h.set}. Set: ${leftSc}-${rightSc}</div>`;
        }).join('');
      } else {
        elHistoryList.innerHTML = '';
      }
    }

    // Timeout state
    const elLeftBadge = document.getElementById('left-to-badge');
    const elRightBadge = document.getElementById('right-to-badge');

    if (board.status === 'timeout' && board.timeoutState && board.timeoutState.active) {
      if (elTimeoutBanner) elTimeoutBanner.classList.add('active');
      const teamKey = board.timeoutState.team;
      const teamObj = teamKey === 'teamA' ? board.teamA : board.teamB;
      if (elTimeoutTeamName && teamObj) elTimeoutTeamName.textContent = `${teamObj.name || ''} Molası`;

      const isSwapped = Boolean(board.courtSwapped);
      const isLeftTimeout = (teamKey === 'teamA' && !isSwapped) || (teamKey === 'teamB' && isSwapped);

      if (timeoutInterval) clearInterval(timeoutInterval);
      timeoutInterval = setInterval(() => {
        const remainSec = Math.max(0, Math.ceil((board.timeoutState.endsAt - Date.now()) / 1000));
        if (elTimeoutTimer) elTimeoutTimer.textContent = `${remainSec}s`;
        if (elLeftBadge) {
          elLeftBadge.style.display = isLeftTimeout ? 'inline-block' : 'none';
          if (isLeftTimeout) elLeftBadge.textContent = `${remainSec}s`;
        }
        if (elRightBadge) {
          elRightBadge.style.display = !isLeftTimeout ? 'inline-block' : 'none';
          if (!isLeftTimeout) elRightBadge.textContent = `${remainSec}s`;
        }
        if (remainSec <= 0) {
          clearInterval(timeoutInterval);
          if (elTimeoutBanner) elTimeoutBanner.classList.remove('active');
          if (elLeftBadge) elLeftBadge.style.display = 'none';
          if (elRightBadge) elRightBadge.style.display = 'none';
        }
      }, 250);
    } else {
      if (elTimeoutBanner) elTimeoutBanner.classList.remove('active');
      if (timeoutInterval) clearInterval(timeoutInterval);
      if (elLeftBadge) elLeftBadge.style.display = 'none';
      if (elRightBadge) elRightBadge.style.display = 'none';
    }

    // Left vs Right teams mapped by courtSwapped
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    // Left Team
    if (leftName) leftName.textContent = leftData?.name || 'EV SAHİBİ';
    if (leftShort) leftShort.textContent = leftData?.shortName || '';
    if (leftSets) leftSets.textContent = `${leftData?.setsWon || 0} Set`;
    if (leftPointVal) leftPointVal.textContent = leftData?.points || 0;
    if (leftCard && leftData?.color) leftCard.style.borderColor = (leftData.color || '#ffed00') + '66';

    if (leftLogo) {
      if (leftData?.logo) {
        leftLogo.src = leftData.logo;
        leftLogo.style.display = 'block';
      } else {
        leftLogo.style.display = 'none';
      }
    }

    if (leftServeBtn) leftServeBtn.classList.toggle('is-serving', Boolean(leftData?.isServing));
    if (leftToDot1) leftToDot1.classList.toggle('is-used', (leftData?.timeouts || 0) >= 1);
    if (leftToDot2) leftToDot2.classList.toggle('is-used', (leftData?.timeouts || 0) >= 2);
    if (leftTimeoutBtn) leftTimeoutBtn.disabled = (leftData?.timeouts || 0) >= 2;

    // Right Team
    if (rightName) rightName.textContent = rightData?.name || 'DEPLASMAN';
    if (rightShort) rightShort.textContent = rightData?.shortName || '';
    if (rightSets) rightSets.textContent = `${rightData?.setsWon || 0} Set`;
    if (rightPointVal) rightPointVal.textContent = rightData?.points || 0;
    if (rightCard && rightData?.color) rightCard.style.borderColor = (rightData.color || '#d61c35') + '66';

    if (rightLogo) {
      if (rightData?.logo) {
        rightLogo.src = rightData.logo;
        rightLogo.style.display = 'block';
      } else {
        rightLogo.style.display = 'none';
      }
    }

    if (rightServeBtn) rightServeBtn.classList.toggle('is-serving', Boolean(rightData?.isServing));
    if (rightToDot1) rightToDot1.classList.toggle('is-used', (rightData?.timeouts || 0) >= 1);
    if (rightToDot2) rightToDot2.classList.toggle('is-used', (rightData?.timeouts || 0) >= 2);
    if (rightTimeoutBtn) rightTimeoutBtn.disabled = (rightData?.timeouts || 0) >= 2;
  }

  // Connect SSE
  function connectSSE() {
    if (!boardId) return;
    if (eventSource) {
      try { eventSource.close(); } catch (e) {}
    }
    eventSource = new EventSource(`/api/board/${encodeURIComponent(boardId)}/stream`);

    eventSource.onopen = () => {
      if (elConnDot) elConnDot.className = 'conn-dot';
      if (elConnText) elConnText.textContent = 'Canlı Bağlantı';
    };

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        renderBoard(board);
      } catch (err) {
        console.error('SSE JSON error', err);
      }
    });

    eventSource.onerror = () => {
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Bağlantı koptu';
    };
  }

  // Resolve board by operator token or board ID
  async function initOperator() {
    operatorToken = extractToken();
    if (!operatorToken) {
      if (elMatchTitle) elMatchTitle.textContent = 'Operatör Kodu Bulunamadı';
      if (elMatchSub) elMatchSub.textContent = 'URL adresinde geçerli bir kod bulunamadı (Örn: /operate/abcd)';
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Bağlantı Yok';
      return;
    }

    if (elConnText) elConnText.textContent = 'Bağlanıyor...';

    try {
      const res = await fetch(`/api/board/by-operator/${encodeURIComponent(operatorToken)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.board) {
        if (elMatchTitle) elMatchTitle.textContent = 'Skorboard Bulunamadı';
        if (elMatchSub) elMatchSub.textContent = (data && data.error) ? data.error : 'Operatör linki geçersiz veya bulunamadı.';
        if (elConnDot) elConnDot.className = 'conn-dot disconnected';
        if (elConnText) elConnText.textContent = 'Bulunamadı';
        return;
      }

      boardId = data.boardId || data.board.id;
      renderBoard(data.board);
      connectSSE();
    } catch (e) {
      console.error('Operator init error:', e);
      if (elMatchTitle) elMatchTitle.textContent = 'Bağlantı Hatası';
      if (elMatchSub) elMatchSub.textContent = 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.';
      if (elConnDot) elConnDot.className = 'conn-dot disconnected';
      if (elConnText) elConnText.textContent = 'Hata';
    }
  }

  // Wire User Interactions defensively
  on('left-point-area', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'point_b' : 'point_a';
    playBeep(880, 'sine', 0.1);
    sendAction(teamAction);
  });

  on('right-point-area', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'point_a' : 'point_b';
    playBeep(880, 'sine', 0.1);
    sendAction(teamAction);
  });

  on('left-sub-point', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'sub_point_b' : 'sub_point_a';
    playBeep(440, 'sine', 0.08);
    sendAction(teamAction);
  });

  on('right-sub-point', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'sub_point_a' : 'sub_point_b';
    playBeep(440, 'sine', 0.08);
    sendAction(teamAction);
  });

  on('left-serve-btn', 'click', () => {
    if (!currentBoard) return;
    const team = currentBoard.courtSwapped ? 'teamB' : 'teamA';
    playBeep(660, 'triangle', 0.08);
    sendAction('set_serve', { team });
  });

  on('right-serve-btn', 'click', () => {
    if (!currentBoard) return;
    const team = currentBoard.courtSwapped ? 'teamA' : 'teamB';
    playBeep(660, 'triangle', 0.08);
    sendAction('set_serve', { team });
  });

  on('left-timeout-btn', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'timeout_b' : 'timeout_a';
    playWhistle();
    sendAction(teamAction, { duration: 30 });
  });

  on('right-timeout-btn', 'click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'timeout_a' : 'timeout_b';
    playWhistle();
    sendAction(teamAction, { duration: 30 });
  });

  on('btn-end-timeout', 'click', () => {
    playWhistle();
    sendAction('end_timeout');
  });

  on('btn-clock-play', 'click', () => {
    sendAction('clock_start');
  });

  on('btn-clock-toggle', 'click', () => {
    if (clockState.running) {
      sendAction('clock_pause');
    } else {
      if ((clockState.elapsedMs || 0) > 0 && confirm('Set sayacını sıfırlamak istiyor musunuz?')) {
        sendAction('clock_reset');
      }
    }
  });

  on('btn-undo', 'click', () => {
    playBeep(520, 'sine', 0.12);
    sendAction('undo');
  });

  on('btn-swap', 'click', () => {
    playBeep(700, 'sine', 0.08);
    sendAction('swap_sides');
  });
  on('btn-swap-sides', 'click', () => {
    playBeep(700, 'sine', 0.08);
    sendAction('swap_sides');
  });

  on('btn-end-set', 'click', () => {
    if (!currentBoard) return;
    const pA = currentBoard.teamA?.points || 0;
    const pB = currentBoard.teamB?.points || 0;
    const winner = pA > pB ? 'teamA' : (pB > pA ? 'teamB' : null);
    const winName = winner === 'teamA' ? currentBoard.teamA?.name : (winner === 'teamB' ? currentBoard.teamB?.name : 'Belirsiz');

    if (confirm(`Seti bitirmek istediğinizden emin misiniz?\nKazanan: ${winName} (${pA} - ${pB})`)) {
      playWhistle();
      sendAction('end_set', { winner });
    }
  });

  on('btn-new-set', 'click', () => {
    sendAction('new_set');
  });

  // Start initialization when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOperator);
  } else {
    initOperator();
  }
})();
