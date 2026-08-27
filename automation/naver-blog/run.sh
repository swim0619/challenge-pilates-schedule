#!/bin/sh
# 가상환경 파이썬으로 nblog 실행
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "가상환경이 없습니다. 먼저 아래를 실행하세요:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
exec .venv/bin/python -W ignore -m nblog.cli "$@"
