// OBS Live Stream Overlay Engine (Fenerbahçe Voleybol Birebir Tasarım & Responsiveness)
(function () {
  let boardId = 'fenerbahce';
  let eventSource = null;

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
  }

  function renderOverlay(board) {
    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    const nameA = leftData.name || 'FENERBAHÇE';
    const nameB = rightData.name || 'RAKİP TAKIM';
    const colorA = leftData.color || leftData.accentColor || '#ffed00';
    const colorA2 = leftData.color2 || leftData.secondaryColor || '#002d72';
    const colorB = rightData.color || rightData.accentColor || '#d61c35';
    const colorB2 = rightData.color2 || rightData.secondaryColor || '#ffed00';

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
          <div class="dc-grid" id="dc-grid-main">

            <!-- Team A Column (Left) -->
            <div class="dc-team-col-a">
              <div class="dc-team-name-box">
                <img src="${escapeHtml(logoA)}" class="dc-team-name-logo" alt="" />
                <span class="dc-team-name-text">${escapeHtml(nameA)}</span>
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
              <div class="dc-team-name-box">
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
