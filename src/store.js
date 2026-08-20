const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'boards.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory boards cache & undo stacks
const boards = new Map();
const undoStacks = new Map();
const sseClients = new Map(); // boardId -> Set of res objects

// Preset templates
const PRESETS = {
  fenerbahce: {
    title: 'Fenerbahçe Küçük Erkek Voleybol Ligi',
    subtitle: 'Canlı Yayın',
    teamA: {
      name: 'FENERBAHÇE',
      shortName: 'FB',
      color: '#002d72',
      textColor: '#ffffff',
      accentColor: '#ffe500',
      logo: '/assets/fenerbahce.svg',
      setsWon: 0,
      points: 0,
      timeouts: 0,
      substitutions: 0,
      isServing: true
    },
    teamB: {
      name: 'RAKİP TAKIM',
      shortName: 'RAK',
      color: '#d32f2f',
      textColor: '#ffffff',
      accentColor: '#ffffff',
      logo: '/assets/opponent.svg',
      setsWon: 0,
      points: 0,
      timeouts: 0,
      substitutions: 0,
      isServing: false
    },
    currentSet: 1,
    setHistory: [],
    rules: {
      maxSets: 5, // Best of 5 (First to 3)
      setsToWin: 3,
      setPoints: 25,
      finalSetPoints: 15,
      winByTwo: true
    },
    courtSwapped: false, // Visual swap for referee panel & overlay
    status: 'live', // 'live', 'timeout', 'set_break', 'finished'
    timeoutState: {
      active: false,
      team: null,
      duration: 30,
      startedAt: null,
      endsAt: null
    },
    adminPin: '1907',
    bannerText: '',
    showBanner: false
  },
  generic: {
    title: 'Voleybol Müsabakası',
    subtitle: 'Canlı Yayın',
    teamA: {
      name: 'EV SAHİBİ',
      shortName: 'EV',
      color: '#1565c0',
      textColor: '#ffffff',
      accentColor: '#ffffff',
      logo: '',
      setsWon: 0,
      points: 0,
      timeouts: 0,
      substitutions: 0,
      isServing: true
    },
    teamB: {
      name: 'DEPLASMAN',
      shortName: 'DEP',
      color: '#c62828',
      textColor: '#ffffff',
      accentColor: '#ffffff',
      logo: '',
      setsWon: 0,
      points: 0,
      timeouts: 0,
      substitutions: 0,
      isServing: false
    },
    currentSet: 1,
    setHistory: [],
    rules: {
      maxSets: 5,
      setsToWin: 3,
      setPoints: 25,
      finalSetPoints: 15,
      winByTwo: true
    },
    courtSwapped: false,
    status: 'live',
    timeoutState: {
      active: false,
      team: null,
      duration: 30,
      startedAt: null,
      endsAt: null
    },
    adminPin: '1234',
    bannerText: '',
    showBanner: false
  }
};

function createDefaultBoard(id, presetKey = 'fenerbahce') {
  const base = PRESETS[presetKey] || PRESETS.fenerbahce;
  return JSON.parse(JSON.stringify({
    id,
    ...base,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }));
}

// Load data from disk
function loadBoardsFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [id, board] of Object.entries(parsed)) {
        boards.set(id, board);
        undoStacks.set(id, []);
      }
    }
  } catch (err) {
    console.error('Error loading boards from disk:', err);
  }

  // Ensure default main / fenerbahce board exists
  if (!boards.has('default')) {
    const defaultBoard = createDefaultBoard('default', 'fenerbahce');
    boards.set('default', defaultBoard);
    undoStacks.set('default', []);
    saveBoardsToDisk();
  }
}

// Save data to disk atomically
function saveBoardsToDisk() {
  try {
    const obj = {};
    for (const [id, board] of boards.entries()) {
      obj[id] = board;
    }
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('Error saving boards to disk:', err);
  }
}

// Push state to undo stack
function pushUndo(boardId) {
  const board = boards.get(boardId);
  if (!board) return;
  if (!undoStacks.has(boardId)) {
    undoStacks.set(boardId, []);
  }
  const stack = undoStacks.get(boardId);
  // Keep deep clone
  stack.push(JSON.parse(JSON.stringify(board)));
  if (stack.length > 40) {
    stack.shift();
  }
}

function getBoard(boardId) {
  if (!boards.has(boardId)) {
    // Create new board if not found
    const newBoard = createDefaultBoard(boardId, 'fenerbahce');
    boards.set(boardId, newBoard);
    undoStacks.set(boardId, []);
    saveBoardsToDisk();
  }
  return boards.get(boardId);
}

function getAllBoardsSummary() {
  const list = [];
  for (const [id, b] of boards.entries()) {
    list.push({
      id,
      title: b.title,
      subtitle: b.subtitle,
      teamA: { name: b.teamA.name, shortName: b.teamA.shortName, setsWon: b.teamA.setsWon, points: b.teamA.points },
      teamB: { name: b.teamB.name, shortName: b.teamB.shortName, setsWon: b.teamB.setsWon, points: b.teamB.points },
      currentSet: b.currentSet,
      status: b.status,
      updatedAt: b.updatedAt
    });
  }
  return list;
}

