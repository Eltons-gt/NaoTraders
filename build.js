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

// 4. Ensure index.html in dist has clean relative script paths
const distIndex = path.join(DIST_DIR, 'index.html');
if (fs.existsSync(distIndex)) {
    let html = fs.readFileSync(distIndex, 'utf8');
    // Support both ../cdn.livechatinc.com and ./cdn.livechatinc.com
    html = html.replace(/\.\.\/cdn\.livechatinc\.com\/tracking\.js/g, 'cdn.livechatinc.com/tracking.js');
    fs.writeFileSync(distIndex, html, 'utf8');
}

console.log('NaoTraders build completed successfully -> dist/');
