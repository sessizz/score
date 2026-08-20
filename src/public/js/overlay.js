// OBS Live Stream Overlay Engine (Fenerbahçe Voleybol Birebir Tasarım & Responsiveness)
(function () {
  let currentBoard = null;
  let boardId = 'fenerbahce';
  let eventSource = null;
  let hoverState = false;
  let pinnedState = false;

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

  // Action Dispatcher for in-overlay quick clicks
  async function sendAction(action, payload = {}) {
    try {
      const pin = localStorage.getItem('score_admin_pin') || '';
      await fetch(`/api/board/${boardId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, pin })
      });
    } catch (err) {
      console.error('Action failed', err);
    }
  }

  // Connect SSE
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/board/${boardId}/stream`);

    eventSource.addEventListener('state', (e) => {
      try {
        const board = JSON.parse(e.data);
        currentBoard = board;
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
    const colorA = leftData.accentColor || leftData.color || '#ffed00';
    const colorB = rightData.accentColor || rightData.color || '#d61c35';

    // Ball position: exactly 0px or calc(100% - 2.2em)
    const isLeftServing = Boolean(leftData.isServing);
    const ballLeft = isLeftServing ? '0px' : 'calc(100% - 2.2em)';
    const serveLabel = isLeftServing ? 'A' : 'B';

    // Center Logo
    const logoUrl = leftData.logo || '/assets/fenerbahce.svg';

    const panelVisible = hoverState || pinnedState;

    root.innerHTML = `
      <div class="dc-board-container">
        <div class="dc-board-scale-wrapper">
          <div class="dc-grid" id="dc-grid-main">

            <!-- Team A Column (Left) -->
            <div class="dc-team-col-a">
              <div class="dc-team-name-box">
                <span class="dc-team-name-text">${escapeHtml(nameA)}</span>
              </div>
              <div class="dc-team-stripe-a" style="background: ${colorA};"></div>
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
              </div>
              <div class="dc-team-stripe-b" style="background: ${colorB};"></div>
            </div>

            <!-- Kayan ve Dönen Servis Topu -->
            <div class="dc-ball-anchor" style="left: ${ballLeft};">
              <img src="/assets/serve-ball-v9.png" class="dc-ball-img" alt="" />
            </div>

            <!-- Hover / Pinned Quick Popup Control Panel from Skorboard.dc -->
            <div class="dc-interactive-panel ${panelVisible ? 'visible' : ''}">
              <div style="display: flex; align-items: center; gap: .5em;">
                <div style="display: flex; align-items: center; gap: .24em;">
                  <button type="button" class="dc-ctrl-btn dc-btn-blue" id="btn-pA-down">−</button>
                  <span style="min-width: 5.6em; text-align: center; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">A sayı</span>
                  <button type="button" class="dc-ctrl-btn dc-btn-blue" id="btn-pA-up">+</button>
                </div>
                <div style="display: flex; align-items: center; gap: .24em;">
                  <button type="button" class="dc-ctrl-btn dc-btn-red" id="btn-sA-down">−</button>
                  <span style="min-width: 4.2em; text-align: center; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">A set</span>
                  <button type="button" class="dc-ctrl-btn dc-btn-red" id="btn-sA-up">+</button>
                </div>
                <button type="button" class="dc-ctrl-btn dc-btn-yellow" id="btn-toggle-serve" style="width: auto; padding: 0 .7em; letter-spacing: .05em; text-transform: uppercase;">
                  Servis: ${serveLabel}
                </button>
                <div style="display: flex; align-items: center; gap: .24em;">
                  <button type="button" class="dc-ctrl-btn dc-btn-red" id="btn-sB-down">−</button>
                  <span style="min-width: 4.2em; text-align: center; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">B set</span>
                  <button type="button" class="dc-ctrl-btn dc-btn-red" id="btn-sB-up">+</button>
                </div>
                <div style="display: flex; align-items: center; gap: .24em;">
                  <button type="button" class="dc-ctrl-btn dc-btn-blue" id="btn-pB-down">−</button>
                  <span style="min-width: 5.6em; text-align: center; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">B sayı</span>
                  <button type="button" class="dc-ctrl-btn dc-btn-blue" id="btn-pB-up">+</button>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: .34em; margin-top: .2em;">
                <input type="text" id="input-name-a" value="${escapeHtml(nameA)}" placeholder="A takımı" style="width: 12em; height: 1.9em; border: 1px solid rgba(255,255,255,.18); border-radius: .16em; background: rgba(255,255,255,.06); color: #fff; font: 700 .95em 'Barlow Condensed',sans-serif; padding: 0 .4em;" />
                <input type="color" id="input-color-a" value="${colorA}" style="width: 2.2em; height: 1.9em; border: 1px solid rgba(255,255,255,.18); border-radius: .16em; background: transparent; padding: .1em; cursor: pointer;" />
                <button type="button" class="dc-btn-gray" id="btn-quick-newset">Yeni set</button>
                <button type="button" class="dc-btn-gray" id="btn-quick-reset">Sıfırla</button>
                <button type="button" class="dc-btn-gray" id="btn-quick-swap">Saha değiş</button>
                <input type="color" id="input-color-b" value="${colorB}" style="width: 2.2em; height: 1.9em; border: 1px solid rgba(255,255,255,.18); border-radius: .16em; background: transparent; padding: .1em; cursor: pointer;" />
                <input type="text" id="input-name-b" value="${escapeHtml(nameB)}" placeholder="B takımı" style="width: 12em; height: 1.9em; border: 1px solid rgba(255,255,255,.18); border-radius: .16em; background: rgba(255,255,255,.06); color: #fff; font: 700 .95em 'Barlow Condensed',sans-serif; padding: 0 .4em;" />
              </div>

              <div style="font: 600 .8em 'Barlow Condensed',sans-serif; color: rgba(255,255,255,.55); letter-spacing: .03em; text-align: center; margin-top: .1em;">
                Q/A · P/L sayı · W/S · O/K set · BOŞLUK servis · ←/→ servis · R yeni set · C paneli sabitle
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Attach Hover & Click Listeners
    const gridEl = document.getElementById('dc-grid-main');
    if (gridEl) {
      gridEl.addEventListener('mouseenter', () => {
        hoverState = true;
        updatePanelVisibility();
      });
      gridEl.addEventListener('mouseleave', () => {
        hoverState = false;
        updatePanelVisibility();
      });
    }

    // Quick Action Listeners inside overlay
    attachQuickListeners(isSwapped, leftData, rightData);
  }

  function updatePanelVisibility() {
    const panel = document.querySelector('.dc-interactive-panel');
    if (panel) {
      if (hoverState || pinnedState) {
        panel.classList.add('visible');
      } else {
        panel.classList.remove('visible');
      }
    }
  }

  function attachQuickListeners(isSwapped, leftData, rightData) {
    const pAup = document.getElementById('btn-pA-up');
    const pAdown = document.getElementById('btn-pA-down');
    const pBup = document.getElementById('btn-pB-up');
    const pBdown = document.getElementById('btn-pB-down');
    const toggleServe = document.getElementById('btn-toggle-serve');
    const quickNewSet = document.getElementById('btn-quick-newset');
    const quickReset = document.getElementById('btn-quick-reset');
    const quickSwap = document.getElementById('btn-quick-swap');

    if (pAup) pAup.onclick = () => sendAction(isSwapped ? 'point_b' : 'point_a');
    if (pAdown) pAdown.onclick = () => sendAction(isSwapped ? 'sub_point_b' : 'sub_point_a');
    if (pBup) pBup.onclick = () => sendAction(isSwapped ? 'point_a' : 'point_b');
    if (pBdown) pBdown.onclick = () => sendAction(isSwapped ? 'sub_point_a' : 'sub_point_b');
    if (toggleServe) toggleServe.onclick = () => sendAction('set_serve', {});
    if (quickNewSet) quickNewSet.onclick = () => sendAction('end_set');
    if (quickReset) quickReset.onclick = () => { if (confirm('Maçı sıfırla?')) sendAction('reset_match'); };
    if (quickSwap) quickSwap.onclick = () => sendAction('swap_sides');

    const inputNameA = document.getElementById('input-name-a');
    const inputNameB = document.getElementById('input-name-b');
    const inputColorA = document.getElementById('input-color-a');
    const inputColorB = document.getElementById('input-color-b');

    if (inputNameA) {
      inputNameA.onchange = (e) => {
        const patch = isSwapped ? { teamB: { name: e.target.value } } : { teamA: { name: e.target.value } };
        sendAction('update_teams', patch);
      };
    }
    if (inputNameB) {
      inputNameB.onchange = (e) => {
        const patch = isSwapped ? { teamA: { name: e.target.value } } : { teamB: { name: e.target.value } };
        sendAction('update_teams', patch);
      };
    }
    if (inputColorA) {
      inputColorA.onchange = (e) => {
        const patch = isSwapped ? { teamB: { accentColor: e.target.value, color: e.target.value } } : { teamA: { accentColor: e.target.value, color: e.target.value } };
        sendAction('update_teams', patch);
      };
    }
    if (inputColorB) {
      inputColorB.onchange = (e) => {
        const patch = isSwapped ? { teamA: { accentColor: e.target.value, color: e.target.value } } : { teamB: { accentColor: e.target.value, color: e.target.value } };
        sendAction('update_teams', patch);
      };
    }
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    const k = e.key ? e.key.toLowerCase() : '';
    const isSwapped = currentBoard && currentBoard.courtSwapped;

    if (k === 'q') {
      sendAction(isSwapped ? 'point_b' : 'point_a');
    } else if (k === 'a' && !e.ctrlKey && !e.metaKey) {
      sendAction(isSwapped ? 'sub_point_b' : 'sub_point_a');
    } else if (k === 'p') {
      sendAction(isSwapped ? 'point_a' : 'point_b');
    } else if (k === 'l') {
      sendAction(isSwapped ? 'sub_point_a' : 'sub_point_b');
    } else if (e.code === 'Space') {
      e.preventDefault();
      sendAction('set_serve', {});
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      sendAction('set_serve', { team: isSwapped ? 'teamB' : 'teamA' });
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      sendAction('set_serve', { team: isSwapped ? 'teamA' : 'teamB' });
    } else if (k === 'r' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (confirm('Maçı sıfırlamak istiyor musunuz?')) sendAction('reset_match');
      } else {
        sendAction('end_set');
      }
    } else if (k === 'c') {
      e.preventDefault();
      pinnedState = !pinnedState;
      updatePanelVisibility();
    } else if (k === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendAction('undo');
    }
  });

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