// Helper to check target points for a given set
function getTargetPointsForSet(board, setNumber) {
  const isFinalSet = setNumber >= board.rules.maxSets;
  return isFinalSet ? board.rules.finalSetPoints : board.rules.setPoints;
}

// Helper to check if a set or match is won
function checkSetStatus(board) {
  const target = getTargetPointsForSet(board, board.currentSet);
  const pA = board.teamA.points;
  const pB = board.teamB.points;
  const diff = Math.abs(pA - pB);

  let setWinner = null;
  if (board.rules.winByTwo) {
    if (pA >= target && pA - pB >= 2) setWinner = 'teamA';
    else if (pB >= target && pB - pA >= 2) setWinner = 'teamB';
  } else {
    if (pA >= target) setWinner = 'teamA';
    else if (pB >= target) setWinner = 'teamB';
  }

  return {
    setWinner,
    isSetPointA: (pA >= target - 1 && pA > pB),
    isSetPointB: (pB >= target - 1 && pB > pA),
    isMatchPointA: (pA >= target - 1 && pA > pB && board.teamA.setsWon === board.rules.setsToWin - 1),
    isMatchPointB: (pB >= target - 1 && pB > pA && board.teamB.setsWon === board.rules.setsToWin - 1)
  };
}

// Execute an action on a board
function executeAction(boardId, action, payload = {}) {
  const board = getBoard(boardId);
  if (!board) return { success: false, error: 'Board not found' };

  // For state-modifying actions, save to undo stack first
  if (action !== 'undo') {
    pushUndo(boardId);
  }

  let modified = true;

  switch (action) {
    case 'point_a': {
      board.teamA.points += (payload.amount || 1);
      // In volleyball, the team winning the rally serves
      board.teamA.isServing = true;
      board.teamB.isServing = false;
      break;
    }
    case 'point_b': {
      board.teamB.points += (payload.amount || 1);
      board.teamB.isServing = true;
      board.teamA.isServing = false;
      break;
    }
    case 'sub_point_a': {
      board.teamA.points = Math.max(0, board.teamA.points - (payload.amount || 1));
      break;
    }
    case 'sub_point_b': {
      board.teamB.points = Math.max(0, board.teamB.points - (payload.amount || 1));
      break;
    }
    case 'set_points': {
      if (typeof payload.pointsA === 'number') board.teamA.points = Math.max(0, payload.pointsA);
      if (typeof payload.pointsB === 'number') board.teamB.points = Math.max(0, payload.pointsB);
      break;
    }
    case 'set_serve': {
      const team = payload.team; // 'teamA' or 'teamB'
      if (team === 'teamA') {
        board.teamA.isServing = true;
        board.teamB.isServing = false;
      } else if (team === 'teamB') {
        board.teamB.isServing = true;
        board.teamA.isServing = false;
      } else {
        // toggle
        board.teamA.isServing = !board.teamA.isServing;
        board.teamB.isServing = !board.teamA.isServing;
      }
      break;
    }
    case 'timeout_a': {
      if (board.teamA.timeouts < 2) {
        board.teamA.timeouts += 1;
        startTimeout(board, 'teamA', payload.duration || 30);
      }
      break;
    }
    case 'timeout_b': {
      if (board.teamB.timeouts < 2) {
        board.teamB.timeouts += 1;
        startTimeout(board, 'teamB', payload.duration || 30);
      }
      break;
    }
    case 'sub_timeout_a': {
      board.teamA.timeouts = Math.max(0, board.teamA.timeouts - 1);
      break;
    }
    case 'sub_timeout_b': {
      board.teamB.timeouts = Math.max(0, board.teamB.timeouts - 1);
      break;
    }
    case 'end_timeout': {
      board.timeoutState = {
        active: false,
        team: null,
        duration: 30,
        startedAt: null,
        endsAt: null
      };
      if (board.status === 'timeout') {
        board.status = 'live';
      }
      break;
    }
    case 'swap_sides': {
      board.courtSwapped = !board.courtSwapped;
      break;
    }
    case 'end_set': {
      // Determine winner based on score or payload
      let winner = payload.winner;
      if (!winner) {
        winner = board.teamA.points > board.teamB.points ? 'teamA' : 'teamB';
      }

      // Record set history
      board.setHistory.push({
        set: board.currentSet,
        scoreA: board.teamA.points,
        scoreB: board.teamB.points,
        winner
      });

      if (winner === 'teamA') board.teamA.setsWon += 1;
      else if (winner === 'teamB') board.teamB.setsWon += 1;

      // Check if match won
      const setsToWin = board.rules.setsToWin || Math.ceil(board.rules.maxSets / 2);
      if (board.teamA.setsWon >= setsToWin || board.teamB.setsWon >= setsToWin) {
        board.status = 'finished';
      } else {
        board.status = 'set_break';
        board.currentSet += 1;
        // Reset current set points & timeouts
        board.teamA.points = 0;
        board.teamB.points = 0;
        board.teamA.timeouts = 0;
        board.teamB.timeouts = 0;
        board.teamA.substitutions = 0;
        board.teamB.substitutions = 0;
        // Usually teams swap courts between sets
        board.courtSwapped = !board.courtSwapped;
      }
      break;
    }
    case 'new_set': {
      board.status = 'live';
      break;
    }
    case 'reset_current_set': {
      board.teamA.points = 0;
      board.teamB.points = 0;
      board.teamA.timeouts = 0;
      board.teamB.timeouts = 0;
      board.teamA.substitutions = 0;
      board.teamB.substitutions = 0;
      board.status = 'live';
      break;
    }
    case 'reset_match': {
      board.currentSet = 1;
      board.setHistory = [];
      board.teamA.setsWon = 0;
      board.teamA.points = 0;
      board.teamA.timeouts = 0;
      board.teamA.substitutions = 0;
      board.teamB.setsWon = 0;
      board.teamB.points = 0;
      board.teamB.timeouts = 0;
      board.teamB.substitutions = 0;
      board.status = 'live';
      board.courtSwapped = false;
      board.timeoutState = {
        active: false,
        team: null,
        duration: 30,
        startedAt: null,
        endsAt: null
      };
      break;
    }
    case 'update_teams': {
      if (payload.teamA) {
        board.teamA = { ...board.teamA, ...payload.teamA };
      }
      if (payload.teamB) {
        board.teamB = { ...board.teamB, ...payload.teamB };
      }
      break;
    }
    case 'update_rules': {
      if (payload.rules) {
        board.rules = { ...board.rules, ...payload.rules };
        board.rules.setsToWin = Math.ceil(board.rules.maxSets / 2);
      }
      break;
    }
    case 'update_meta': {
      if (payload.title !== undefined) board.title = payload.title;
      if (payload.subtitle !== undefined) board.subtitle = payload.subtitle;
      if (payload.bannerText !== undefined) board.bannerText = payload.bannerText;
      if (payload.showBanner !== undefined) board.showBanner = Boolean(payload.showBanner);
      if (payload.adminPin !== undefined) board.adminPin = payload.adminPin;
      break;
    }
    case 'undo': {
      const stack = undoStacks.get(boardId);
      if (stack && stack.length > 0) {
        const previousState = stack.pop();
        boards.set(boardId, previousState);
        modified = true;
      } else {
        return { success: false, error: 'Geri alınacak hareket yok' };
      }
      break;
    }
    default: {
      return { success: false, error: `Bilinmeyen eylem: ${action}` };
    }
  }

  if (modified) {
    const current = boards.get(boardId);
    current.updatedAt = Date.now();
    saveBoardsToDisk();
    broadcastBoard(boardId);
  }

  return { success: true, board: boards.get(boardId) };
}

