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

const server = http.createServer((req, res) => {
    // Parse URL safely
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(reqUrl.pathname);

    // Resolve file candidate paths
    let candidate = null;

    if (pathname === '/' || pathname === '') {
        candidate = path.join(SITE_DIR, 'index.html');
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

