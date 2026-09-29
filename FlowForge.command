#!/bin/bash
# Double-click to start FlowForge on macOS.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "FlowForge needs Node.js 20 or newer, and it isn't installed."
  echo "Opening https://nodejs.org so you can install the LTS version..."
  open "https://nodejs.org"
  read -r -p "Press Enter to close this window." _
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
  echo "FlowForge needs Node.js 20 or newer. Please update it from https://nodejs.org"
  open "https://nodejs.org"
  read -r -p "Press Enter to close this window." _
  exit 1
fi

exec node src/server.js "$@"
