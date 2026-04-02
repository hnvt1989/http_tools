#!/bin/bash
# Launch Chrome with proxy pointing to HTTP Tools

PROXY_PORT=${1:-8080}

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --proxy-server="http://localhost:$PROXY_PORT" \
  --ignore-certificate-errors \
  --user-data-dir="/tmp/chrome-proxy-profile" \
  --no-first-run \
  &
