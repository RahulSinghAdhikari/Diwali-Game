#!/usr/bin/env bash
# Diwali Dhamaka — one-command launcher for macOS and Linux.
#   ./start.sh            (or double-click it on macOS)
# Serves this folder and opens the game in your browser.

cd "$(dirname "$0")" || exit 1
PORT="${1:-8080}"
URL="http://localhost:$PORT"

pick() { command -v "$1" >/dev/null 2>&1; }

if   pick python3; then SERVE=(python3 tools/dev-server.py "$PORT")
elif pick python;  then SERVE=(python  tools/dev-server.py "$PORT")
elif pick npx;     then SERVE=(npx --yes serve --listen "$PORT" .)
else
  echo
  echo "  Diwali Dhamaka needs Python or Node.js to serve the files."
  echo "  Install either one, or just open play-offline.html — it needs nothing."
  echo
  exit 1
fi

echo
echo "  🪔  Diwali Dhamaka — The Festival Quest"
echo "      $URL"
echo "      (press Ctrl+C to stop)"
echo

# Open a browser once the port is actually up.
(
  for _ in $(seq 1 40); do
    if (command -v curl >/dev/null && curl -sf -o /dev/null "$URL") ||
       (command -v wget >/dev/null && wget -q -O /dev/null "$URL"); then
      break
    fi
    sleep 0.25
  done
  if   pick open;      then open "$URL"
  elif pick xdg-open;  then xdg-open "$URL" >/dev/null 2>&1
  fi
) &

exec "${SERVE[@]}"
