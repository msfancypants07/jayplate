#!/bin/zsh

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "JayPlate needs Node.js 18 or newer. Install Node.js, then run this launcher again."
  read -r '?Press Return to close.'
  exit 1
fi

url='http://127.0.0.1:3000'
if curl -fsS --max-time 2 "$url" 2>/dev/null | /usr/bin/grep -q 'JayPlate'; then
  echo "JayPlate is already running at $url"
  [[ "${JAYPLATE_SKIP_OPEN:-0}" == '1' ]] || open "$url"
  exit 0
fi

echo "Starting JayPlate at $url"
npm start &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null' EXIT INT TERM

for attempt in {1..40}; do
  if curl -fsS --max-time 1 "$url" >/dev/null 2>&1; then
    echo "JayPlate is ready. Keep this Terminal window open while using it."
    [[ "${JAYPLATE_SKIP_OPEN:-0}" == '1' ]] || open "$url"
    wait "$server_pid"
    exit $?
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "JayPlate could not start. Check the message above."
    read -r '?Press Return to close.'
    exit 1
  fi
  sleep 0.25
done

echo "JayPlate did not become ready. Check the message above."
read -r '?Press Return to close.'
exit 1
