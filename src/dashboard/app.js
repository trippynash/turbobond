// TurboBond Real-Time Client Application
let currentTetherState = null;
let systemProxyEnabled = false;

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

  if (tether.running) {
    badge.className = 'badge success';
    badge.textContent = 'Connected';
    deviceEl.textContent = tether.deviceName || 'Android Connected';
    ipEl.textContent = `IP: ${tether.ip || 'feth0 active'}`;
    btn.textContent = 'Disconnect Tethering';
    btn.className = 'btn-secondary';
    btn.disabled = false;
  } else if (tether.deviceAttached) {
    badge.className = 'badge warning';
    badge.textContent = 'Device Ready';
    deviceEl.textContent = tether.deviceName || 'Android Attached';
    ipEl.textContent = 'Ready to launch';
    btn.textContent = '⚡ Start Tethering';
    btn.className = 'btn-primary';
    btn.disabled = false;
  } else {
    badge.className = 'badge danger';
    badge.textContent = 'No Device';
    deviceEl.textContent = 'No USB Tethering device detected';
    ipEl.textContent = 'Connect phone via USB';
    btn.textContent = 'Start Tethering';
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

// Initial bootstrap
async function bootstrap() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateStats(data);
    if (data.tether) {
      updateTetherWidget(data.tether);
    }
  } catch (err) {}

  setupSSE();

  // Poll tether status every 3 seconds
  setInterval(async () => {
    try {
      const res = await fetch('/api/tether/status');
      const tether = await res.json();
      updateTetherWidget(tether);
    } catch (e) {}
  }, 3000);
}

// Event Listeners
document.getElementById('btnTetherToggle').addEventListener('click', async () => {
  const btn = document.getElementById('btnTetherToggle');
  const isRunning = currentTetherState && currentTetherState.running;
  const endpoint = isRunning ? '/api/tether/stop' : '/api/tether/start';

  btn.disabled = true;
  btn.textContent = isRunning ? 'Disconnecting...' : 'Connecting...';

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const result = await res.json();
    if (result.error) {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Failed: ${err.message}`);
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
  navigator.clipboard.writeText('127.0.0.1:8080');
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

// System Proxy Toggle
document.getElementById('btnSystemProxyToggle').addEventListener('click', async () => {
  const endpoint = systemProxyEnabled ? '/api/system-proxy/disable' : '/api/system-proxy/enable';
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    systemProxyEnabled = data.enabled;
    document.getElementById('systemProxyLabel').textContent = `System Proxy: ${systemProxyEnabled ? 'ON' : 'Off'}`;
    document.getElementById('btnSystemProxyToggle').style.borderColor = systemProxyEnabled ? '#10b981' : '';
  } catch (err) {
    alert(`Failed to toggle system proxy: ${err.message}`);
  }
});

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
