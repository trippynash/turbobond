const http = require('http');
const net = require('net');
const url = require('url');
const interfaceManager = require('./interfaceManager');

class ProxyServer {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.activeConnections = 0;
    this.recentRequests = [];
    this.totalRequests = 0;
  }

  logRequest(host, iface, bytes = 0, isConnect = false) {
    this.totalRequests++;
    const item = {
      id: this.totalRequests,
      time: new Date().toLocaleTimeString(),
      host: host || 'unknown',
      protocol: isConnect ? 'HTTPS' : 'HTTP',
      ifaceName: iface ? iface.name : 'default',
      ifaceLabel: iface ? iface.label : 'Default Gateway',
      ifaceIcon: iface ? iface.icon : '🌐',
      bytes
    };
    this.recentRequests.unshift(item);
    if (this.recentRequests.length > 40) {
      this.recentRequests.pop();
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const iface = interfaceManager.getNextInterface();
        const parsedUrl = url.parse(req.url);

        const options = {
          hostname: parsedUrl.hostname || req.headers.host,
          port: parsedUrl.port || 80,
          path: parsedUrl.path,
          method: req.method,
          headers: req.headers,
          localAddress: iface ? iface.address : undefined
        };

        this.logRequest(options.hostname, iface, 0, false);

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`TurboBond Bad Gateway: ${err.message}`);
        });

        req.pipe(proxyReq, { end: true });
      });

      // Handle HTTPS CONNECT Tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.activeConnections++;
        const iface = interfaceManager.getNextInterface();
        const [host, portStr] = req.url.split(':');
        const port = parseInt(portStr, 10) || 443;

        this.logRequest(host, iface, 0, true);

        const connectOptions = {
          host,
          port,
          localAddress: iface ? iface.address : undefined
        };

        const serverSocket = net.connect(connectOptions, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length > 0) {
            serverSocket.write(head);
          }
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);
        });

        serverSocket.on('error', () => {
          clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        });

        clientSocket.on('error', () => {
          serverSocket.destroy();
        });

        const onClose = () => {
          this.activeConnections = Math.max(0, this.activeConnections - 1);
        };
        clientSocket.on('close', onClose);
        serverSocket.on('close', onClose);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
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

module.exports = ProxyServer;
