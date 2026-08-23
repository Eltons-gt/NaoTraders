const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.cur': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    let url = req.url.split('?')[0];
    
    // Normalize URL paths to filesystem paths
    let filePath = '';
    if (url === '/' || url === '/index.html') {
        filePath = path.join(__dirname, 'index.html');
    } else if (url.startsWith('/static/js/')) {
        const fileName = url.substring('/static/js/'.length);
        filePath = path.join(__dirname, 'scripts', fileName);
    } else if (url.startsWith('/static/css/')) {
        const fileName = url.substring('/static/css/'.length);
        filePath = path.join(__dirname, 'styles', fileName);
    } else if (url.startsWith('/static/media/')) {
        const fileName = url.substring('/static/media/'.length);
        filePath = path.join(__dirname, 'images', fileName);
    } else if (url.startsWith('/images/')) {
        const fileName = url.substring('/images/'.length);
        filePath = path.join(__dirname, 'images', fileName);
    } else {
        // Fallback: look in root, scripts, styles, images
        filePath = path.join(__dirname, url);
    }
    
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Check in other directories as fallback
            const baseName = path.basename(url);
            const fallbackPaths = [
                path.join(__dirname, 'scripts', baseName),
                path.join(__dirname, 'styles', baseName),
                path.join(__dirname, 'images', baseName)
            ];
            
            let found = false;
            for (const fp of fallbackPaths) {
                if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
                    filePath = fp;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                console.log(`Not found: ${req.url} (resolved to: ${filePath})`);
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
        }
        
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
