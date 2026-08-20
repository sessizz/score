const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (err2, data) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // --- API Endpoints ---

  // Health check for Coolify & Docker
  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  }

  // List all boards
  if (pathname === '/api/boards' && method === 'GET') {
    return sendJson(res, 200, store.getAllBoardsSummary());
  }

  // Create or clone a board
  if (pathname === '/api/boards' && method === 'POST') {
    const body = await parseJsonBody(req);
    const id = body.id ? body.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-') : `match-${Date.now().toString(36)}`;
    const board = store.getBoard(id);
    if (body.preset && store.PRESETS[body.preset]) {
      store.executeAction(id, 'reset_match');
    }
    return sendJson(res, 200, { success: true, boardId: id, board });
  }

  // Get specific board
  const boardMatch = pathname.match(/^\/api\/board\/([a-zA-Z0-9_-]+)$/);
  if (boardMatch && method === 'GET') {
    const boardId = boardMatch[1];
    const board = store.getBoard(boardId);
    return sendJson(res, 200, board);
  }

  // Action on board
  const actionMatch = pathname.match(/^\/api\/board\/([a-zA-Z0-9_-]+)\/action$/);
  if (actionMatch && method === 'POST') {
    const boardId = actionMatch[1];
    const body = await parseJsonBody(req);
    const { action, payload, pin } = body;

    const board = store.getBoard(boardId);

    // PIN check for protected actions
    if (board.adminPin && board.adminPin.trim() !== '') {
      const protectedActions = ['update_teams', 'update_rules', 'update_meta', 'reset_match'];
      if (protectedActions.includes(action) && pin !== board.adminPin) {
        return sendJson(res, 403, { success: false, error: 'Geçersiz Yönetici PIN Kodu!' });
      }
    }

    const result = store.executeAction(boardId, action, payload);
    return sendJson(res, result.success ? 200 : 400, result);
  }

  // SSE Stream
  const streamMatch = pathname.match(/^\/api\/board\/([a-zA-Z0-9_-]+)\/stream$/);
  if (streamMatch && method === 'GET') {
    const boardId = streamMatch[1];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });

    store.addSseClient(boardId, res);
    return;
  }

  // --- Page Routes & Static Files ---

  // Control Panel
  if (pathname.startsWith('/control')) {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'control.html'));
  }

  // OBS Overlay
  if (pathname.startsWith('/overlay')) {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'overlay.html'));
  }

  // Live Spectator / Gym Scoreboard
  if (pathname.startsWith('/live') || pathname.startsWith('/board')) {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'live.html'));
  }

  // Root / Index
  if (pathname === '/' || pathname === '/index.html') {
    return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  // Static Assets (CSS, JS, Images)
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const localFilePath = path.join(PUBLIC_DIR, safePath);
  serveStaticFile(res, localFilePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🏐 Voleybol Skorboard Sistemi Başlatıldı (Native 0-Dep HTTP)`);
  console.log(`📡 Port: http://0.0.0.0:${PORT}`);
  console.log(`🎛️ Kumanda Paneli: http://localhost:${PORT}/control/fenerbahce`);
  console.log(`📺 OBS Overlay:    http://localhost:${PORT}/overlay/fenerbahce`);
  console.log(`🏟️ Salon Ekranı:   http://localhost:${PORT}/live/fenerbahce`);
  console.log(`=================================================`);
});
