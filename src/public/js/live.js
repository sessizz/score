// Live Spectator & Gym Big Screen Scoreboard JS
(function () {
  let boardId = 'fenerbahce';
  let eventSource = null;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && (pathParts[0] === 'live' || pathParts[0] === 'board')) {
    boardId = pathParts[1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) boardId = urlParams.get('id');
  }

  const elTitle = document.getElementById('live-title');
  const elSet = document.getElementById('live-set');
  const elHistory = document.getElementById('live-history');

  const teamLeftPanel = document.getElementById('team-left-panel');
  const teamLeftLogo = document.getElementById('team-left-logo');
  const teamLeftName = document.getElementById('team-left-name');
  const teamLeftSets = document.getElementById('team-left-sets');
  const teamLeftPoints = document.getElementById('team-left-points');

  const teamRightPanel = document.getElementById('team-right-panel');
  const teamRightLogo = document.getElementById('team-right-logo');
  const teamRightName = document.getElementById('team-right-name');
  const teamRightSets = document.getElementById('team-right-sets');
  const teamRightPoints = document.getElementById('team-right-points');

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
  }

  function renderLive(board) {
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

    // Right Team
    teamRightLogo.src = rightData.logo || '/assets/opponent.svg';
    teamRightName.textContent = rightData.name;
    teamRightSets.textContent = `${rightData.setsWon} SET`;
    teamRightPoints.textContent = rightData.points;
    teamRightPanel.className = `live-team-panel ${rightData.isServing ? 'serving' : ''}`;

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
