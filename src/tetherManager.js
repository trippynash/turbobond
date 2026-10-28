const { exec, spawn } = require('child_process');
const fs = require('fs');

class TetherManager {
  constructor() {
    this.tetherScript = `${process.env.HOME}/.local/bin/tetherkit-toggle.sh`;
  }

  checkDeviceAttached() {
    return new Promise((resolve) => {
      exec('/opt/homebrew/bin/tetherkit-cli --list 2>/dev/null', (err, stdout) => {
        if (err || !stdout) return resolve({ attached: false });
        const hasDevice = stdout.includes('Bus ');
        let deviceName = 'Android Device (RNDIS)';
        const match = stdout.match(/Bus\s+\d+\s+Device\s+\d+:\s+([a-f0-9:]+)/i);
        if (match) {
          deviceName = `Android RNDIS (${match[1]})`;
        }
        resolve({ attached: hasDevice, deviceName, raw: stdout });
      });
    });
  }

  getStatus() {
    return new Promise(async (resolve) => {
      const device = await this.checkDeviceAttached();
      exec(`bash "${this.tetherScript}" status 2>/dev/null`, (err, stdout) => {
        const out = (stdout || '').trim();
        let running = false;
        let ip = null;

        if (out.startsWith('RUNNING:')) {
          running = true;
          ip = out.substring(8);
        } else if (out === 'ACQUIRING') {
          running = true;
          ip = 'Acquiring IP...';
        }

        resolve({
          deviceAttached: device.attached,
          deviceName: device.deviceName,
          running,
          ip,
          interfaceName: 'feth0'
        });
      });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      const appleScript = `do shell script "${this.tetherScript} start" with administrator privileges`;
      exec(`osascript -e '${appleScript}'`, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        const res = (stdout || '').trim();
        if (res.startsWith('SUCCESS:')) {
          return resolve({ success: true, ip: res.substring(8) });
        }
        if (res === 'NO_DEVICE') {
          return reject(new Error('No Android USB device detected. Please connect phone and enable USB Tethering.'));
        }
        return reject(new Error(`Failed to start tethering: ${res}`));
      });
    });
  }

  stop() {
    return new Promise((resolve, reject) => {
      const appleScript = `do shell script "${this.tetherScript} stop" with administrator privileges`;
      exec(`osascript -e '${appleScript}'`, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        resolve({ success: true });
      });
    });
  }

  getLogs(lines = 25) {
    try {
      const logPath = '/tmp/tetherkit.log';
      if (!fs.existsSync(logPath)) return 'No logs yet.';
      const content = fs.readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch (e) {
      return `Error reading logs: ${e.message}`;
    }
  }
}

module.exports = new TetherManager();
