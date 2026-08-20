// Referee & Scorekeeper Control Panel JS
(function () {
  let currentBoard = null;
  let boardId = 'fenerbahce';
  let eventSource = null;
  let timeoutInterval = null;

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

  // Action Dispatcher
  async function sendAction(action, payload = {}) {
    try {
      const pin = localStorage.getItem('score_admin_pin') || '';
      const response = await fetch(`/api/board/${boardId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, pin })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        showToast(data.error || 'İşlem başarısız!', true);
        return false;
      }
      return true;
    } catch (err) {
      showToast('Sunucu bağlantı hatası!', true);
      return false;
    }
  }

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
        currentBoard = board;
        renderBoard(board);
        elConnDot.className = 'conn-dot';
        elConnText.textContent = 'Canlı (SSE)';
      } catch (err) {
        console.error('Failed to parse board state', err);
      }
    });

    eventSource.addEventListener('ping', () => {
      elConnDot.className = 'conn-dot';
    });

    eventSource.onerror = () => {
      elConnDot.className = 'conn-dot disconnected';
      elConnText.textContent = 'Koptu (Yenileniyor...)';
    };
  }

  // Render State
  function renderBoard(board) {
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
    leftPointVal.textContent = leftData.points;
    leftLogo.src = leftData.logo || '/assets/fenerbahce.svg';
    leftCard.style.borderColor = leftData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
    leftServeBtn.className = `serve-btn ${leftData.isServing ? 'is-serving' : ''}`;
    leftToDot1.className = `to-dot ${leftData.timeouts >= 1 ? 'used' : ''}`;
    leftToDot2.className = `to-dot ${leftData.timeouts >= 2 ? 'used' : ''}`;

    // Render Right
    rightName.textContent = rightData.name;
    rightShort.textContent = rightData.shortName;
    rightSets.textContent = `${rightData.setsWon} Set`;
    rightPointVal.textContent = rightData.points;
    rightLogo.src = rightData.logo || '/assets/opponent.svg';
    rightCard.style.borderColor = rightData.isServing ? 'var(--fb-yellow)' : 'var(--border-color)';
    rightServeBtn.className = `serve-btn ${rightData.isServing ? 'is-serving' : ''}`;
    rightToDot1.className = `to-dot ${rightData.timeouts >= 1 ? 'used' : ''}`;
    rightToDot2.className = `to-dot ${rightData.timeouts >= 2 ? 'used' : ''}`;

    // Handle Timeout Banner
    if (board.timeoutState && board.timeoutState.active) {
      elTimeoutBanner.classList.add('active');
      const team = board[board.timeoutState.team];
      elTimeoutTeamName.textContent = `${team ? team.name : ''} Molası`;
      startLocalTimeoutTimer(board.timeoutState.endsAt);
    } else {
      elTimeoutBanner.classList.remove('active');
      if (timeoutInterval) clearInterval(timeoutInterval);
    }
  }

  function startLocalTimeoutTimer(endsAt) {
    if (timeoutInterval) clearInterval(timeoutInterval);
    function update() {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      elTimeoutTimer.textContent = `${remaining}s`;
      if (remaining <= 0) {
        clearInterval(timeoutInterval);
        playWhistle();
      }
    }
    update();
    timeoutInterval = setInterval(update, 500);
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

  document.getElementById('btn-end-set').addEventListener('click', () => {
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

  // Settings Modal & OBS Links Modal
  const modalSettings = document.getElementById('modal-settings');
  const modalObs = document.getElementById('modal-obs');

  document.getElementById('btn-open-settings').addEventListener('click', () => {
    if (!currentBoard) return;
    document.getElementById('setting-title').value = currentBoard.title || '';
    document.getElementById('setting-subtitle').value = currentBoard.subtitle || '';
    document.getElementById('setting-name-a').value = currentBoard.teamA.name || '';
    document.getElementById('setting-short-a').value = currentBoard.teamA.shortName || '';
    document.getElementById('setting-color-a').value = currentBoard.teamA.accentColor || currentBoard.teamA.color || '#ffed00';
    document.getElementById('setting-logo-a').value = currentBoard.teamA.logo || '';

    document.getElementById('setting-name-b').value = currentBoard.teamB.name || '';
    document.getElementById('setting-short-b').value = currentBoard.teamB.shortName || '';
    document.getElementById('setting-color-b').value = currentBoard.teamB.accentColor || currentBoard.teamB.color || '#d61c35';
    document.getElementById('setting-logo-b').value = currentBoard.teamB.logo || '';

    document.getElementById('setting-max-sets').value = currentBoard.rules.maxSets || 5;
    document.getElementById('setting-set-points').value = currentBoard.rules.setPoints || 25;
    document.getElementById('setting-final-points').value = currentBoard.rules.finalSetPoints || 15;
    document.getElementById('setting-pin').value = currentBoard.adminPin || '1907';

    modalSettings.classList.add('active');
  });

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    modalSettings.classList.remove('active');
  });

  document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('setting-pin').value.trim();
    localStorage.setItem('score_admin_pin', pin);

    // Save Teams
    await sendAction('update_teams', {
      teamA: {
        name: document.getElementById('setting-name-a').value.trim(),
        shortName: document.getElementById('setting-short-a').value.trim(),
        accentColor: document.getElementById('setting-color-a').value,
        color: document.getElementById('setting-color-a').value,
        logo: document.getElementById('setting-logo-a').value.trim()
      },
      teamB: {
        name: document.getElementById('setting-name-b').value.trim(),
        shortName: document.getElementById('setting-short-b').value.trim(),
        accentColor: document.getElementById('setting-color-b').value,
        color: document.getElementById('setting-color-b').value,
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
      subtitle: document.getElementById('setting-subtitle').value.trim(),
      adminPin: pin
    });

    modalSettings.classList.remove('active');
    showToast('Ayarlar kaydedildi!');
  });

  document.getElementById('btn-reset-match').addEventListener('click', () => {
    if (confirm('DİKKAT: Tüm maç sıfırlanacak (Setler ve skorlar silinecek). Emin misiniz?')) {
      sendAction('reset_match');
      modalSettings.classList.remove('active');
      showToast('Maç sıfırlandı!');
    }
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
        if (confirm('Maçı sıfırlamak istiyor musunuz?')) sendAction('reset_match');
      } else {
        sendAction('end_set');
      }
    }
  });

  // Initialize
  connectSSE();
})();
