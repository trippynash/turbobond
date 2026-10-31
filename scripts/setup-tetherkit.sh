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
    pgrep -f tetherkit-cli >/dev/null 2>&1
}
has_device() {
    /opt/homebrew/bin/tetherkit-cli --list 2>/dev/null | grep -q "Bus "
}
get_active_iface() {
    for dev in $(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep '^feth' | sort -V); do
        local test_ip=$(/usr/sbin/ipconfig getifaddr "$dev" 2>/dev/null || echo "")
        if [ -n "$test_ip" ] && [[ ! "$test_ip" =~ ^169\.254\. ]]; then
            echo "$dev"
            return 0
        fi
    done
    if [ -f /tmp/tetherkit.log ]; then
        local log_dev=$(grep -oE "==== interface ready: (feth[0-9]+) ====" /tmp/tetherkit.log 2>/dev/null | tail -n 1 | awk '{print $4}')
        if [ -n "$log_dev" ] && ifconfig "$log_dev" >/dev/null 2>&1; then
            echo "$log_dev"
            return 0
        fi
    fi
    local fallback=$(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep -E '^feth[0-9]+' | sort -V | tail -n 2 | head -n 1)
    if [ -n "$fallback" ]; then
        echo "$fallback"
        return 0
    fi
    echo "feth0"
}
get_ip() {
    for dev in $(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep '^feth' | sort -V); do
        local ip=$(/usr/sbin/ipconfig getifaddr "$dev" 2>/dev/null || echo "")
        if [ -n "$ip" ] && [[ ! "$ip" =~ ^169\.254\. ]]; then
            echo "$ip"
            return 0
        fi
    done
    echo ""
}

start_tether() {
    if ! has_device; then echo "NO_DEVICE"; exit 2; fi
    local cur_ip=$(get_ip)
    if [ -n "$cur_ip" ] && is_running; then echo "SUCCESS:$cur_ip"; exit 0; fi

    if is_running && [ -z "$cur_ip" ]; then
        pkill -9 -f tetherkit-cli 2>/dev/null || true
        killall -9 tetherkit-cli 2>/dev/null || true
        sleep 0.5
    fi

    if ! is_running; then
        for dev in $(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep '^feth'); do
            ifconfig "$dev" destroy 2>/dev/null || true
        done
        /opt/homebrew/bin/tetherkit-cli </dev/null >> /tmp/tetherkit.log 2>&1 &
        sleep 0.8
    fi

    local iface=""
    local count=0
    while [ -z "$iface" ]; do
        sleep 0.5
        count=$((count + 1))
        if ! is_running; then
            echo "FAILED_INTERFACE: Process exited"
            exit 3
        fi
        local log_dev=$(grep -oE "==== interface ready: (feth[0-9]+) ====" /tmp/tetherkit.log 2>/dev/null | tail -n 1 | awk '{print $4}')
        if [ -n "$log_dev" ] && ifconfig "$log_dev" >/dev/null 2>&1; then
            iface="$log_dev"
            break
        fi
        for dev in $(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep '^feth'); do
            if ifconfig "$dev" >/dev/null 2>&1; then
                iface="$dev"
                break
            fi
        done
        if [ "$count" -ge 30 ]; then
            echo "FAILED_INTERFACE: Timeout waiting for interface"
            exit 3
        fi
    done

    /usr/sbin/ipconfig set "$iface" DHCP
    local ip=""
    count=0
    while [ -z "$ip" ]; do
        sleep 0.5
        ip=$(get_ip)
        count=$((count + 1))
        if [ "$count" -ge 70 ]; then
            if is_running; then
                echo "ACQUIRING"
                exit 0
            else
                echo "FAILED_DHCP"
                exit 4
            fi
        fi
    done
    echo "SUCCESS:$ip"
    exit 0
}

stop_tether() {
    pkill -9 -f tetherkit-cli 2>/dev/null || true
    killall -9 tetherkit-cli 2>/dev/null || true
    for dev in $(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep '^feth'); do
        /usr/sbin/ipconfig set "$dev" NONE 2>/dev/null || true
        ifconfig "$dev" down 2>/dev/null || true
        ifconfig "$dev" destroy 2>/dev/null || true
    done
    echo "STOPPED"
    exit 0
}

status_tether() {
    if is_running; then
        local ip=$(get_ip)
        if [ -n "$ip" ]; then
            echo "RUNNING:$ip"
        else
            echo "ACQUIRING"
        fi
    else
        echo "STOPPED"
    fi
}

case "$ACTION" in
    start) start_tether ;;
    stop) stop_tether ;;
    status) status_tether ;;
    *) if is_running && [ -n "$(get_ip)" ]; then stop_tether; else start_tether; fi ;;
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
