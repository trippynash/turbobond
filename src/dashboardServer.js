const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const interfaceManager = require('./interfaceManager');
const tetherManager = require('./tetherManager');

class DashboardServer {
  constructor(proxyInstance, port = 9999) {
    this.proxy = proxyInstance;
    this.port = port;
    this.server = null;
    this.sseClients = [];

    interfaceManager.on('statsUpdated', (stats) => {
      this.broadcastSSE(stats);
    });
  }

  broadcastSSE(stats) {
    if (this.sseClients.length === 0) return;
    const payload = JSON.stringify({
      ...stats,
      activeConnections: this.proxy.activeConnections,
      totalRequests: this.proxy.totalRequests,
      recentRequests: this.proxy.recentRequests.slice(0, 15)
    });

    const msg = `data: ${payload}\n\n`;
    for (const res of this.sseClients) {
      try {
        res.write(msg);
      } catch (e) {}
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }

        // SSE Real-Time Stream
        if (url.pathname === '/api/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
          });
          if (res.flushHeaders) res.flushHeaders();
          res.write(': keepalive\n\n');
          this.sseClients.push(res);
          req.on('close', () => {
            this.sseClients = this.sseClients.filter(c => c !== res);
          });
          return;
        }

        // REST APIs
        if (url.pathname === '/api/status') {
          const stats = interfaceManager.getSnapshot();
          const tether = await tetherManager.getStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            ...stats,
            activeConnections: this.proxy.activeConnections,
            totalRequests: this.proxy.totalRequests,
            proxyPort: this.proxy.port,
            tether,
            recentRequests: this.proxy.recentRequests
          }));
        }

        if (url.pathname === '/api/tether/start' && req.method === 'POST') {
          try {
            const result = await tetherManager.start();
            interfaceManager.scanInterfaces();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
          }
        }

        if (url.pathname === '/api/tether/stop' && req.method === 'POST') {
          try {
            const result = await tetherManager.stop();
            interfaceManager.scanInterfaces();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
          }
        }

        if (url.pathname === '/api/tether/status') {
          const tether = await tetherManager.getStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(tether));
        }

        if (url.pathname === '/api/tether/logs') {
          const logs = tetherManager.getLogs();
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end(logs);
        }

        // System Proxy Toggle (With automatic localhost bypass)
        if (url.pathname === '/api/system-proxy/enable' && req.method === 'POST') {
          const port = this.proxy.port;
          const cmd = `networksetup -setwebproxy "Wi-Fi" 127.0.0.1 ${port} && networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 ${port} && networksetup -setproxybypassdomains "Wi-Fi" "127.0.0.1" "localhost" "*.local" "169.254/16"`;
          exec(cmd, (err) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: err.message }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, enabled: true }));
          });
          return;
        }

        if (url.pathname === '/api/system-proxy/disable' && req.method === 'POST') {
          const cmd = `networksetup -setwebproxystate "Wi-Fi" off && networksetup -setsecurewebproxystate "Wi-Fi" off`;
          exec(cmd, (err) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: err.message }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, enabled: false }));
          });
          return;
        }

        // Static Files Serving
        let filePath = path.join(__dirname, 'dashboard', url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(filePath)) {
          filePath = path.join(__dirname, 'dashboard', 'index.html');
        }

        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json',
          '.svg': 'image/svg+xml'
        };

        const contentType = mimeTypes[ext] || 'text/plain';
        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(404);
            return res.end('File not found');
          }
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        });
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        resolve({ port: this.port });
      });

      this.server.on('error', reject);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = DashboardServer;
