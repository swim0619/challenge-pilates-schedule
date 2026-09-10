"""환경설정 로딩 — .env 파일 하나에서 모든 키를 읽는다."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env")


def _get(name, default=""):
    return (os.environ.get(name) or default).strip()


class Config:
    anthropic_key = _get("ANTHROPIC_API_KEY")
    model = _get("CLAUDE_MODEL", "claude-opus-5")

    blog_id = _get("NAVER_BLOG_ID")
    cdp_port = int(_get("CHROME_CDP_PORT", "9222"))

    naver_client_id = _get("NAVER_CLIENT_ID")
    naver_client_secret = _get("NAVER_CLIENT_SECRET")

    pexels_key = _get("PEXELS_API_KEY")

    supabase_url = _get("SUPABASE_URL")
    supabase_key = _get("SUPABASE_ANON_KEY")

    root = ROOT
    out_dir = ROOT / "out"
    my_images_dir = ROOT / "images"
    profile_dir = ROOT / "chrome-profile"

    @property
    def cdp_url(self):
        return "http://127.0.0.1:%d" % self.cdp_port

    @property
    def has_naver_api(self):
        return bool(self.naver_client_id and self.naver_client_secret)

    @property
    def has_supabase(self):
        return bool(self.supabase_url and self.supabase_key)


cfg = Config()
