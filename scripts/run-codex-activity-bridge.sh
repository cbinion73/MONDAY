#!/bin/zsh
set -euo pipefail

token=$(/usr/bin/security find-generic-password -a "$USER" -s "MONDAY Codex Activity Bridge" -w)
exec /usr/bin/python3 "$(cd "$(dirname "$0")" && pwd)/codex_activity_bridge.py" --token "$token"
