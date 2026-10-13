// Public REST API (v1) for controlling a scoreboard from external apps (Stream Deck, scripts, etc.)
// Routes: /api/v1/{token}/...  — token is the board code or its operator token.
// Every write is executed with operator permissions, exactly like the /operate screen.

const store = require('./store');

const RATE_LIMIT_PER_SEC = 5;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

// boardId -> { windowStart, count, blockedUntil }
const rateState = new Map();

function isRateLimited(boardId) {
  const now = Date.now();
  let s = rateState.get(boardId);
  if (!s) {
    s = { windowStart: now, count: 0, blockedUntil: 0 };
    rateState.set(boardId, s);
  }
  if (s.blockedUntil > now) return true;
  if (now - s.windowStart >= 1000) {
    s.windowStart = now;
    s.count = 0;
  }
  s.count++;
  if (s.count > RATE_LIMIT_PER_SEC) {
    s.blockedUntil = now + RATE_LIMIT_COOLDOWN_MS;
    return true;
  }
  return false;
}

// Drop stale rate-limit entries so the map does not grow forever
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of rateState) {
    if (s.blockedUntil < now && now - s.windowStart > 60 * 1000) rateState.delete(id);
  }
}, 5 * 60 * 1000).unref();

const TEAM_KEYS = { home: 'teamA', away: 'teamB' };
const TEAM_SUFFIX = { home: 'a', away: 'b' };

function amountOf(body) {
  const n = Number(body && body.amount);
  return Number.isFinite(n) && n !== 0 ? Math.trunc(n) : 1;
}

// Maps "POST /api/v1/{token}/<route>" to a store action. Returns { action, payload, message } or null.
function resolveRoute(route, body, board) {
  let m;

  // home|away score increment/decrement — {"amount": n}, a negative amount on increment subtracts
  if ((m = route.match(/^(home|away)\/score\/(increment|decrement)$/))) {
    let amount = amountOf(body);
    if (m[2] === 'decrement') amount = -Math.abs(amount);
    const suffix = TEAM_SUFFIX[m[1]];
    return amount > 0
      ? { action: `point_${suffix}`, payload: { amount }, message: `${m[1]} score +${amount}` }
      : { action: `sub_point_${suffix}`, payload: { amount: -amount }, message: `${m[1]} score ${amount}` };
  }

  // home|away timeouts — increment starts a timeout, decrement removes one from the count
  if ((m = route.match(/^(home|away)\/timeouts\/(increment|decrement)$/))) {
    const suffix = TEAM_SUFFIX[m[1]];
    if (m[2] === 'increment') {
      const duration = Number(body && body.duration) > 0 ? Number(body.duration) : undefined;
      return { action: `timeout_${suffix}`, payload: duration ? { duration } : {}, message: `${m[1]} timeout started` };
    }
    return { action: `sub_timeout_${suffix}`, payload: {}, message: `${m[1]} timeout removed` };
  }

  // Serve: toggle or give it to a specific team
  if (route === 'serve/toggle') return { action: 'set_serve', payload: {}, message: 'serve toggled' };
  if ((m = route.match(/^(home|away)\/serve$/))) {
    return { action: 'set_serve', payload: { team: TEAM_KEYS[m[1]] }, message: `serve to ${m[1]}` };
  }

  switch (route) {
    case 'timeout/end':
      return { action: 'end_timeout', payload: {}, message: 'timeout ended' };
    case 'set/end': {
      const winner = body && TEAM_KEYS[body.winner];
      return { action: 'end_set', payload: winner ? { winner } : {}, message: 'set ended' };
    }
    case 'set/start':
      return { action: 'new_set', payload: {}, message: 'set started' };
    case 'sides/swap':
      return { action: 'swap_sides', payload: {}, message: 'sides swapped' };
    case 'timer/toggle': {
      const running = Boolean(board.setClock && board.setClock.running);
      return running
        ? { action: 'clock_pause', payload: {}, message: 'timer paused' }
        : { action: 'clock_start', payload: {}, message: 'timer started' };
    }
    case 'timer/start':
      return { action: 'clock_start', payload: {}, message: 'timer started' };
    case 'timer/pause':
      return { action: 'clock_pause', payload: {}, message: 'timer paused' };
    case 'timer/reset':
      return { action: 'clock_reset', payload: {}, message: 'timer reset' };
    case 'history/show':
      return { action: 'show_history', payload: {}, message: 'history shown' };
    case 'result/show':
      return { action: 'show_result', payload: {}, message: 'result shown' };
    case 'undo':
      return { action: 'undo', payload: {}, message: 'last action undone' };
    default:
      return null;
  }
}

/**
 * Handles /api/v1/* requests. Returns true when the request was handled.
 * sendJson and parseJsonBody are passed in from server.js to share response formatting.
 */
async function handle(req, res, pathname, method, { sendJson, parseJsonBody }) {
  const m = pathname.match(/^\/api\/v1\/([a-zA-Z0-9_-]+)(?:\/(.*?))?\/?$/);
  if (!m) return false;

  const token = m[1];
  const route = m[2] || '';

  const board = store.getBoard(token) || store.getBoardByOperatorToken(token);
  if (!board) {
    sendJson(res, 404, { message: 'Board not found' });
    return true;
  }

  if (isRateLimited(board.id)) {
    sendJson(res, 429, { message: 'Too many requests' }, { 'Retry-After': String(RATE_LIMIT_COOLDOWN_MS / 1000) });
    return true;
  }

  if (route === '') {
    if (method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return true;
    }
    sendJson(res, 200, store.serializeBoard(board));
    return true;
  }

  if (method !== 'POST') {
    sendJson(res, 405, { message: 'Method not allowed' });
    return true;
  }

  const body = await parseJsonBody(req);
  const resolved = resolveRoute(route, body, board);
  if (!resolved) {
    sendJson(res, 404, { message: 'Unknown endpoint' });
    return true;
  }

  const result = store.executeAction(board.id, resolved.action, resolved.payload, { isOwner: false, isOperator: true });
  if (!result.success) {
    sendJson(res, 400, { message: result.error || 'Action failed' });
    return true;
  }

  const updated = store.getBoard(board.id);
  sendJson(res, 200, { message: resolved.message, board: store.serializeBoard(updated) });
  return true;
}

module.exports = { handle };
