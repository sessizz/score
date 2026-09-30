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
  if (root) {
    root.className = `theme-${theme}`;
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

  function formatClockMs(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // DOM Elements Cache (to avoid recreating DOM on every state update)
  let el = null;

  function initOverlayDOM() {
    if (!root) return;
    root.innerHTML = `
      <div class="dc-board-container">
        <div class="dc-board-scale-wrapper">

          <!-- Zaman ve Set Kapsülü (Scoreboard'un Üstünde) -->
          <div class="dc-top-capsule-row">
            <div class="dc-top-capsule" id="dc-top-capsule">
              <span class="dc-capsule-set" id="dc-capsule-set">1. SET</span>
              <span class="dc-capsule-sep">•</span>
              <span class="dc-capsule-time" id="dc-overlay-clock">00:00</span>
            </div>
          </div>

          <div class="dc-grid" id="dc-grid-main">

            <!-- Team A Column (Left) -->
            <div class="dc-team-col-a">
              <div class="dc-team-name-box" id="dc-team-box-left">
                <img id="dc-team-logo-left" class="dc-team-name-logo" alt="" style="display: none;" />
                <span class="dc-team-name-text" id="dc-team-name-left"></span>
                <div class="dc-timeout-box">
                  <span class="dc-to-inline-timer" id="dc-to-inline-left" style="display: none;">30s</span>
                  <div class="dc-timeout-dots" id="dc-dots-left">
                    <span class="dc-to-dot" id="dc-left-dot-1"></span>
                    <span class="dc-to-dot" id="dc-left-dot-2"></span>
                  </div>
                </div>
              </div>
              <div class="dc-team-stripe-a">
                <span id="dc-left-stripe-1"></span>
                <span id="dc-left-stripe-2"></span>
              </div>
            </div>

            <!-- Center Cluster (Sets A | Points A | Points B | Sets B) -->
            <div class="dc-center-cluster">
              <!-- Sets A -->
              <div class="dc-sets-box">
                <span class="dc-sets-num" id="dc-sets-a">0</span>
              </div>

              <!-- Points A -->
              <div class="dc-points-box">
                <span class="dc-points-num" id="dc-points-a">0</span>
              </div>

              <!-- Points B -->
              <div class="dc-points-box">
                <span class="dc-points-num" id="dc-points-b">0</span>
              </div>

              <!-- Sets B -->
              <div class="dc-sets-box">
                <span class="dc-sets-num" id="dc-sets-b">0</span>
              </div>
            </div>

            <!-- Team B Column (Right) -->
            <div class="dc-team-col-b">
              <div class="dc-team-name-box" id="dc-team-box-right">
                <div class="dc-timeout-box">
                  <span class="dc-to-inline-timer" id="dc-to-inline-right" style="display: none;">30s</span>
                  <div class="dc-timeout-dots" id="dc-dots-right">
                    <span class="dc-to-dot" id="dc-right-dot-1"></span>
                    <span class="dc-to-dot" id="dc-right-dot-2"></span>
                  </div>
                </div>
                <span class="dc-team-name-text" id="dc-team-name-right"></span>
                <img id="dc-team-logo-right" class="dc-team-name-logo" alt="" style="display: none;" />
              </div>
              <div class="dc-team-stripe-b">
                <span id="dc-right-stripe-1"></span>
                <span id="dc-right-stripe-2"></span>
              </div>
            </div>

            <!-- Kayan ve Dönen Servis Topu (Sabit DOM elementi) -->
            <div class="dc-ball-anchor" id="dc-ball-anchor" style="display: none;">
              <img src="/assets/serve-ball-v9.png" class="dc-ball-img" alt="" />
            </div>

          </div>

          <!-- Sayı Geçmişi Şeridi (5 sn boyunca scoreboard yerine gösterilir) -->
          <div class="dc-grid dc-hist-grid" id="dc-hist-grid" style="display: none;">
            <div class="dc-hist" id="dc-hist"></div>
          </div>
        </div>
      </div>
    `;

    el = {
      capsuleSet: document.getElementById('dc-capsule-set'),
      clock: document.getElementById('dc-overlay-clock'),
      teamNameLeft: document.getElementById('dc-team-name-left'),
      teamLogoLeft: document.getElementById('dc-team-logo-left'),
      leftStripe1: document.getElementById('dc-left-stripe-1'),
      leftStripe2: document.getElementById('dc-left-stripe-2'),
      leftDot1: document.getElementById('dc-left-dot-1'),
      leftDot2: document.getElementById('dc-left-dot-2'),
      toLeft: document.getElementById('dc-to-inline-left'),
      dotsBoxLeft: document.getElementById('dc-dots-left'),

      setsA: document.getElementById('dc-sets-a'),
      pointsA: document.getElementById('dc-points-a'),
      pointsB: document.getElementById('dc-points-b'),
      setsB: document.getElementById('dc-sets-b'),

      teamNameRight: document.getElementById('dc-team-name-right'),
      teamLogoRight: document.getElementById('dc-team-logo-right'),
      rightStripe1: document.getElementById('dc-right-stripe-1'),
      rightStripe2: document.getElementById('dc-right-stripe-2'),
      rightDot1: document.getElementById('dc-right-dot-1'),
      rightDot2: document.getElementById('dc-right-dot-2'),
      toRight: document.getElementById('dc-to-inline-right'),
      dotsBoxRight: document.getElementById('dc-dots-right'),

      ballAnchor: document.getElementById('dc-ball-anchor'),
      gridMain: document.getElementById('dc-grid-main'),
      histGrid: document.getElementById('dc-hist-grid'),
      hist: document.getElementById('dc-hist')
    };
  }

  // ---- Sayı Geçmişi ----
  const HIST_MAX_COLS = 30;
  const HIST_MIN_COLS = 26;
  let histSig = '';

  function isHistoryActive() {
    return Boolean(latestBoard && latestBoard.historyUntil && getServerNow() < latestBoard.historyUntil);
  }

  function readableTextColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#0b1a3a' : '#ffffff';
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function historyRowHtml(team, key, entries, start, cols, pts) {
    let n = 0;
    for (let i = 0; i < start; i++) if (entries[i] === key) n++;
    const fs = (0.72 * Math.min(1, HIST_MIN_COLS / cols)).toFixed(3);
    let cells = '';
    for (let k = 0; k < cols; k++) {
      const i = start + k;
      if (i < entries.length && entries[i] === key) {
        n++;
        const color = team.color || team.accentColor || '#ffed00';
        cells += `<div class="dc-hist-cell on${i === entries.length - 1 ? ' last' : ''}" style="background:${escHtml(color)};color:${readableTextColor(color)}">${n}</div>`;
      } else {
        cells += '<div class="dc-hist-cell"></div>';
      }
    }
    const logo = team.logo ? `<img class="dc-team-name-logo" src="${escHtml(team.logo)}" alt="" />` : '';
    return `<div class="dc-hist-row">
      <div class="dc-hist-name dc-team-name-box">${logo}<span class="dc-team-name-text">${escHtml(team.name || '')}</span></div>
      <div class="dc-hist-track" style="--fs:${fs}em">${cells}</div>
      <div class="dc-hist-end dc-points-box"><span class="dc-points-num">${Number(team.points) || 0}</span></div>
    </div>`;
  }

  function renderHistory(board) {
    if (!el || !el.hist) return;
    const isSwapped = Boolean(board.courtSwapped);
    const leftKey = isSwapped ? 'teamB' : 'teamA';
    const rightKey = isSwapped ? 'teamA' : 'teamB';
    const entries = (board.pointLog || []).filter((e) => e.set === board.currentSet).map((e) => e.team);

    const sig = JSON.stringify([entries.join(''), leftKey, board.teamA, board.teamB]);
    if (sig === histSig) return;
    histSig = sig;

    const start = Math.max(0, entries.length - HIST_MAX_COLS);
    const cols = Math.max(entries.length - start, HIST_MIN_COLS);
    el.hist.innerHTML =
      historyRowHtml(board[leftKey], leftKey, entries, start, cols, board[leftKey].points) +
      historyRowHtml(board[rightKey], rightKey, entries, start, cols, board[rightKey].points);
  }

  function applyHistoryVisibility() {
    if (!el || !el.gridMain || !el.histGrid) return;
    const active = isHistoryActive();
    el.gridMain.style.display = active ? 'none' : '';
    el.histGrid.style.display = active ? '' : 'none';
    if (latestBoard && el.capsuleSet) {
      const label = `${latestBoard.currentSet || 1}. SET${active ? ' • SAYI GEÇMİŞİ' : ''}`;
      if (el.capsuleSet.textContent !== label) el.capsuleSet.textContent = label;
    }
  }

  function updateClockDisplay() {
    if (!latestBoard || !el) return;
    applyHistoryVisibility();

    // Set match timer
    const clock = latestBoard.setClock || { running: false, startedAt: null, elapsedMs: 0 };
    let ms = clock.elapsedMs || 0;
    if (clock.running && clock.startedAt) {
      ms += Math.max(0, getServerNow() - clock.startedAt);
    }
    if (el.clock) {
      el.clock.textContent = formatClockMs(ms);
    }

    // Team-specific timeout countdown check
    const isSwapped = Boolean(latestBoard.courtSwapped);
    let remainSec = 0;
    let isTimeoutActive = false;
    let rawTeam = '';

    if (latestBoard.status === 'timeout' || (latestBoard.timeoutState && latestBoard.timeoutState.active)) {
      if (latestBoard.timeoutState && latestBoard.timeoutState.endsAt) {
        remainSec = Math.max(0, Math.ceil((latestBoard.timeoutState.endsAt - getServerNow()) / 1000));
        isTimeoutActive = remainSec > 0;
        rawTeam = String(latestBoard.timeoutState.team || '').toLowerCase();
      }
    }

    const isTeamA = rawTeam === 'teama' || rawTeam === 'a' || rawTeam === '1';
    const isTeamB = rawTeam === 'teamb' || rawTeam === 'b' || rawTeam === '2';

    const leftHasTimeout = isTimeoutActive && (isSwapped ? isTeamB : isTeamA);
    const rightHasTimeout = isTimeoutActive && (isSwapped ? isTeamA : isTeamB);

    if (el.toLeft) {
      el.toLeft.style.display = leftHasTimeout ? 'inline-block' : 'none';
      if (leftHasTimeout) el.toLeft.textContent = `${remainSec}s`;
    }

    if (el.toRight) {
      el.toRight.style.display = rightHasTimeout ? 'inline-block' : 'none';
      if (rightHasTimeout) el.toRight.textContent = `${remainSec}s`;
    }
  }

  function renderOverlay(board) {
    if (!board) return;
    latestBoard = board;
    if (board.serverTime) syncServerTime(board.serverTime);

    if (!el || !document.getElementById('dc-grid-main')) {
      initOverlayDOM();
    }

    const isSwapped = Boolean(board.courtSwapped);
    const leftData = isSwapped ? board.teamB : board.teamA;
    const rightData = isSwapped ? board.teamA : board.teamB;

    if (!leftData || !rightData) return;

    // 1. Current Set
    if (el.capsuleSet) {
      el.capsuleSet.textContent = `${board.currentSet || 1}. SET${isHistoryActive() ? ' • SAYI GEÇMİŞİ' : ''}`;
    }

    // 2. Left Team (Name, Logo, Stripes, Timeouts)
    const nameA = leftData.name || 'FENERBAHÇE';
    const logoA = leftData.logo || '';
    const colorA = leftData.color || leftData.accentColor || '#ffed00';
    const colorA2 = leftData.color2 || leftData.secondaryColor || '#002d72';
    const leftTimeouts = Number(leftData.timeouts) || 0;

    if (el.teamNameLeft && el.teamNameLeft.textContent !== nameA) {
      el.teamNameLeft.textContent = nameA;
    }

    if (el.teamLogoLeft) {
      if (logoA) {
        if (el.teamLogoLeft.getAttribute('src') !== logoA) {
          el.teamLogoLeft.src = logoA;
        }
        el.teamLogoLeft.style.display = 'block';
      } else {
        el.teamLogoLeft.style.display = 'none';
      }
    }

    if (el.leftStripe1) el.leftStripe1.style.background = colorA;
    if (el.leftStripe2) el.leftStripe2.style.background = colorA2;

    if (el.leftDot1) el.leftDot1.className = 'dc-to-dot' + (leftTimeouts >= 1 ? ' is-used' : '');
    if (el.leftDot2) el.leftDot2.className = 'dc-to-dot' + (leftTimeouts >= 2 ? ' is-used' : '');
    if (el.dotsBoxLeft) el.dotsBoxLeft.title = `Mola: ${leftTimeouts}/2`;

    // 3. Right Team (Name, Logo, Stripes, Timeouts)
    const nameB = rightData.name || 'RAKİP TAKIM';
    const logoB = rightData.logo || '';
    const colorB = rightData.color || rightData.accentColor || '#d61c35';
    const colorB2 = rightData.color2 || rightData.secondaryColor || '#ffed00';
    const rightTimeouts = Number(rightData.timeouts) || 0;

    if (el.teamNameRight && el.teamNameRight.textContent !== nameB) {
      el.teamNameRight.textContent = nameB;
    }

    if (el.teamLogoRight) {
      if (logoB) {
        if (el.teamLogoRight.getAttribute('src') !== logoB) {
          el.teamLogoRight.src = logoB;
        }
        el.teamLogoRight.style.display = 'block';
      } else {
        el.teamLogoRight.style.display = 'none';
      }
    }

    if (el.rightStripe1) el.rightStripe1.style.background = colorB;
    if (el.rightStripe2) el.rightStripe2.style.background = colorB2;

    if (el.rightDot1) el.rightDot1.className = 'dc-to-dot' + (rightTimeouts >= 1 ? ' is-used' : '');
    if (el.rightDot2) el.rightDot2.className = 'dc-to-dot' + (rightTimeouts >= 2 ? ' is-used' : '');
    if (el.dotsBoxRight) el.dotsBoxRight.title = `Mola: ${rightTimeouts}/2`;

    // 4. Sets and Points
    if (el.setsA) el.setsA.textContent = String(leftData.setsWon || 0);
    if (el.pointsA) el.pointsA.textContent = String(leftData.points || 0);
    if (el.pointsB) el.pointsB.textContent = String(rightData.points || 0);
    if (el.setsB) el.setsB.textContent = String(rightData.setsWon || 0);

    // 5. Serving Ball Anchor (Never recreated, smooth glide & persistent spin)
    if (el.ballAnchor) {
      const isLeftServing = Boolean(leftData.isServing);
      const isRightServing = Boolean(rightData.isServing);

      if (isLeftServing) {
        el.ballAnchor.classList.add('is-left');
        el.ballAnchor.classList.remove('is-right');
        el.ballAnchor.style.display = 'block';
      } else if (isRightServing) {
        el.ballAnchor.classList.add('is-right');
        el.ballAnchor.classList.remove('is-left');
        el.ballAnchor.style.display = 'block';
      } else {
        el.ballAnchor.style.display = 'none';
      }
    }

    // 6. Sayı geçmişi
    renderHistory(board);

    // 7. Update Clocks & Timeouts
    updateClockDisplay();
  }

  // Connect SSE
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        if (board.serverTime) syncServerTime(board.serverTime);
        renderOverlay(board);
      } catch (err) {
        console.error('Failed to parse SSE state in overlay', err);
      }
    });

    eventSource.addEventListener('ping', (e) => {
      if (e.data) syncServerTime(Number(e.data));
    });

    eventSource.onerror = () => {
      // EventSource auto reconnects
    };

    if (!clockTicker) {
      clockTicker = setInterval(updateClockDisplay, 250);
    }
  }

  async function loadInitialState() {
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`);
      if (res.ok) {
        const board = await res.json();
        if (board && board.serverTime) syncServerTime(board.serverTime);
        renderOverlay(board);
      }
    } catch (e) {
      // Ignored, SSE will push state
    }
  }

  // Start
  initOverlayDOM();
  loadInitialState();
  connectSSE();
})();
