# ⚡ TurboBond

> **High-Performance Multi-Link Bandwidth Aggregator and USB Tethering Manager for macOS.**  
> Combine Wi-Fi, Android USB, iPhone USB, Ethernet LAN, Bluetooth, and secondary Wi-Fi dongles into a single, blazing-fast multi-path internet connection.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon%20%26%20Intel)-black.svg)]()
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)]()

---

## 🚀 Overview

macOS defaults to a strict single-gateway priority: even if you have Wi-Fi, Ethernet, and two phones connected via USB, your Mac will only route through **one** connection, leaving all other bandwidth idle.

**TurboBond** changes that. It creates a high-throughput, low-latency Multi-WAN socket dispatcher that pools all active network interfaces and distributes incoming requests in real time.

Additionally, macOS does not support Android USB tethering out of the box because it lacks an RNDIS kernel driver. **TurboBond has built-in Android USB Tethering automation** powered by TetherKit, enabling **one-click connect/disconnect** with zero terminal hassle.

```
                                  ┌──► [1] Wi-Fi (en0) ──────────────► 100 Mbps ──┐
                                  │                                               │
                                  ├──► [2] Android USB (feth0) ──────►  60 Mbps ──┤
[Your Apps / Browser]             │                                               ├──► Combined Throughput
(Chrome, NeatDownloadManager) ───┼──► TurboBond Dispatcher (8080) ───►  60 Mbps ──┤    (320+ Mbps!)
                                  │                                               │
                                  ├──► [3] iPhone USB (en3) ─────────► 100 Mbps ──┤
                                  │                                               │
                                  └──► [4] Ethernet LAN (en1) ───────►   ...     ──┘
```

---

## ✨ Features

* **⚡ Multi-WAN Socket Aggregator**: Pools multiple internet connections (Wi-Fi, Android USB, iPhone USB, Ethernet, Bluetooth PAN) into a local proxy on `127.0.0.1:8080`.
* **📱 Built-In Android USB Tethering**: One-click enable/disable for Android RNDIS USB tethering with automated `feth0` interface creation and DHCP negotiation.
* **📊 Modern Real-Time Dashboard**: High-tech web dashboard (`http://localhost:9999`) with live bandwidth meters, upload/download speedometers, and per-adapter sparkline graphs.
* **🔄 Zero-Drop Hotplugging**: Plug or unplug phones or cables at any time. TurboBond detects interface changes every second and dynamically updates its routing pool without interrupting active traffic.
* **📈 2x–5x Speed Multiplier**:
  * **NeatDownloadManager**: Slices downloads into 16–32 parallel streams distributed across all connections, finishing downloads in a fraction of the time.
  * **YouTube & 4K/8K Video Streaming**: DASH video chunks (2–5s segments) are downloaded concurrently from different interfaces, buffering streams instantly.
  * **Dev Workflows**: Parallel `npm install`, `bun`, `git clone`, and Docker pulls automatically utilize all active pipes.
* **🪶 Ultra-Lightweight & Zero Heavy Dependencies**: Runs directly on Node.js using native POSIX socket binding (`localAddress`).

---

## 🌐 Supported Connections

| Connection Type | Interface | macOS Compatibility | Notes |
| :--- | :--- | :--- | :--- |
| **Built-in Wi-Fi** | `en0` | Native | Connects to primary router |
| **Android USB Tethering** | `feth0` | Automated via TurboBond | Uses user-space RNDIS driver (TetherKit) |
| **iPhone USB Tethering** | `en3` / `en4` | Native | Plug-and-play via Apple Personal Hotspot |
| **USB-C / Thunderbolt LAN** | `en1` / `en2` | Native | Any standard USB-C to Gigabit Ethernet hub |
| **Bluetooth Tethering (PAN)** | `en*` | Native | Turn on Bluetooth tethering on phone & pair |
| **Secondary USB Wi-Fi** | `en5+` | Native | Plug in any cheap USB Wi-Fi dongle for Dual Wi-Fi |

---

## 📦 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/your-username/turbobond.git
cd turbobond
npm install
```

### 2. Setup Android USB Tethering (One-Time)
Run the automated assistant to install TetherKit and configure optional passwordless execution:
```bash
npm run setup:tether
```

### 3. Start TurboBond & Dashboard
```bash
npm start
```
This starts the Multi-WAN Proxy on `127.0.0.1:8080` and automatically opens the Web Dashboard at **`http://localhost:9999`**.

---

## 🛠️ How to Connect Your Apps

### 1. NeatDownloadManager (Maximum Download Acceleration)
1. Open **NeatDownloadManager**.
2. Click **Settings** (Gear icon) > **Network Proxy**.
3. Check **Use Proxy** > Set Host: `127.0.0.1`, Port: `8080`.
4. *Result*: Every segmented download part is pulled across your connected phones and Wi-Fi simultaneously!

### 2. Google Chrome / Brave (Multi-WAN Streaming)
Launch Chrome using the proxy flag:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --proxy-server="127.0.0.1:8080"
```
Or toggle the **System Proxy** button directly inside the TurboBond Web Dashboard!

### 3. Terminal & Dev Tools (git, npm, curl)
In any terminal session:
```bash
export ALL_PROXY=http://127.0.0.1:8080
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080
```

---

## 🖥️ Web Dashboard Preview

The built-in web dashboard at `http://localhost:9999` provides:
* **Combined Real-Time Speed**: Total Download & Upload throughput in MB/s.
* **Per-Adapter Cards**: Live speeds, total data transferred, IP address, and 30-second live SVG sparkline graphs for each connected phone/adapter.
* **Android USB Control**: Real-time RNDIS device detection with a 1-click **Start / Disconnect** toggle and live logs viewer.
* **Live Stream Log**: Rolling visual feed showing which domains are being dispatched to which phone.

---

## 📁 Project Architecture

```
turbobond/
├── bin/
│   └── turbobond.js           # CLI entry point
├── src/
│   ├── index.js               # Service orchestrator
│   ├── interfaceManager.js    # Interface discovery & netstat bandwidth polling
│   ├── proxyServer.js         # HTTP & HTTPS CONNECT Multi-WAN Proxy
│   ├── tetherManager.js       # Android RNDIS TetherKit controller
│   └── dashboard/
│       ├── index.html         # Modern dark-mode dashboard
│       ├── style.css          # Glassmorphic responsive styling
│       └── app.js             # Server-Sent Events client & charts
├── scripts/
│   └── setup-tetherkit.sh     # Installation & sudoers assistant
├── package.json
├── LICENSE                    # MIT License
└── README.md
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check [issues page](https://github.com/your-username/turbobond/issues).

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
