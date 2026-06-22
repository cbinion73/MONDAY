#!/bin/zsh
set -euo pipefail

PLIST_SOURCE="/Users/chris/CODE/MONDAY/scripts/com.chris.monday.clap-listener.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.chris.monday.clap-listener.plist"
LABEL="com.chris.monday.clap-listener"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SOURCE" "$PLIST_TARGET"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_TARGET"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed and started $LABEL"
echo "Plist: $PLIST_TARGET"
echo "Log: /tmp/monday-clap-listener.log"
