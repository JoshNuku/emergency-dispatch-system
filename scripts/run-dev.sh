#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()

start_service() {
  local name="$1"
  local directory="$2"
  shift 2

  echo "Starting ${name}..."
  (
    cd "${ROOT_DIR}/${directory}" || exit 1
    "$@"
  ) &

  PIDS+=("$!")
}

cleanup() {
  local exit_code=$?

  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo
    echo "Stopping services..."
    kill "${PIDS[@]}" 2>/dev/null || true
    wait "${PIDS[@]}" 2>/dev/null || true
  fi

  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

start_service "auth" "services/auth" go run ./cmd
start_service "incident" "services/incident" go run ./cmd
start_service "dispatch" "services/dispatch" go run ./cmd
start_service "analytics" "services/analytics" go run ./cmd
start_service "realtime-gateway" "services/realtime-gateway" go run ./cmd
# Launch web in a separate terminal window
echo "Starting web (in separate terminal)..."
WEB_DIR="${ROOT_DIR}/web"
if command -v cygpath &>/dev/null; then
  WEB_DIR_WIN=$(cygpath -w "${WEB_DIR}")
  cmd.exe /c start "Emergency Dispatch - Web" /D "${WEB_DIR_WIN}" cmd /k "npm run dev"
elif command -v gnome-terminal &>/dev/null; then
  gnome-terminal --title="Emergency Dispatch - Web" -- bash -c "cd \"${WEB_DIR}\" && npm run dev; read -p 'Press Enter to close...'"
elif command -v open &>/dev/null; then
  osascript -e "tell application \"Terminal\" to do script \"cd '${WEB_DIR}' && npm run dev\""
else
  echo "Warning: Could not detect terminal emulator. Running web in background."
  start_service "web" "web" npm run dev
fi

echo
echo "All services started. Press Ctrl+C to stop them."
wait