#!/bin/zsh
set -euo pipefail

PLIST_TARGET="$HOME/Library/LaunchAgents/com.chris.monday.clap-listener.plist"
LABEL="com.chris.monday.clap-listener"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_TARGET"

echo "Uninstalled $LABEL"
