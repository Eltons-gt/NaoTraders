#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('Building NaoTraders production distribution...');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'www.naotraders.com');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else if (exists) {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

// 1. Clean and recreate dist
if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 2. Copy www.naotraders.com to dist
copyRecursiveSync(SRC_DIR, DIST_DIR);

// 3. Copy cdn.livechatinc.com to dist
const livechatSrc = path.join(ROOT_DIR, 'cdn.livechatinc.com');
if (fs.existsSync(livechatSrc)) {
    copyRecursiveSync(livechatSrc, path.join(DIST_DIR, 'cdn.livechatinc.com'));
}

// 3b. Copy scripts directory if present in root
const scriptsSrc = path.join(ROOT_DIR, 'scripts');
if (fs.existsSync(scriptsSrc)) {
    copyRecursiveSync(scriptsSrc, path.join(DIST_DIR, 'scripts'));
}

// 4. Parse .env and inject window.__ENV into dist/index.html
let envVars = {};
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim();
                envVars[key] = val;
            }
        }
    });
}

// Also read environment variables passed by host/Vercel (process.env)
for (const k of ['NEXT_PUBLIC_DERIV_APP_ID', 'NEXT_PUBLIC_DERIV_APP_NAME', 'NEXT_PUBLIC_DERIV_REFERRAL_LINK', 'NEXT_PUBLIC_DERIV_REDIRECT_URI', 'VITE_DERIV_APP_ID']) {
    if (process.env[k]) {
        envVars[k] = process.env[k];
    }
}

const distIndex = path.join(DIST_DIR, 'index.html');
if (fs.existsSync(distIndex)) {
    let html = fs.readFileSync(distIndex, 'utf8');
    html = html.replace(/\.\.\/cdn\.livechatinc\.com\/tracking\.js/g, 'cdn.livechatinc.com/tracking.js');
    if (!html.includes('<base')) {
        html = html.replace('<head>', '<head>\n  <base href="/" />');
    }
    const envScript = `<script>window.__ENV = ${JSON.stringify(envVars)};</script>\n`;
    html = html.replace('<head>', `<head>\n  ${envScript}`);
    fs.writeFileSync(distIndex, html, 'utf8');
}

// 5. Ensure callback handling static pages exist in dist
const callbackHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authenticating - NaoTraders</title>
    <link rel="icon" type="image/jpeg" href="/naotraders.jpeg" />
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: #0b0e14;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .spinner {
            width: 44px;
            height: 44px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: #00e699;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .text { font-size: 15px; color: #94a3b8; }
    </style>
    <script>
        (function() {
            try {
                var search = window.location.search || '';
                var hash = window.location.hash || '';
                window.location.replace(window.location.origin + '/' + search + hash);
            } catch (e) {
                window.location.href = '/' + window.location.search + window.location.hash;
            }
        })();
    </script>
</head>
<body>
    <div class="spinner"></div>
    <div class="text">Authenticating with NaoTraders...</div>
</body>
</html>`;

fs.writeFileSync(path.join(DIST_DIR, 'callback.html'), callbackHtmlContent, 'utf8');
const callbackDir = path.join(DIST_DIR, 'callback');
if (!fs.existsSync(callbackDir)) {
    fs.mkdirSync(callbackDir, { recursive: true });
}
fs.writeFileSync(path.join(callbackDir, 'index.html'), callbackHtmlContent, 'utf8');

console.log('NaoTraders build completed successfully -> dist/');