function startTimeout(board, team, duration = 30) {
  const now = Date.now();
  board.status = 'timeout';
  board.timeoutState = {
    active: true,
    team,
    duration,
    startedAt: now,
    endsAt: now + (duration * 1000)
  };
}

// SSE Connection Management
function addSseClient(boardId, res) {
  if (!sseClients.has(boardId)) {
    sseClients.set(boardId, new Set());
  }
  const clients = sseClients.get(boardId);
  clients.add(res);

  // Send current state immediately
  const board = getBoard(boardId);
  const data = JSON.stringify(enrichBoardData(board));
  res.write(`event: state\ndata: ${data}\n\n`);

  // Remove on close
  res.on('close', () => {
    clients.delete(res);
  });
}

// Enrich board data with calculation flags (isSetPoint, isMatchPoint, etc.)
function enrichBoardData(board) {
  const flags = checkSetStatus(board);
  return {
    ...board,
    flags
  };
}

function broadcastBoard(boardId) {
  const clients = sseClients.get(boardId);
  if (!clients || clients.size === 0) return;

  const board = getBoard(boardId);
  const data = JSON.stringify(enrichBoardData(board));
  for (const client of clients) {
    try {
      client.write(`event: state\ndata: ${data}\n\n`);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Heartbeat every 15s to keep SSE alive
setInterval(() => {
  for (const [boardId, clients] of sseClients.entries()) {
    for (const client of clients) {
      try {
        client.write(`event: ping\ndata: ${Date.now()}\n\n`);
      } catch (e) {
        clients.delete(client);
      }
    }
  }
}, 15000);

// Initialize store
loadBoardsFromDisk();

module.exports = {
  getBoard,
  getAllBoardsSummary,
  executeAction,
  addSseClient,
  broadcastBoard,
  createDefaultBoard,
  PRESETS
};
