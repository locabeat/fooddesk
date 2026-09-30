// Τοπικός server για δοκιμές: node serve.js → http://localhost:8081
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  // Δοκιμές: ψεύτικο Apps Script (tools/mock-gas.js) στο /mock-api
  if (req.method === 'POST' && req.url === '/mock-api') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { const out = require('./tools/mock-gas.js')(body); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out); });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(8081, () => console.log('Food Desk: http://localhost:8081'));
