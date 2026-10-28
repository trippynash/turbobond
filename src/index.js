const interfaceManager = require('./interfaceManager');
const ProxyServer = require('./proxyServer');
const DashboardServer = require('./dashboardServer');
const tetherManager = require('./tetherManager');

async function startTurboBond(options = {}) {
  const proxyPort = options.proxyPort || 8080;
  const dashboardPort = options.dashboardPort || 9999;

  // 1. Initialize Interface Discovery & Bandwidth Polling
  interfaceManager.startPolling(1000);

  // 2. Start Multi-WAN Proxy
  const proxy = new ProxyServer(proxyPort);
  await proxy.start();

  // 3. Start Web Dashboard
  const dashboard = new DashboardServer(proxy, dashboardPort);
  await dashboard.start();

  return {
    proxyPort,
    dashboardPort,
    proxy,
    dashboard,
    interfaceManager,
    tetherManager
  };
}

module.exports = { startTurboBond };
