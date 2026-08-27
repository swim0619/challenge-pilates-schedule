#!/bin/sh
# 네이버 자동화 전용 크롬을 개발자(원격 디버깅) 모드로 띄운다.
# 평소 쓰는 크롬 프로필과 완전히 분리된 chrome-profile/ 을 쓰므로
# 기존 브라우저 세션에는 아무 영향이 없다.
cd "$(dirname "$0")" || exit 1
PORT="${CHROME_CDP_PORT:-9222}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
mkdir -p chrome-profile
exec "$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PWD/chrome-profile" \
  --no-first-run --no-default-browser-check \
  https://www.naver.com
