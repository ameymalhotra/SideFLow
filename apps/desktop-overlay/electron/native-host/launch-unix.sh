#!/bin/sh
# Chrome Native Messaging host launcher (macOS / Linux).
#
# Chrome (and Edge/Brave/Arc/etc) spawn Native Messaging hosts with a
# minimal PATH like `/usr/bin:/bin:/usr/sbin:/sbin`. That excludes
# Homebrew (/opt/homebrew/bin on Apple Silicon, /usr/local/bin on Intel),
# nvm, fnm, volta, and asdf, so a bare `#!/usr/bin/env node` shebang on
# the host script fails with exit 127 and the extension can never connect.
#
# This wrapper prepends the common Node install locations to PATH, then
# resolves `node` and execs the real host script.

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

NVM_BIN=""
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -n 1)"
  if [ -n "$LATEST_NVM" ]; then
    NVM_BIN="$HOME/.nvm/versions/node/$LATEST_NVM/bin"
  fi
fi

FNM_BIN=""
if [ -d "$HOME/.local/state/fnm_multishells" ]; then
  FNM_BIN="$HOME/.fnm/aliases/default/bin"
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.volta/bin:$HOME/.asdf/shims:$NVM_BIN:$FNM_BIN:$PATH"

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  echo "SideFlow native host: could not locate 'node' on PATH ($PATH)" >&2
  exit 127
fi

exec "$NODE_BIN" "$DIR/sideflow-native-host.js" "$@"
