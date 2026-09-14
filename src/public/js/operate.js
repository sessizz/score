// Operator (Referee/Scorer) Control Panel JS
(function () {
  let currentBoard = null;
  let boardId = null;
  let operatorToken = null;
  let eventSource = null;
  let timeoutInterval = null;
  let clockInterval = null;
  let clockState = { running: false, startedAt: null, elapsedMs: 0 };

  // Extract operatorToken from URL path (/operate/:token) or query param (?token=...)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && pathParts[0] === 'operate') {
    operatorToken = pathParts[1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) operatorToken = urlParams.get('token');
    else if (urlParams.has('op')) operatorToken = urlParams.get('op');
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
    } catch (e) {}
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

  // Action Dispatcher for Operator
  async function sendAction(action, payload = {}) {
    if (!boardId || !operatorToken) return;
    try {
      const response = await fetch(`/api/board/${boardId}/action`, {
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

  // Formatting clock
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
    if (!elClockVal) return;
    elClockVal.textContent = formatTime(getActiveElapsedMs());
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
    currentBoard = board;

    if (board.title) elMatchTitle.textContent = board.title;
    if (board.subtitle) elMatchSub.textContent = board.subtitle;

    // Clock
    clockState = board.setClock || { running: false, startedAt: null, elapsedMs: 0 };
    syncClockDisplay();
    startClockTicker();

    // Set Status
    elSetPill.textContent = `${board.currentSet || 1}. SET`;

    // Set History
    if (board.setHistory && board.setHistory.length > 0) {
      elHistoryList.innerHTML = board.setHistory.map(h => {
        const leftSc = board.courtSwapped ? h.scoreB : h.scoreA;
        const rightSc = board.courtSwapped ? h.scoreA : h.scoreB;
        return `<div class="history-pill">${h.set}. Set: ${leftSc}-${rightSc}</div>`;
      }).join('');
    } else {
      elHistoryList.innerHTML = '';
    }

    // Timeout state
    const elLeftBadge = document.getElementById('left-to-badge');
    const elRightBadge = document.getElementById('right-to-badge');

    if (board.status === 'timeout' && board.timeoutState && board.timeoutState.active) {
      elTimeoutBanner.classList.add('active');
      const teamKey = board.timeoutState.team;
      const teamObj = teamKey === 'teamA' ? board.teamA : board.teamB;
      elTimeoutTeamName.textContent = `${teamObj.name} Molası`;

      const isSwapped = Boolean(board.courtSwapped);
      const isLeftTimeout = (teamKey === 'teamA' && !isSwapped) || (teamKey === 'teamB' && isSwapped);

      if (timeoutInterval) clearInterval(timeoutInterval);
      timeoutInterval = setInterval(() => {
        const remainSec = Math.max(0, Math.ceil((board.timeoutState.endsAt - Date.now()) / 1000));
        elTimeoutTimer.textContent = `${remainSec}s`;
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
          elTimeoutBanner.classList.remove('active');
          if (elLeftBadge) elLeftBadge.style.display = 'none';
          if (elRightBadge) elRightBadge.style.display = 'none';
        }
      }, 250);
    } else {
      elTimeoutBanner.classList.remove('active');
      if (timeoutInterval) clearInterval(timeoutInterval);
      if (elLeftBadge) elLeftBadge.style.display = 'none';
      if (elRightBadge) elRightBadge.style.display = 'none';
    }

    // Left vs Right teams mapped by courtSwapped
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    // Left Team
    leftName.textContent = leftData.name || 'EV SAHİBİ';
    leftShort.textContent = leftData.shortName || '';
    leftSets.textContent = `${leftData.setsWon || 0} Set`;
    leftPointVal.textContent = leftData.points || 0;
    leftCard.style.borderColor = (leftData.color || '#ffed00') + '66';

    if (leftData.logo) {
      leftLogo.src = leftData.logo;
      leftLogo.style.display = 'block';
    } else {
      leftLogo.style.display = 'none';
    }

    leftServeBtn.classList.toggle('is-serving', Boolean(leftData.isServing));
    leftToDot1.classList.toggle('is-used', (leftData.timeouts || 0) >= 1);
    leftToDot2.classList.toggle('is-used', (leftData.timeouts || 0) >= 2);
    leftTimeoutBtn.disabled = (leftData.timeouts || 0) >= 2;

    // Right Team
    rightName.textContent = rightData.name || 'DEPLASMAN';
    rightShort.textContent = rightData.shortName || '';
    rightSets.textContent = `${rightData.setsWon || 0} Set`;
    rightPointVal.textContent = rightData.points || 0;
    rightCard.style.borderColor = (rightData.color || '#d61c35') + '66';

    if (rightData.logo) {
      rightLogo.src = rightData.logo;
      rightLogo.style.display = 'block';
    } else {
      rightLogo.style.display = 'none';
    }

    rightServeBtn.classList.toggle('is-serving', Boolean(rightData.isServing));
    rightToDot1.classList.toggle('is-used', (rightData.timeouts || 0) >= 1);
    rightToDot2.classList.toggle('is-used', (rightData.timeouts || 0) >= 2);
    rightTimeoutBtn.disabled = (rightData.timeouts || 0) >= 2;
  }

  // Connect SSE
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.onopen = () => {
      elConnDot.classList.add('online');
      elConnText.textContent = 'Canlı Bağlantı';
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
      elConnDot.classList.remove('online');
      elConnText.textContent = 'Bağlantı koptu';
    };
  }

  // Resolve board by operator token
  async function initOperator() {
    if (!operatorToken) {
      elMatchTitle.textContent = 'Geçersiz Operatör Linki';
      elMatchSub.textContent = 'Lütfen yöneticiden aldığınız linki kontrol edin.';
      return;
    }

    try {
      const res = await fetch(`/api/board/by-operator/${operatorToken}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.board) {
        elMatchTitle.textContent = 'Skorboard Bulunamadı';
        elMatchSub.textContent = data.error || 'Operatör linki geçersiz.';
        return;
      }

      boardId = data.boardId;
      renderBoard(data.board);
      connectSSE();
    } catch (e) {
      elMatchTitle.textContent = 'Bağlantı Hatası';
      elMatchSub.textContent = 'Sunucuya ulaşılamadı.';
    }
  }

  // Wire User Interactions

  // Left Point (+1)
  leftPointArea.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'point_b' : 'point_a';
    playBeep(880, 'sine', 0.1);
    sendAction(teamAction);
  });

  // Right Point (+1)
  rightPointArea.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'point_a' : 'point_b';
    playBeep(880, 'sine', 0.1);
    sendAction(teamAction);
  });

  // Left Sub Point (-1)
  leftSubPointBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'sub_point_b' : 'sub_point_a';
    playBeep(440, 'sine', 0.08);
    sendAction(teamAction);
  });

  // Right Sub Point (-1)
  rightSubPointBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'sub_point_a' : 'sub_point_b';
    playBeep(440, 'sine', 0.08);
    sendAction(teamAction);
  });

  // Left Serve
  leftServeBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const team = currentBoard.courtSwapped ? 'teamB' : 'teamA';
    playBeep(660, 'triangle', 0.08);
    sendAction('set_serve', { team });
  });

  // Right Serve
  rightServeBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const team = currentBoard.courtSwapped ? 'teamA' : 'teamB';
    playBeep(660, 'triangle', 0.08);
    sendAction('set_serve', { team });
  });

  // Left Timeout
  leftTimeoutBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'timeout_b' : 'timeout_a';
    playWhistle();
    sendAction(teamAction, { duration: 30 });
  });

  // Right Timeout
  rightTimeoutBtn.addEventListener('click', () => {
    if (!currentBoard) return;
    const teamAction = currentBoard.courtSwapped ? 'timeout_a' : 'timeout_b';
    playWhistle();
    sendAction(teamAction, { duration: 30 });
  });

  // End Timeout
  document.getElementById('btn-end-timeout').addEventListener('click', () => {
    playWhistle();
    sendAction('end_timeout');
  });

  // Set Clock Controls
  elClockPlay.addEventListener('click', () => {
    sendAction('clock_start');
  });

  elClockToggle.addEventListener('click', () => {
    if (clockState.running) {
      sendAction('clock_pause');
    } else {
      if ((clockState.elapsedMs || 0) > 0 && confirm('Set sayacını sıfırlamak istiyor musunuz?')) {
        sendAction('clock_reset');
      }
    }
  });

  // Undo Action
  document.getElementById('btn-undo').addEventListener('click', () => {
    playBeep(520, 'sine', 0.12);
    sendAction('undo');
  });

  // Swap Sides
  const btnSwapEl = document.getElementById('btn-swap') || document.getElementById('btn-swap-sides');
  if (btnSwapEl) {
    btnSwapEl.addEventListener('click', () => {
      playBeep(700, 'sine', 0.08);
      sendAction('swap_sides');
    });
  }

  // End Set
  document.getElementById('btn-end-set').addEventListener('click', () => {
    if (!currentBoard) return;
    const pA = currentBoard.teamA.points;
    const pB = currentBoard.teamB.points;
    const winner = pA > pB ? 'teamA' : (pB > pA ? 'teamB' : null);
    const winName = winner === 'teamA' ? currentBoard.teamA.name : (winner === 'teamB' ? currentBoard.teamB.name : 'Belirsiz');

    if (confirm(`Seti bitirmek istediğinizden emin misiniz?\nKazanan: ${winName} (${pA} - ${pB})`)) {
      playWhistle();
      sendAction('end_set', { winner });
    }
  });

  // New Set
  document.getElementById('btn-new-set').addEventListener('click', () => {
    sendAction('new_set');
  });

  // Init
  initOperator();
})();
