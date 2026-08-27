"""크롬을 원격 디버깅(CDP)으로 붙잡아 쓰는 부분.

크롬을 새로 띄우지 않고 '개발자 모드로 열려 있는 크롬'에 Playwright 를 연결한다.
로그인은 사람이 직접 창에서 한다 — 이 도구는 아이디/비밀번호를 절대 입력하지 않는다.
전용 프로필(chrome-profile/)을 쓰기 때문에 한 번 로그인해두면 세션이 계속 유지된다.
"""

import os
import re
import subprocess
import time

import requests
from playwright.sync_api import sync_playwright

from .config import cfg

CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
]


def _cdp_alive():
    try:
        requests.get(cfg.cdp_url + "/json/version", timeout=1.5)
        return True
    except Exception:
        return False


def ensure_chrome(log=print):
    """CDP 포트가 안 열려 있으면 전용 프로필로 크롬을 띄운다."""
    if _cdp_alive():
        return False

    exe = next((p for p in CHROME_PATHS if os.path.exists(p)), None)
    if not exe:
        raise RuntimeError(
            "크롬을 찾지 못했습니다. 직접 아래처럼 띄운 뒤 다시 실행해 주세요:\n"
            "  ./chrome.sh"
        )

    cfg.profile_dir.mkdir(parents=True, exist_ok=True)
    log("· 크롬을 개발자 모드(포트 %d)로 실행합니다" % cfg.cdp_port)
    subprocess.Popen(
        [
            exe,
            "--remote-debugging-port=%d" % cfg.cdp_port,
            "--user-data-dir=%s" % cfg.profile_dir,
            "--no-first-run",
            "--no-default-browser-check",
            "https://www.naver.com",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if _cdp_alive():
            return True
        time.sleep(0.5)
    raise RuntimeError("크롬이 %s 에서 응답하지 않습니다." % cfg.cdp_url)


class Chrome:
    """with 문으로 쓰는 CDP 연결 래퍼."""

    def __init__(self, log=print):
        self.log = log
        self._pw = None
        self.browser = None
        self.context = None
        self.page = None

    def __enter__(self):
        ensure_chrome(self.log)
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.connect_over_cdp(cfg.cdp_url)
        if not self.browser.contexts:
            raise RuntimeError("크롬에 열린 창이 없습니다. 창을 하나 열고 다시 실행해 주세요.")
        self.context = self.browser.contexts[0]
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        return self

    def __exit__(self, *exc):
        # 사용자의 크롬은 그대로 둔다. 연결만 끊는다.
        try:
            if self.browser:
                self.browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    # ── 로그인 ─────────────────────────────────────────────

    def is_logged_in(self):
        names = {c["name"] for c in self.context.cookies("https://www.naver.com")}
        return "NID_AUT" in names and "NID_SES" in names

    def ensure_login(self, wait_seconds=300):
        """로그인이 안 돼 있으면 로그인 화면을 띄우고 사람이 끝낼 때까지 기다린다."""
        if self.is_logged_in():
            self.log("· 네이버 로그인 상태 확인됨")
            return True

        self.page.bring_to_front()
        self.page.goto("https://nid.naver.com/nidlogin.login", wait_until="domcontentloaded")
        self.log("")
        self.log("  ┌─────────────────────────────────────────────┐")
        self.log("  │  열린 크롬 창에서 네이버에 직접 로그인해 주세요.  │")
        self.log("  │  (이 도구는 아이디·비밀번호를 대신 입력하지     │")
        self.log("  │   않습니다.) 로그인되면 자동으로 진행됩니다.    │")
        self.log("  └─────────────────────────────────────────────┘")
        self.log("")

        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            if self.is_logged_in():
                self.log("· 로그인 완료")
                return True
            time.sleep(2)
        raise RuntimeError("로그인 대기 시간이 지났습니다. 다시 실행해 주세요.")

    # ── 내 블로그 아이디 ───────────────────────────────────

    def detect_blog_id(self):
        if cfg.blog_id:
            return cfg.blog_id
        for url in ("https://blog.naver.com/MyBlog.naver", "https://blog.naver.com/"):
            try:
                self.page.goto(url, wait_until="domcontentloaded", timeout=20000)
                self.page.wait_for_timeout(800)
            except Exception:
                continue
            m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]{3,})(?:[/?#]|$)", self.page.url)
            if m and m.group(1) not in ("MyBlog.naver", "PostList.naver"):
                self.log("· 내 블로그 아이디 감지: %s" % m.group(1))
                return m.group(1)
        raise RuntimeError(
            "블로그 아이디를 자동으로 찾지 못했습니다. "
            ".env 의 NAVER_BLOG_ID 에 직접 넣어주세요."
        )
