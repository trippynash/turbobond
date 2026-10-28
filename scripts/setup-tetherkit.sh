#!/usr/bin/env bash

set -e

echo "\033[1;36m===============================================================\033[0m"
echo "\033[1;36m       📱 TurboBond — Android USB TetherKit Setup Assistant    \033[0m"
echo "\033[1;36m===============================================================\033[0m"
echo ""

# 1. Check Homebrew
if ! command -v brew >/dev/null 2>&1; then
    echo "\033[1;31m❌ Homebrew is not installed. Please install Homebrew from https://brew.sh first.\033[0m"
    exit 1
fi

# 2. Check / Install TetherKit CLI
if command -v tetherkit-cli >/dev/null 2>&1; then
    echo "✅ TetherKit CLI is already installed at: $(which tetherkit-cli)"
else
    echo "⚡ Installing TetherKit CLI via Homebrew..."
    brew install XiaoMiku01/tap/tetherkit-cli
    echo "✅ TetherKit CLI installed successfully."
fi

# 3. Create helper script in ~/.local/bin if not present
mkdir -p ~/.local/bin
HELPER="$HOME/.local/bin/tetherkit-toggle.sh"
if [ ! -f "$HELPER" ]; then
    echo "⚡ Setting up tether runner script at $HELPER..."
    cat << 'SUBEOF' > "$HELPER"
#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
ACTION="${1:-status}"

is_running() {
    ps -A -o comm 2>/dev/null | grep -E "(^|/)tetherkit-cli$" >/dev/null 2>&1
}
get_ip() {
    /usr/sbin/ipconfig getifaddr feth0 2>/dev/null || echo ""
}
has_device() {
    /opt/homebrew/bin/tetherkit-cli --list 2>/dev/null | grep -q "Bus "
}

start_tether() {
    if ! has_device; then echo "NO_DEVICE"; exit 2; fi
    local cur_ip=$(get_ip)
    if [ -n "$cur_ip" ] && is_running; then echo "SUCCESS:$cur_ip"; exit 0; fi

    if is_running && ! ifconfig feth0 >/dev/null 2>&1; then
        killall tetherkit-cli 2>/dev/null || true
        sleep 0.5
    fi

    if ! is_running; then
        /opt/homebrew/bin/tetherkit-cli </dev/null >> /tmp/tetherkit.log 2>&1 &
        sleep 0.5
    fi

    local count=0
    while ! ifconfig feth0 >/dev/null 2>&1; do
        sleep 0.5
        count=$((count + 1))
        if ! is_running || [ "$count" -ge 24 ]; then
            echo "FAILED_INTERFACE"
            exit 3
        fi
    done

    /usr/sbin/ipconfig set feth0 DHCP
    local ip=""
    count=0
    while [ -z "$ip" ]; do
        sleep 0.5
        ip=$(get_ip)
        count=$((count + 1))
        if [ "$count" -ge 24 ]; then echo "FAILED_DHCP"; exit 4; fi
    done
    echo "SUCCESS:$ip"
    exit 0
}

stop_tether() {
    killall tetherkit-cli 2>/dev/null || true
    /usr/sbin/ipconfig set feth0 NONE 2>/dev/null || true
    echo "STOPPED"
    exit 0
}

status_tether() {
    if is_running; then
        local ip=$(get_ip)
        if [ -n "$ip" ]; then echo "RUNNING:$ip"; else echo "ACQUIRING"; fi
    else
        echo "STOPPED"
    fi
}

case "$ACTION" in
    start) start_tether ;;
    stop) stop_tether ;;
    status) status_tether ;;
    *) if is_running; then stop_tether; else start_tether; fi ;;
esac
SUBEOF
    chmod +x "$HELPER"
    echo "✅ Helper script created."
fi

# 4. Optional Passwordless Sudo for Zero-Friction Tethering
echo ""
echo "\033[1;33m🔐 Passwordless Sudo Configuration (Optional):\033[0m"
echo "  To allow TurboBond to start and stop USB tethering without asking for a password or Touch ID,"
echo "  we can add a secure rule to /etc/sudoers.d/tetherkit."
echo ""
read -p "Would you like to configure passwordless sudo now? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$USER ALL=(ALL) NOPASSWD: $HELPER" | sudo tee /etc/sudoers.d/tetherkit >/dev/null
    echo "✅ Passwordless sudo configured successfully."
else
    echo "ℹ️ Skipped. You will be prompted for Touch ID / admin password when starting tethering."
fi

echo ""
echo "\033[1;32m🎉 Setup complete! You can now start TurboBond with: npm start\033[0m"
