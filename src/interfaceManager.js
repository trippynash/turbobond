const os = require('os');
const { exec, execSync } = require('child_process');
const EventEmitter = require('events');

class InterfaceManager extends EventEmitter {
  constructor() {
    super();
    this.hardwareMap = {};
    this.interfaces = [];
    this.currentIndex = 0;
    this.prevStats = {};
    this.rates = {}; // { ifaceName: { downBps, upBps, totalDown, totalUp, history: [] } }
    this.pollInterval = null;

    this.refreshHardwareMap();
    this.scanInterfaces();
  }

  refreshHardwareMap() {
    try {
      const output = execSync('networksetup -listallhardwareports', { encoding: 'utf-8' });
      const blocks = output.split('\n\n');
      for (const block of blocks) {
        const portMatch = block.match(/Hardware Port:\s*(.+)/);
        const devMatch = block.match(/Device:\s*([a-zA-Z0-9]+)/);
        if (portMatch && devMatch) {
          this.hardwareMap[devMatch[1].trim()] = portMatch[1].trim();
        }
      }
    } catch (err) {
      // fallback
    }
  }

  getFriendlyType(name) {
    if (name.startsWith('feth')) {
      return { type: 'android', label: 'Android USB Tethering', icon: '📱' };
    }
    const hw = this.hardwareMap[name] || '';
    if (hw.toLowerCase().includes('wi-fi')) {
      return { type: 'wifi', label: hw || 'Wi-Fi', icon: '📶' };
    }
    if (hw.toLowerCase().includes('iphone')) {
      return { type: 'iphone', label: 'iPhone USB Tethering', icon: '🍏' };
    }
    if (hw.toLowerCase().includes('ethernet')) {
      return { type: 'ethernet', label: hw || 'Ethernet LAN', icon: '🔌' };
    }
    if (hw.toLowerCase().includes('bluetooth')) {
      return { type: 'bluetooth', label: 'Bluetooth Tethering', icon: '🔵' };
    }
    if (hw.toLowerCase().includes('thunderbolt')) {
      return { type: 'thunderbolt', label: hw, icon: '⚡' };
    }
    return { type: 'network', label: hw || name, icon: '🌐' };
  }

  scanInterfaces() {
    const osIfaces = os.networkInterfaces();
    const active = [];

    for (const [name, addrs] of Object.entries(osIfaces)) {
      if (name.startsWith('lo') || name.startsWith('utun') || name.startsWith('awdl') || name.startsWith('llw')) {
        continue;
      }
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal && a.address && !a.address.startsWith('127.')) {
          const info = this.getFriendlyType(name);
          active.push({
            name,
            address: a.address,
            netmask: a.netmask,
            mac: a.mac,
            type: info.type,
            label: info.label,
            icon: info.icon,
            requestCount: 0
          });
        }
      }
    }

    const changed = JSON.stringify(active.map(i => i.name + i.address)) !==
                    JSON.stringify(this.interfaces.map(i => i.name + i.address));

    this.interfaces = active;
    if (changed) {
      this.emit('interfacesChanged', this.interfaces);
    }
  }

  startPolling(intervalMs = 1000) {
    if (this.pollInterval) return;
    this.pollBandwidth();
    this.pollInterval = setInterval(() => {
      this.scanInterfaces();
      this.pollBandwidth();
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  pollBandwidth() {
    exec('netstat -ib -n', { encoding: 'utf-8' }, (err, stdout) => {
      if (err || !stdout) return;

      const lines = stdout.trim().split('\n');
      const now = Date.now();
      const currentStats = {};

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 10) {
          const name = parts[0].replace('*', '');
          const ibytes = parseInt(parts[6], 10);
          const obytes = parseInt(parts[9], 10);

          if (!isNaN(ibytes) && !isNaN(obytes)) {
            // Keep largest if multiple lines for same interface
            if (!currentStats[name] || ibytes > currentStats[name].ibytes) {
              currentStats[name] = { ibytes, obytes, time: now };
            }
          }
        }
      }

      for (const iface of this.interfaces) {
        const name = iface.name;
        const cur = currentStats[name];
        const prev = this.prevStats[name];

        if (!this.rates[name]) {
          this.rates[name] = {
            downBps: 0,
            upBps: 0,
            totalDown: 0,
            totalUp: 0,
            history: []
          };
        }

        if (cur && prev) {
          const timeDiff = (cur.time - prev.time) / 1000;
          if (timeDiff > 0) {
            const downDelta = Math.max(0, cur.ibytes - prev.ibytes);
            const upDelta = Math.max(0, cur.obytes - prev.obytes);

            const downBps = downDelta / timeDiff;
            const upBps = upDelta / timeDiff;

            this.rates[name].downBps = downBps;
            this.rates[name].upBps = upBps;
            this.rates[name].totalDown = cur.ibytes;
            this.rates[name].totalUp = cur.obytes;

            // Maintain last 20 sparkline points
            const history = this.rates[name].history;
            history.push({
              time: now,
              down: Math.round(downBps),
              up: Math.round(upBps)
            });
            if (history.length > 20) history.shift();
          }
        }
      }

      this.prevStats = currentStats;
      this.emit('statsUpdated', this.getSnapshot());
    });
  }

  getNextInterface() {
    if (this.interfaces.length === 0) return null;
    const iface = this.interfaces[this.currentIndex % this.interfaces.length];
    this.currentIndex++;
    iface.requestCount = (iface.requestCount || 0) + 1;
    return iface;
  }

  getSnapshot() {
    let totalDownBps = 0;
    let totalUpBps = 0;

    const list = this.interfaces.map(iface => {
      const rate = this.rates[iface.name] || { downBps: 0, upBps: 0, totalDown: 0, totalUp: 0, history: [] };
      totalDownBps += rate.downBps;
      totalUpBps += rate.upBps;

      return {
        ...iface,
        downBps: Math.round(rate.downBps),
        upBps: Math.round(rate.upBps),
        totalDown: rate.totalDown,
        totalUp: rate.totalUp,
        history: rate.history
      };
    });

    return {
      timestamp: Date.now(),
      totalDownBps: Math.round(totalDownBps),
      totalUpBps: Math.round(totalUpBps),
      interfaces: list
    };
  }
}

module.exports = new InterfaceManager();
