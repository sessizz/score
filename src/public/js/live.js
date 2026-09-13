// Live Spectator & Gym Big Screen Scoreboard JS
(function () {
  let boardId = 'fenerbahce';
  let eventSource = null;
  let latestBoard = null;
  let clockTicker = null;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && (pathParts[0] === 'live' || pathParts[0] === 'board')) {
    boardId = pathParts[1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) boardId = urlParams.get('id');
  }

  const elTitle = document.getElementById('live-title');
  const elSet = document.getElementById('live-set');
  const elClock = document.getElementById('live-clock');
  const elHistory = document.getElementById('live-history');

  const teamLeftPanel = document.getElementById('team-left-panel');
  const teamLeftLogo = document.getElementById('team-left-logo');
  const teamLeftName = document.getElementById('team-left-name');
  const teamLeftSets = document.getElementById('team-left-sets');
  const teamLeftPoints = document.getElementById('team-left-points');
  const liveLeftTo1 = document.getElementById('live-left-to-1');
  const liveLeftTo2 = document.getElementById('live-left-to-2');
  const teamLeftTimeouts = document.getElementById('team-left-timeouts');

  const teamRightPanel = document.getElementById('team-right-panel');
  const teamRightLogo = document.getElementById('team-right-logo');
  const teamRightName = document.getElementById('team-right-name');
  const teamRightSets = document.getElementById('team-right-sets');
  const teamRightPoints = document.getElementById('team-right-points');
  const liveRightTo1 = document.getElementById('live-right-to-1');
  const liveRightTo2 = document.getElementById('live-right-to-2');
  const teamRightTimeouts = document.getElementById('team-right-timeouts');

  function formatClockMs(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateLiveClock() {
    if (!elClock || !latestBoard) return;

    if (latestBoard.status === 'timeout' && latestBoard.timeoutState && latestBoard.timeoutState.endsAt) {
      const remainSec = Math.max(0, Math.ceil((latestBoard.timeoutState.endsAt - Date.now()) / 1000));
      elClock.textContent = `MOLA: ${remainSec}s`;
      elClock.classList.add('is-timeout');
      return;
    }

    elClock.classList.remove('is-timeout');

    const clock = latestBoard.setClock || { running: false, startedAt: null, elapsedMs: 0 };
    let ms = clock.elapsedMs || 0;
    if (clock.running && clock.startedAt) {
      ms += Math.max(0, Date.now() - clock.startedAt);
    }
    elClock.textContent = formatClockMs(ms);
  }

  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        renderLive(board);
      } catch (err) {
        console.error('Failed to parse SSE state in live screen', err);
      }
    });

    if (!clockTicker) {
      clockTicker = setInterval(updateLiveClock, 250);
    }
  }

  function renderLive(board) {
    latestBoard = board;
    elTitle.textContent = `${board.title || 'Voleybol Müsabakası'} - ${board.subtitle || 'Canlı'}`;
    elSet.textContent = `${board.currentSet}. SET`;

    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    // Left Team
    teamLeftLogo.src = leftData.logo || '/assets/fenerbahce.svg';
    teamLeftName.textContent = leftData.name;
    teamLeftSets.textContent = `${leftData.setsWon} SET`;
    teamLeftPoints.textContent = leftData.points;
    teamLeftPanel.className = `live-team-panel ${leftData.isServing ? 'serving' : ''}`;

    const leftTimeouts = Number(leftData.timeouts) || 0;
    if (liveLeftTo1) liveLeftTo1.className = `live-to-dot ${leftTimeouts >= 1 ? 'is-used' : ''}`;
    if (liveLeftTo2) liveLeftTo2.className = `live-to-dot ${leftTimeouts >= 2 ? 'is-used' : ''}`;
    if (teamLeftTimeouts) teamLeftTimeouts.title = `Mola: ${leftTimeouts}/2`;

    // Right Team
    teamRightLogo.src = rightData.logo || '/assets/opponent.svg';
    teamRightName.textContent = rightData.name;
    teamRightSets.textContent = `${rightData.setsWon} SET`;
    teamRightPoints.textContent = rightData.points;
    teamRightPanel.className = `live-team-panel ${rightData.isServing ? 'serving' : ''}`;

    const rightTimeouts = Number(rightData.timeouts) || 0;
    if (liveRightTo1) liveRightTo1.className = `live-to-dot ${rightTimeouts >= 1 ? 'is-used' : ''}`;
    if (liveRightTo2) liveRightTo2.className = `live-to-dot ${rightTimeouts >= 2 ? 'is-used' : ''}`;
    if (teamRightTimeouts) teamRightTimeouts.title = `Mola: ${rightTimeouts}/2`;

    // History
    elHistory.innerHTML = '';
    if (board.setHistory && board.setHistory.length > 0) {
      board.setHistory.forEach((h) => {
        const badge = document.createElement('div');
        badge.className = 'live-history-set-badge';
        badge.textContent = `${h.set}. Set: ${h.scoreA} - ${h.scoreB}`;
        elHistory.appendChild(badge);
      });
    } else {
      elHistory.innerHTML = `<span style="color: var(--text-muted); font-weight: 600;">Henüz tamamlanan set yok</span>`;
    }

    updateLiveClock();
  }

  // Fullscreen toggle on double click or pressing F
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  });

  connectSSE();
})();
