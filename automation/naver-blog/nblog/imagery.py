"""글에 어울리는 사진 찾아서 내려받기.

우선순위 (auto)
  1) images/ 폴더에 넣어둔 우리 스튜디오 사진
  2) Pexels 무료 스톡 (PEXELS_API_KEY 있을 때)
  3) 위키미디어 공용 (키 불필요, CC 라이선스 — 출처를 캡션에 남긴다)
"""

import re

import requests

from .config import cfg

UA = "challenge-pilates-blog-bot/1.0 (studio blog draft tool)"
IMG_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _download(url, dest_dir, index, headers=None):
    r = requests.get(url, headers=headers or {"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    ext = IMG_EXT.get(r.headers.get("Content-Type", "").split(";")[0].strip(), ".jpg")
    path = dest_dir / ("%02d%s" % (index, ext))
    path.write_bytes(r.content)
    return path


# ── 소스별 검색 ─────────────────────────────────────────────────────


def _from_pexels(query, dest_dir, index):
    r = requests.get(
        "https://api.pexels.com/v1/search",
        headers={"Authorization": cfg.pexels_key, "User-Agent": UA},
        params={"query": query, "per_page": 1, "orientation": "landscape"},
        timeout=20,
    )
    r.raise_for_status()
    photos = r.json().get("photos") or []
    if not photos:
        return None
    photo = photos[0]
    src = photo["src"].get("large2x") or photo["src"].get("large")
    path = _download(src, dest_dir, index)
    return path, "사진: %s / Pexels" % photo.get("photographer", "Pexels")


_ARTIST_RE = re.compile(r"<[^>]+>")


def _from_wikimedia(query, dest_dir, index):
    r = requests.get(
        "https://commons.wikimedia.org/w/api.php",
        headers={"User-Agent": UA},
        params={
            "action": "query",
            "generator": "search",
            "gsrsearch": "filetype:bitmap %s" % query,
            "gsrlimit": 5,
            "gsrnamespace": 6,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 1280,
            "format": "json",
        },
        timeout=20,
    )
    r.raise_for_status()
    pages = (r.json().get("query") or {}).get("pages") or {}
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        meta = info.get("extmetadata") or {}
        artist = _ARTIST_RE.sub("", (meta.get("Artist") or {}).get("value", "")).strip()
        license_name = (meta.get("LicenseShortName") or {}).get("value", "CC")
        try:
            path = _download(url, dest_dir, index)
        except Exception:
            continue
        credit = "사진: %s / Wikimedia Commons (%s)" % (artist or "Unknown", license_name)
        return path, credit
    return None


def _my_photos():
    if not cfg.my_images_dir.exists():
        return []
    return sorted(
        p
        for p in cfg.my_images_dir.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.is_file()
    )


# ── 진입점 ──────────────────────────────────────────────────────────


def attach_images(post, dest_dir, source="auto", log=print):
    """post 안의 image 블록에 실제 파일 경로를 채워 넣는다."""
    blocks = [b for b in post.blocks if b.type == "image"]
    if not blocks:
        return post

    dest_dir.mkdir(parents=True, exist_ok=True)
    mine = _my_photos() if source in ("auto", "local") else []
    if mine:
        log("· images/ 폴더 사진 %d장 사용" % len(mine))

    for i, block in enumerate(blocks, start=1):
        query = block.query or post.topic

        if mine:
            picked = mine[(i - 1) % len(mine)]
            block.path = str(picked)
            block.credit = ""
            log("  · %d. 내 사진 %s" % (i, picked.name))
            continue

        got = None
        if source in ("auto", "pexels") and cfg.pexels_key:
            try:
                got = _from_pexels(query, dest_dir, i)
            except Exception as exc:
                log("  · Pexels 실패(%s): %s" % (query, exc))
        if got is None and source in ("auto", "wikimedia"):
            try:
                got = _from_wikimedia(query, dest_dir, i)
            except Exception as exc:
                log("  · 위키미디어 실패(%s): %s" % (query, exc))

        if got is None:
            log("  · %d. '%s' 사진을 못 찾았습니다 — 이 자리는 비워둡니다" % (i, query))
            continue

        block.path, block.credit = str(got[0]), got[1]
        log("  · %d. %s ← %s" % (i, query, block.credit))

    # 사진을 못 구한 블록은 글에서 빼버린다
    post.blocks = [b for b in post.blocks if b.type != "image" or b.path]
    return post

