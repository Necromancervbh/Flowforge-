#!/bin/sh
# Start FlowForge on Linux (or any Unix): ./flowforge.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "FlowForge needs Node.js 20 or newer. Install it from https://nodejs.org or your package manager." >&2
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
  echo "FlowForge needs Node.js 20 or newer (found $(node --version))." >&2
  exit 1
fi

exec node src/server.js "$@"
