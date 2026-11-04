const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const SITE_DIR = path.join(ROOT_DIR, 'www.naotraders.com');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8'
};

// Simulation accounts in-memory store
const DEFAULT_REAL_SIMULATION_BALANCE = 500.00;
const DEFAULT_DEMO_SIMULATION_BALANCE = 10000.00;
const simulationAccounts = new Map();

function isDemoId(id = '') {
    return id.startsWith('VR') || id.startsWith('DEM') || id.startsWith('DOT');
}

function getOrCreateSimulationAccount(accountId = 'ROT91160344') {
    if (!simulationAccounts.has(accountId)) {
        simulationAccounts.set(accountId, {
            accountId,
            balance: isDemoId(accountId) ? DEFAULT_DEMO_SIMULATION_BALANCE : DEFAULT_REAL_SIMULATION_BALANCE,
            trades: []
        });
    }
    return simulationAccounts.get(accountId);
}

function parseJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Parse URL safely
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(reqUrl.pathname);

    // Simulation API Endpoints
    if (pathname === '/api/simulation') {
        const accountId = reqUrl.searchParams.get('accountId') || 'ROT91160344';
        const account = getOrCreateSimulationAccount(accountId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(account));
        return;
    }

    if (pathname === '/api/simulation/reset' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const accountId = body.accountId || reqUrl.searchParams.get('accountId') || 'ROT91160344';
        const account = getOrCreateSimulationAccount(accountId);
        account.balance = isDemoId(accountId) ? DEFAULT_DEMO_SIMULATION_BALANCE : DEFAULT_REAL_SIMULATION_BALANCE;
        account.trades = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            accountId: account.accountId,
            balance: account.balance,
            trades: account.trades
        }));
        return;
    }

    if (pathname === '/api/simulation/trade' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const accountId = body.accountId || reqUrl.searchParams.get('accountId') || 'ROT91160344';
        const amount = Number(body.amount) || 0;
        const profit = Number(body.profit) || 0;
        const result = body.result || (profit > 0 ? 'win' : 'loss');

        const account = getOrCreateSimulationAccount(accountId);
        account.balance = Math.max(0, account.balance - amount + profit);
        const tradeRecord = {
            id: Date.now(),
            amount,
            profit,
            result,
            balance: account.balance,
            timestamp: new Date().toISOString()
        };
        account.trades.push(tradeRecord);
        if (account.trades.length > 50) account.trades.shift();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            accountId: account.accountId,
            balance: account.balance,
            trade: tradeRecord
        }));
        return;
    }

    // Resolve file candidate paths
    let candidate = null;

    if (pathname === '/' || pathname === '') {
        candidate = path.join(SITE_DIR, 'index.html');
    } else if (pathname === '/callback' || pathname === '/callback/') {
        candidate = path.join(SITE_DIR, 'callback.html');
    } else if (pathname.startsWith('/cdn.livechatinc.com/')) {
        candidate = path.join(ROOT_DIR, pathname);
    } else if (pathname.startsWith('/www.naotraders.com/')) {
        candidate = path.join(ROOT_DIR, pathname);
    } else {
        const inSite = path.join(SITE_DIR, pathname);
        const inRoot = path.join(ROOT_DIR, pathname);
        if (fs.existsSync(inSite) && fs.statSync(inSite).isFile()) {
            candidate = inSite;
        } else if (fs.existsSync(inRoot) && fs.statSync(inRoot).isFile()) {
            candidate = inRoot;
        } else {
            // SPA fallback: return index.html for non-asset routes
            const ext = path.extname(pathname);
            if (!ext || ext === '.html') {
                candidate = path.join(SITE_DIR, 'index.html');
            }
        }
    }

    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(candidate).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`  NaoTraders Platform is running!`);
    console.log(`  Local URL: http://localhost:${PORT}`);
    console.log(`===========================================\n`);
});
