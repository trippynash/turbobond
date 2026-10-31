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
        let targetHost = '';
        let targetPort = 80;
        let targetPath = req.url;

        try {
          const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
          targetHost = (parsedUrl.hostname || req.headers.host || '').split(':')[0];
          targetPort = parseInt(parsedUrl.port, 10) || 80;
          targetPath = parsedUrl.pathname + parsedUrl.search;
        } catch (e) {
          targetHost = (req.headers.host || '').split(':')[0];
        }

        const isIPv4 = iface && net.isIPv4(iface.address);
        const options = {
          hostname: targetHost,
          port: targetPort,
          path: targetPath,
          method: req.method,
          headers: req.headers,
          localAddress: iface ? iface.address : undefined,
          family: isIPv4 ? 4 : undefined
        };

        this.logRequest(targetHost, iface, 0, false);

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          // Fallback without localAddress if interface binding fails
          if (options.localAddress) {
            const fallbackOptions = { ...options, localAddress: undefined, family: undefined };
            const fallbackReq = http.request(fallbackOptions, (fallbackRes) => {
              res.writeHead(fallbackRes.statusCode, fallbackRes.headers);
              fallbackRes.pipe(res, { end: true });
            });
            fallbackReq.on('error', (fbErr) => {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end(`TurboBond Bad Gateway: ${fbErr.message}`);
            });
            req.pipe(fallbackReq, { end: true });
            return;
          }
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`TurboBond Bad Gateway: ${err.message}`);
        });

        req.pipe(proxyReq, { end: true });
      });

      // Handle HTTPS CONNECT Tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.activeConnections++;
        const iface = interfaceManager.getNextInterface();
        const [rawHost, rawPortStr] = req.url.split(':');
        const host = rawHost.replace(/^\[|\]$/g, ''); // strip IPv6 brackets if any
        const port = parseInt(rawPortStr, 10) || 443;

        this.logRequest(host, iface, 0, true);

        const isIPv4 = iface && net.isIPv4(iface.address);
        const connectOptions = {
          host,
          port,
          localAddress: iface ? iface.address : undefined,
          family: isIPv4 ? 4 : undefined
        };

        const pipeTunnels = (serverSocket) => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length > 0) {
            serverSocket.write(head);
          }
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);

          let closed = false;
          const onClose = () => {
            if (!closed) {
              closed = true;
              this.activeConnections = Math.max(0, this.activeConnections - 1);
            }
          };
          clientSocket.on('close', onClose);
          serverSocket.on('close', onClose);

          clientSocket.on('error', () => serverSocket.destroy());
          serverSocket.on('error', () => clientSocket.destroy());
        };

        const serverSocket = net.connect(connectOptions, () => {
          pipeTunnels(serverSocket);
        });

        serverSocket.on('error', (err) => {
          // Fallback without localAddress if binding threw EINVAL or interface went down
          if (connectOptions.localAddress) {
            const fallbackSocket = net.connect({ host, port }, () => {
              pipeTunnels(fallbackSocket);
            });
            fallbackSocket.on('error', () => {
              clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            });
            return;
          }
          clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        });
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
