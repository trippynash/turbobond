#!/usr/bin/env node

const { exec, execSync } = require('child_process');
const { startTurboBond } = require('../src/index');

const args = process.argv.slice(2);
const shouldOpen = args.includes('--open') || args.includes('-o');
const enableSysProxy = args.includes('--system-proxy') || args.includes('-s');

const proxyPort = parseInt(process.env.TURBOBOND_PROXY_PORT, 10) || 8080;
const dashboardPort = parseInt(process.env.TURBOBOND_DASHBOARD_PORT, 10) || 9999;

console.log('\x1b[1;36m===============================================================\x1b[0m');
console.log('\x1b[1;36m       ⚡ TurboBond — macOS Multi-Link Bandwidth Aggregator     \x1b[0m');
console.log('\x1b[1;36m===============================================================\x1b[0m');

startTurboBond({ proxyPort, dashboardPort }).then((instance) => {
  const ifaces = instance.interfaceManager.interfaces;

  console.log('\n\x1b[1;32m✨ Services Started Successfully:\x1b[0m');
  console.log(`  • \x1b[1mMulti-WAN Proxy Server:\x1b[0m  http://127.0.0.1:${proxyPort}`);
  console.log(`  • \x1b[1mReal-Time Dashboard:\x1b[0m     \x1b[1;34mhttp://localhost:${dashboardPort}\x1b[0m`);

  if (enableSysProxy) {
    try {
      execSync(`networksetup -setwebproxy "Wi-Fi" 127.0.0.1 ${proxyPort} && networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 ${proxyPort} && networksetup -setproxybypassdomains "Wi-Fi" "127.0.0.1" "localhost" "*.local" "169.254/16"`);
      console.log('  • \x1b[1;32mSystem Proxy:\x1b[0m            \x1b[32mENABLED on Wi-Fi (Multi-WAN Aggregation ACTIVE)\x1b[0m');
    } catch (e) {
      console.warn('  • \x1b[1;33mSystem Proxy:\x1b[0m            Could not automatically set Wi-Fi proxy:', e.message);
    }
  }

  console.log('\n\x1b[1;33m📡 Initial Detected Interfaces:\x1b[0m');
  if (ifaces.length === 0) {
    console.log('  \x1b[90m(Scanning for interfaces...)\x1b[0m');
  } else {
    for (const iface of ifaces) {
      console.log(`  • ${iface.icon} \x1b[1m${iface.label}\x1b[0m (${iface.name}): \x1b[36m${iface.address}\x1b[0m`);
    }
  }

  console.log('\n\x1b[1m💡 How to use with apps:\x1b[0m');
  console.log(`  • \x1b[33mSystem Proxy:\x1b[0m         Toggle in Dashboard (http://localhost:${dashboardPort}) or pass --system-proxy`);
  console.log(`  • \x1b[33mNeatDownloadManager:\x1b[0m  Settings -> Network Proxy -> 127.0.0.1:${proxyPort}`);
  console.log(`  • \x1b[33mChrome / Brave:\x1b[0m       open -na "Google Chrome" --args --proxy-server="127.0.0.1:${proxyPort}"`);
  console.log(`  • \x1b[33mTerminal:\x1b[0m             export ALL_PROXY=http://127.0.0.1:${proxyPort}\n`);

  if (shouldOpen) {
    exec(`open http://localhost:${dashboardPort}`);
  }

  const cleanupProxy = () => {
    try {
      execSync('networksetup -setwebproxystate "Wi-Fi" off 2>/dev/null && networksetup -setsecurewebproxystate "Wi-Fi" off 2>/dev/null');
    } catch (e) {}
  };

  const shutdown = () => {
    console.log('\n\x1b[1;33mStopping TurboBond services...\x1b[0m');
    cleanupProxy();
    instance.interfaceManager.stopPolling();
    instance.proxy.stop();
    instance.dashboard.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}).catch((err) => {
  console.error('\x1b[1;31m❌ Failed to start TurboBond:\x1b[0m', err.message);
  process.exit(1);
});
