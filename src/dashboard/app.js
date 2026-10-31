// TurboBond Real-Time Client Application
let currentTetherState = null;
let systemProxyEnabled = false;
let currentProxyPort = 8080;

function updateProxyPortUI(port) {
  if (!port || port === currentProxyPort) return;
  currentProxyPort = port;

  const endpointEl = document.getElementById('proxyEndpoint');
  if (endpointEl) endpointEl.textContent = `127.0.0.1:${port}`;

  const guideBadge = document.getElementById('guideBadge');
  if (guideBadge) guideBadge.textContent = `Active on ${port}`;

  const guidePort = document.getElementById('guidePort');
  if (guidePort) guidePort.textContent = port;

  const chromeCmd = `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --proxy-server="127.0.0.1:${port}"`;
  const guideChromeCode = document.getElementById('guideChromeCode');
  if (guideChromeCode) guideChromeCode.textContent = chromeCmd;

  const btnCopyChrome = document.getElementById('btnCopyChromeCode');
  if (btnCopyChrome) btnCopyChrome.setAttribute('data-copy', chromeCmd);

  const termCmd = `export ALL_PROXY=http://127.0.0.1:${port}`;
  const guideTermCode = document.getElementById('guideTerminalCode');
  if (guideTermCode) guideTermCode.textContent = termCmd;

  const btnCopyTerm = document.getElementById('btnCopyTerminalCode');
  if (btnCopyTerm) btnCopyTerm.setAttribute('data-copy', termCmd);
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return { val: bytesPerSec.toFixed(0), unit: 'B/s' };
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return { val: kb.toFixed(1), unit: 'KB/s' };
  const mb = kb / 1024;
  return { val: mb.toFixed(2), unit: 'MB/s' };
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function generateSparklineSvg(history = []) {
  if (history.length < 2) return '';
  const max = Math.max(...history.map(h => h.down), 1024);
  const width = 280;
  const height = 40;
  const step = width / (history.length - 1);

  const points = history.map((h, i) => {
    const x = i * step;
    const y = height - (h.down / max) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}">
      <polyline class="sparkline-path" points="${points}" />
    </svg>
  `;
}

// Render Interface Cards
function renderInterfaces(interfaces) {
  const container = document.getElementById('interfacesGrid');
  if (!interfaces || interfaces.length === 0) {
    container.innerHTML = '<div class="empty-state">No active network interfaces found.</div>';
    return;
  }

  container.innerHTML = interfaces.map(iface => {
    const down = formatSpeed(iface.downBps || 0);
    const up = formatSpeed(iface.upBps || 0);
    const sparkline = generateSparklineSvg(iface.history || []);

    return `
      <div class="interface-card" id="card-${iface.name}">
        <div class="iface-top">
          <div class="iface-identity">
            <div class="iface-icon">${iface.icon}</div>
            <div>
              <div class="iface-name">${iface.label}</div>
              <div class="iface-sub">${iface.name} • ${iface.address}</div>
            </div>
          </div>
          <span class="badge success">Active</span>
        </div>

        <div class="iface-rates">
          <div class="rate-item down">
            <span>DOWNLOAD</span>
            <strong>${down.val} <small>${down.unit}</small></strong>
          </div>
          <div class="rate-item up">
            <span>UPLOAD</span>
            <strong>${up.val} <small>${up.unit}</small></strong>
          </div>
          <div class="rate-item reqs">
            <span>DISPATCHED</span>
            <strong>${iface.requestCount || 0} <small>reqs</small></strong>
          </div>
        </div>

        <div class="sparkline-box">
          ${sparkline}
        </div>
      </div>
    `;
  }).join('');
}

// Render Live Stream Log
function renderStreamLog(recentRequests = []) {
  const container = document.getElementById('streamLog');
  if (recentRequests.length === 0) {
    container.innerHTML = '<div class="stream-item empty">Waiting for traffic through proxy...</div>';
    return;
  }

  container.innerHTML = recentRequests.slice(0, 10).map(item => `
    <div class="stream-item">
      <div class="stream-host">${item.host}</div>
      <div class="stream-iface">
        <span>${item.ifaceIcon}</span>
        <span>${item.ifaceLabel} (${item.ifaceName})</span>
      </div>
      <div class="stream-time">${item.time}</div>
    </div>
  `).join('');
}

// Update Tether Widget
function updateTetherWidget(tether) {
  currentTetherState = tether;
  const badge = document.getElementById('tetherStatusBadge');
  const deviceEl = document.getElementById('tetherDeviceName');
  const ipEl = document.getElementById('tetherIp');
  const btn = document.getElementById('btnTetherToggle');

  // Case 1: Actively Connected with valid IP
  if (tether.running && tether.ip && tether.ip !== 'Acquiring IP...') {
    badge.className = 'badge success';
    badge.textContent = 'Connected';
    deviceEl.textContent = tether.deviceName || 'Android Connected';
    ipEl.textContent = `IP: ${tether.ip}`;
    btn.textContent = 'Disconnect Tethering';
    btn.className = 'btn-secondary';
    btn.disabled = false;
  }
  // Case 2: Acquiring IP / Connecting in progress
  else if (tether.acquiring || tether.ip === 'Acquiring IP...') {
    badge.className = 'badge warning';
    badge.textContent = 'Connecting...';
    deviceEl.textContent = tether.deviceName || 'Android Attached';
    ipEl.textContent = 'Acquiring IP...';
    btn.textContent = 'Cancel / Disconnect';
    btn.className = 'btn-secondary';
    btn.disabled = false;
  }
  // Case 3: Device Attached & Ready to Connect
  else if (tether.deviceAttached) {
    badge.className = 'badge warning';
    badge.textContent = 'Device Ready';
    deviceEl.textContent = tether.deviceName || 'Android Attached';
    ipEl.textContent = 'Ready to launch';
    btn.textContent = '⚡ Connect USB Tethering';
    btn.className = 'btn-primary';
    btn.disabled = false;
  }
  // Case 4: No Device Connected
  else {
    badge.className = 'badge danger';
    badge.textContent = 'No Device';
    deviceEl.textContent = 'No USB Tethering device detected';
    ipEl.textContent = 'Connect phone via USB';
    btn.textContent = 'Connect USB Tethering';
    btn.className = 'btn-primary';
    btn.disabled = true;
  }
}

// Update Master Stats
function updateStats(data) {
  const down = formatSpeed(data.totalDownBps || 0);
  const up = formatSpeed(data.totalUpBps || 0);

  document.getElementById('totalDownSpeed').textContent = down.val;
  document.getElementById('totalDownUnit').textContent = down.unit;
  document.getElementById('totalUpSpeed').textContent = up.val;
  document.getElementById('totalUpUnit').textContent = up.unit;

  document.getElementById('activeAdapterCount').textContent = (data.interfaces || []).length;
  document.getElementById('activeStreamsCount').textContent = data.activeConnections || 0;

  let totalDownBytes = 0;
  let totalUpBytes = 0;
  for (const iface of (data.interfaces || [])) {
    totalDownBytes += (iface.totalDown || 0);
    totalUpBytes += (iface.totalUp || 0);
  }
  document.getElementById('totalDownBytes').textContent = formatBytes(totalDownBytes);
  document.getElementById('totalUpBytes').textContent = formatBytes(totalUpBytes);

  renderInterfaces(data.interfaces || []);
  if (data.proxyPort) {
    updateProxyPortUI(data.proxyPort);
  }
  if (data.recentRequests) {
    renderStreamLog(data.recentRequests);
  }
}

// Setup EventSource (SSE)
function setupSSE() {
  const es = new EventSource('/api/stream');
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateStats(data);
    } catch (e) {}
  };
  es.onerror = () => {
    setTimeout(setupSSE, 3000);
  };
}

// Update System Proxy State & UI
function updateSystemProxyUI(enabled) {
  systemProxyEnabled = Boolean(enabled);
  const label = document.getElementById('systemProxyLabel');
  const btnHeader = document.getElementById('btnSystemProxyToggle');
  const banner = document.getElementById('proxyStatusBanner');
  const bannerIcon = document.getElementById('bannerIconBadge');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerDesc = document.getElementById('bannerDesc');
  const bannerBtn = document.getElementById('btnBannerProxyToggle');

  if (systemProxyEnabled) {
    if (label) label.textContent = 'System Proxy: ON';
    if (btnHeader) {
      btnHeader.style.borderColor = '#10b981';
      btnHeader.style.color = '#10b981';
    }
    if (banner) {
      banner.className = 'system-proxy-banner active';
    }
    if (bannerIcon) bannerIcon.textContent = '⚡';
    if (bannerTitle) bannerTitle.textContent = 'Multi-WAN Aggregation Active — All Mac Web Traffic is Bonded';
    if (bannerDesc) bannerDesc.textContent = 'macOS HTTP & HTTPS traffic is dynamically distributed across Wi-Fi and USB Tethering in real time.';
    if (bannerBtn) {
      bannerBtn.textContent = 'Disable System Proxy';
      bannerBtn.className = 'btn-secondary';
    }
  } else {
    if (label) label.textContent = 'System Proxy: Off';
    if (btnHeader) {
      btnHeader.style.borderColor = '';
      btnHeader.style.color = '';
    }
    if (banner) {
      banner.className = 'system-proxy-banner warning';
    }
    if (bannerIcon) bannerIcon.textContent = '⚠️';
    if (bannerTitle) bannerTitle.textContent = 'macOS is routing traffic through Wi-Fi only';
    if (bannerDesc) bannerDesc.textContent = 'macOS default gateway ignores secondary connections like USB Tethering. Enable System Proxy below to bond both networks immediately.';
    if (bannerBtn) {
      bannerBtn.textContent = '⚡ Enable System Proxy Now';
      bannerBtn.className = 'btn-primary';
    }
  }
}

async function toggleSystemProxy() {
  const endpoint = systemProxyEnabled ? '/api/system-proxy/disable' : '/api/system-proxy/enable';
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    updateSystemProxyUI(data.enabled);
  } catch (err) {
    alert(`Failed to toggle system proxy: ${err.message}`);
  }
}

// Initial bootstrap
async function bootstrap() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateStats(data);
    if (data.proxyPort) {
      updateProxyPortUI(data.proxyPort);
    }
    if (data.tether) {
      updateTetherWidget(data.tether);
    }
    if (data.systemProxy) {
      updateSystemProxyUI(data.systemProxy.enabled);
    }
  } catch (err) {}

  setupSSE();

  // Poll status every 3 seconds to keep tether and proxy in sync
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.proxyPort) {
        updateProxyPortUI(data.proxyPort);
      }
      if (data.tether) {
        updateTetherWidget(data.tether);
      }
      if (data.systemProxy) {
        updateSystemProxyUI(data.systemProxy.enabled);
      }
    } catch (e) {}
  }, 3000);
}

// Event Listeners
document.getElementById('btnTetherToggle').addEventListener('click', async () => {
  const btn = document.getElementById('btnTetherToggle');
  const isRunning = currentTetherState && (currentTetherState.running || currentTetherState.acquiring || currentTetherState.ip === 'Acquiring IP...');
  const endpoint = isRunning ? '/api/tether/stop' : '/api/tether/start';

  btn.disabled = true;
  btn.textContent = isRunning ? 'Disconnecting...' : 'Connecting...';

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const result = await res.json();
    if (result.error && !result.acquiring) {
      // Re-check status before alerting to avoid false alarms when DHCP completes slightly late
      const checkRes = await fetch('/api/tether/status');
      const checkData = await checkRes.json();
      if (!checkData.running && !checkData.acquiring) {
        alert(`Tethering: ${result.error}`);
      }
    }
  } catch (err) {
    console.error('Tether action failed:', err);
  } finally {
    const statusRes = await fetch('/api/tether/status');
    const tether = await statusRes.json();
    updateTetherWidget(tether);
  }
});

// Logs modal
const logsModal = document.getElementById('logsModal');
document.getElementById('btnTetherLogs').addEventListener('click', async () => {
  logsModal.showModal();
  const pre = document.getElementById('logsContent');
  pre.textContent = 'Loading logs...';
  try {
    const res = await fetch('/api/tether/logs');
    pre.textContent = await res.text();
  } catch (e) {
    pre.textContent = `Error loading logs: ${e.message}`;
  }
});
document.getElementById('btnCloseLogs').addEventListener('click', () => {
  logsModal.close();
});

// Copy Buttons
document.getElementById('btnCopyProxy').addEventListener('click', () => {
  navigator.clipboard.writeText(`127.0.0.1:${currentProxyPort}`);
  const btn = document.getElementById('btnCopyProxy');
  btn.style.color = '#10b981';
  setTimeout(() => { btn.style.color = ''; }, 1500);
});

document.querySelectorAll('.btn-copy-code').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-copy');
    navigator.clipboard.writeText(text);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
});

// System Proxy Toggles
document.getElementById('btnSystemProxyToggle').addEventListener('click', toggleSystemProxy);
const btnBanner = document.getElementById('btnBannerProxyToggle');
if (btnBanner) {
  btnBanner.addEventListener('click', toggleSystemProxy);
}

document.getElementById('btnRefreshInterfaces').addEventListener('click', async () => {
  const res = await fetch('/api/status');
  const data = await res.json();
  updateStats(data);
});

// Start app immediately or upon DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
