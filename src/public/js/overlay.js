// OBS Live Stream Overlay Engine (Fenerbahçe Voleybol Birebir Tasarım & Responsiveness)
(function () {
  let boardId = 'fenerbahce';
  let eventSource = null;
  let latestBoard = null;
  let clockTicker = null;

  // Query Params
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 2 && pathParts[0] === 'overlay') {
    boardId = pathParts[1];
  } else if (urlParams.has('id')) {
    boardId = urlParams.get('id');
  }

  const theme = urlParams.get('theme') || 'topbar'; // 'topbar', 'lowerthird', 'bottom'
  const root = document.getElementById('overlay-root');
  root.className = `theme-${theme}`;

  function formatClockMs(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateClockDisplay() {
    if (!latestBoard) return;

    // Set match timer
    const clock = latestBoard.setClock || { running: false, startedAt: null, elapsedMs: 0 };
    let ms = clock.elapsedMs || 0;
    if (clock.running && clock.startedAt) {
      ms += Math.max(0, Date.now() - clock.startedAt);
    }
    const clockEl = document.getElementById('dc-overlay-clock');
    if (clockEl) {
      clockEl.textContent = formatClockMs(ms);
    }

    // Team-specific timeout countdown check
    const isSwapped = Boolean(latestBoard.courtSwapped);
    let remainSec = 0;
    let isTimeoutActive = false;
    let rawTeam = '';

    if (latestBoard.status === 'timeout' || (latestBoard.timeoutState && latestBoard.timeoutState.active)) {
      if (latestBoard.timeoutState && latestBoard.timeoutState.endsAt) {
        remainSec = Math.max(0, Math.ceil((latestBoard.timeoutState.endsAt - Date.now()) / 1000));
        isTimeoutActive = remainSec > 0;
        rawTeam = String(latestBoard.timeoutState.team || '').toLowerCase();
      }
    }

    // Matches 'teamA' / 'a' or 'teamB' / 'b'
    const isTeamA = rawTeam === 'teama' || rawTeam === 'a' || rawTeam === '1';
    const isTeamB = rawTeam === 'teamb' || rawTeam === 'b' || rawTeam === '2';

    // If court swapped: Left is Team B, Right is Team A
    // If not swapped: Left is Team A, Right is Team B
    let leftHasTimeout = isTimeoutActive && (isSwapped ? isTeamB : isTeamA);
    let rightHasTimeout = isTimeoutActive && (isSwapped ? isTeamA : isTeamB);

    const inlineLeft = document.getElementById('dc-to-inline-left');
    const inlineRight = document.getElementById('dc-to-inline-right');

    if (inlineLeft) {
      inlineLeft.style.display = leftHasTimeout ? 'inline-block' : 'none';
      if (leftHasTimeout) inlineLeft.textContent = `${remainSec}s`;
    }

    if (inlineRight) {
      inlineRight.style.display = rightHasTimeout ? 'inline-block' : 'none';
      if (rightHasTimeout) inlineRight.textContent = `${remainSec}s`;
    }
  }

  // Connect SSE
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        renderOverlay(board);
      } catch (err) {
        console.error('Failed to parse SSE state in overlay', err);
      }
    });

    eventSource.onerror = () => {
      // EventSource auto reconnects
    };

    if (!clockTicker) {
      clockTicker = setInterval(updateClockDisplay, 250);
    }
  }

  function renderOverlay(board) {
    latestBoard = board;
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    const nameA = leftData.name || 'FENERBAHÇE';
    const nameB = rightData.name || 'RAKİP TAKIM';
    const colorA = leftData.color || leftData.accentColor || '#ffed00';
    const colorA2 = leftData.color2 || leftData.secondaryColor || '#002d72';
    const colorB = rightData.color || rightData.accentColor || '#d61c35';
    const colorB2 = rightData.color2 || rightData.secondaryColor || '#ffed00';

    const leftTimeouts = Number(leftData.timeouts) || 0;
    const rightTimeouts = Number(rightData.timeouts) || 0;

    // Ball side: sits at the outer end of the serving team's side (positions in CSS)
    const isLeftServing = Boolean(leftData.isServing);
    const ballSide = isLeftServing ? 'is-left' : 'is-right';

    // Center Logo (TVF)
    const logoUrl = '/assets/tvf-logo-beyaz.svg';

    // Team logos, shown inside each team's name panel
    const logoA = leftData.logo || '/assets/fenerbahce.svg';
    const logoB = rightData.logo || '/assets/opponent.svg';

    root.innerHTML = `
      <div class="dc-board-container">
        <div class="dc-board-scale-wrapper">

          <!-- Zaman ve Set Kapsülü (Scoreboard'un Üstünde) -->
          <div class="dc-top-capsule-row">
            <div class="dc-top-capsule" id="dc-top-capsule">
              <span class="dc-capsule-set">${board.currentSet || 1}. SET</span>
              <span class="dc-capsule-sep">•</span>
              <span class="dc-capsule-time" id="dc-overlay-clock">00:00</span>
            </div>
          </div>

          <div class="dc-grid" id="dc-grid-main">

            <!-- Team A Column (Left) -->
            <div class="dc-team-col-a">
              <div class="dc-team-name-box" id="dc-team-box-left">
                <img src="${escapeHtml(logoA)}" class="dc-team-name-logo" alt="" />
                <span class="dc-team-name-text">${escapeHtml(nameA)}</span>
                <div class="dc-timeout-dots" title="Mola: ${leftTimeouts}/2">
                  <span class="dc-to-dot ${leftTimeouts >= 1 ? 'is-used' : ''}"></span>
                  <span class="dc-to-dot ${leftTimeouts >= 2 ? 'is-used' : ''}"></span>
                  <span class="dc-to-inline-timer" id="dc-to-inline-left" style="display: none;">30s</span>
                </div>
              </div>
              <div class="dc-team-stripe-a">
                <span style="background: ${colorA};"></span>
                <span style="background: ${colorA2};"></span>
              </div>
            </div>

            <!-- Center Cluster (Sets A | Points A | Logo | Points B | Sets B) -->
            <div class="dc-center-cluster">
              <!-- Sets A -->
              <div class="dc-sets-box">
                <span class="dc-sets-num">${leftData.setsWon}</span>
              </div>

              <!-- Points A -->
              <div class="dc-points-box">
                <span class="dc-points-num">${leftData.points}</span>
              </div>

              <!-- Center Logo Box -->
              <div class="dc-logo-box">
                <div class="dc-logo-inner" style="background-image: url('${logoUrl}');"></div>
              </div>

              <!-- Points B -->
              <div class="dc-points-box">
                <span class="dc-points-num">${rightData.points}</span>
              </div>

              <!-- Sets B -->
              <div class="dc-sets-box">
                <span class="dc-sets-num">${rightData.setsWon}</span>
              </div>
            </div>

            <!-- Team B Column (Right) -->
            <div class="dc-team-col-b">
              <div class="dc-team-name-box" id="dc-team-box-right">
                <div class="dc-timeout-dots" title="Mola: ${rightTimeouts}/2">
                  <span class="dc-to-inline-timer" id="dc-to-inline-right" style="display: none;">30s</span>
                  <span class="dc-to-dot ${rightTimeouts >= 1 ? 'is-used' : ''}"></span>
                  <span class="dc-to-dot ${rightTimeouts >= 2 ? 'is-used' : ''}"></span>
                </div>
                <span class="dc-team-name-text">${escapeHtml(nameB)}</span>
                <img src="${escapeHtml(logoB)}" class="dc-team-name-logo" alt="" />
              </div>
              <div class="dc-team-stripe-b">
                <span style="background: ${colorB};"></span>
                <span style="background: ${colorB2};"></span>
              </div>
            </div>

            <!-- Kayan ve Dönen Servis Topu -->
            <div class="dc-ball-anchor ${ballSide}">
              <img src="/assets/serve-ball-v9.png" class="dc-ball-img" alt="" />
            </div>

          </div>
        </div>
      </div>
    `;

    updateClockDisplay();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Start
  connectSSE();
})();
