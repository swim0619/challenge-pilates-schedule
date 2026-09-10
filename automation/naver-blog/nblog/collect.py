"""글감 수집 — 네이버에서 주제 관련 글을 모아 온다.

두 가지 경로가 있고, 쓸 수 있는 쪽을 자동으로 고른다.
  1) 네이버 검색 오픈 API  (.env 에 NAVER_CLIENT_ID/SECRET 이 있을 때)
  2) 크롬으로 검색결과 페이지를 직접 읽기 (키가 없을 때)
어느 쪽이든 결과는 Source 리스트로 통일된다.
"""

import re
import time
import urllib.parse

import requests

from .config import cfg
from .models import Source

_POST_URL_RE = re.compile(r"blog\.naver\.com/([^/?#]+)/(\d+)")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)
_BR_RE = re.compile(r"<(br|/p|/div|/h\d)[^>]*>", re.I)
_WS_RE = re.compile(r"[ \t\r\f\v]+")
_NL_RE = re.compile(r"\n{3,}")


def html_to_text(html):
    html = _SCRIPT_RE.sub(" ", html)
    html = _BR_RE.sub("\n", html)
    text = _TAG_RE.sub(" ", html)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = _WS_RE.sub(" ", text)
    text = _NL_RE.sub("\n\n", text)
    return "\n".join(line.strip() for line in text.split("\n")).strip()


# ── 1. 오픈 API 경로 ────────────────────────────────────────────────

_API_KINDS = [
    ("blog", "naver_blog"),
    ("news", "naver_news"),
    ("kin", "naver_kin"),
    ("encyc", "naver_encyc"),
]


def collect_via_api(topic, count=8, log=print):
    headers = {
        "X-Naver-Client-Id": cfg.naver_client_id,
        "X-Naver-Client-Secret": cfg.naver_client_secret,
    }
    per_kind = max(2, count // 2)
    sources = []
    for kind, origin in _API_KINDS:
        if len(sources) >= count * 2:
            break
        url = "https://openapi.naver.com/v1/search/%s.json" % kind
        try:
            r = requests.get(
                url,
                headers=headers,
                params={"query": topic, "display": per_kind, "sort": "sim"},
                timeout=15,
            )
            r.raise_for_status()
        except Exception as exc:  # 한 종류가 막혀도 나머지는 계속
            log("  · %s 검색 실패: %s" % (kind, exc))
            continue
        items = r.json().get("items", [])
        for item in items:
            sources.append(
                Source(
                    title=html_to_text(item.get("title", "")),
                    url=item.get("link", ""),
                    snippet=html_to_text(item.get("description", "")),
                    origin=origin,
                )
            )
        log("  · %s %d건" % (kind, len(items)))
    return sources[: count * 2]


# ── 2. 크롬으로 검색결과 읽기 ────────────────────────────────────────

_SEARCH_TABS = [
    ("https://search.naver.com/search.naver?ssc=tab.blog.all&query=%s", "naver_blog"),
    ("https://search.naver.com/search.naver?where=news&query=%s", "naver_news"),
]

# 검색결과에서 걸러낼 잡링크 (더보기/카테고리/프로필 등)
_JUNK = re.compile(
    r"(PostList|CategoryList|prologue|guestbook|BlogHome|더보기|블로그 홈)", re.I
)
# 링크 텍스트가 이런 안내문뿐이면 글이 아니라 부가 링크다
_JUNK_TITLE = re.compile(
    r"^(네이버뉴스|관련뉴스|언론사|더보기|블로그|카페|이웃추가|구독하기|공유하기)$"
)

_SCRAPE_JS = """
() => {
  const seen = new Set();
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href || '';
    if (!/blog\\.naver\\.com|n\\.news\\.naver\\.com|post\\.naver\\.com/.test(href)) continue;
    const title = (a.innerText || '').trim();
    if (title.length < 8) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    // 같은 결과 카드 안의 설명문을 함께 집어온다
    let box = a, snippet = '';
    for (let i = 0; i < 5 && box; i++) {
      box = box.parentElement;
      if (!box) break;
      const t = (box.innerText || '').trim();
      if (t.length > title.length + 40) { snippet = t; break; }
    }
    out.push({ title, href, snippet: snippet.slice(0, 600) });
  }
  return out.slice(0, 40);
}
"""


def collect_via_web(page, topic, count=8, log=print):
    """CDP 로 붙은 크롬 탭에서 네이버 검색결과를 긁어온다."""
    sources = []
    q = urllib.parse.quote(topic)
    for tmpl, origin in _SEARCH_TABS:
        try:
            page.goto(tmpl % q, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1200)
            rows = page.evaluate(_SCRAPE_JS)
        except Exception as exc:
            log("  · %s 검색 실패: %s" % (origin, exc))
            continue
        picked = 0
        for row in rows:
            title = row["title"].split("\n")[0].strip()
            if _JUNK.search(row["href"]) or _JUNK.search(title):
                continue
            if _JUNK_TITLE.match(title) or len(title) < 10:
                continue
            # 블로그는 글 번호가 있는 '글' 링크만 (블로그 대문/프로필 링크 제외)
            if origin == "naver_blog" and not _POST_URL_RE.search(row["href"]):
                continue
            sources.append(
                Source(
                    title=title[:120],
                    url=row["href"],
                    snippet=row["snippet"],
                    origin=origin,
                )
            )
            picked += 1
            if picked >= count:
                break
        log("  · %s %d건" % (origin, picked))
    return sources


# ── 본문 읽어오기 ───────────────────────────────────────────────────

# 스마트에디터 ONE 본문은 문단마다 se-text-paragraph 클래스를 달고 있다.
_PARA_RE = re.compile(
    r"<(p|div)[^>]*class=\"[^\"]*se-text-paragraph[^\"]*\"[^>]*>(.*?)</\1>", re.S | re.I
)
# 구버전 에디터
_VIEWAREA_RE = re.compile(r"<div[^>]+id=\"postViewArea\"(.*)", re.S | re.I)
# 본문 뒤에 붙는 공감/댓글/이웃 영역은 잘라낸다
_TAIL_RE = re.compile(r"(공감한 사람 보기|댓글 쓰기|이 블로그의 인기글|관련 글|구독하기)")


def extract_post_body(html):
    """블로그 글 HTML 에서 진짜 본문만 뽑아낸다."""
    paras = [html_to_text(m.group(2)) for m in _PARA_RE.finditer(html)]
    paras = [t for t in paras if t]
    if sum(len(t) for t in paras) >= 200:
        return "\n".join(paras)

    m = _VIEWAREA_RE.search(html)
    text = html_to_text(m.group(1) if m else html)
    cut = _TAIL_RE.search(text)
    return text[: cut.start()] if cut else text


def _postview_url(url):
    """blog.naver.com/{id}/{logNo} → iframe 안쪽 실제 본문 주소."""
    m = _POST_URL_RE.search(url)
    if not m:
        return None
    return "https://blog.naver.com/PostView.naver?blogId=%s&logNo=%s" % m.groups()


def fetch_bodies(sources, limit=6, log=print):
    """상위 몇 건은 본문까지 받아온다. 실패해도 snippet 으로 굴러간다."""
    done = 0
    for src in sources:
        if done >= limit:
            break
        target = _postview_url(src.url) or (
            src.url if "news.naver.com" in src.url else None
        )
        if not target:
            continue
        try:
            r = requests.get(target, headers={"User-Agent": UA}, timeout=15)
            r.encoding = r.apparent_encoding or "utf-8"
            body = extract_post_body(r.text)
        except Exception as exc:
            log("  · 본문 실패 %s (%s)" % (src.url[:50], exc))
            continue
        if len(body) < 200:
            continue
        src.body = body[:4000]
        done += 1
        log("  · 본문 확보: %s" % src.title[:40])
        time.sleep(0.4)  # 예의상 간격
    return sources


def collect(topic, count=8, page=None, log=print):
    """글감 수집 진입점."""
    if cfg.has_naver_api:
        log("· 네이버 검색 API 로 글감 수집")
        sources = collect_via_api(topic, count, log=log)
    elif page is not None:
        log("· 크롬으로 네이버 검색결과 수집 (API 키 없음)")
        sources = collect_via_web(page, topic, count, log=log)
    else:
        raise RuntimeError(
            "글감을 모을 방법이 없습니다. .env 에 NAVER_CLIENT_ID/SECRET 을 넣거나,\n"
            "  --no-browser 옵션을 빼서 크롬 검색 수집을 쓰세요."
        )

    # 중복 링크 제거
    seen, uniq = set(), []
    for s in sources:
        key = s.url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)

    fetch_bodies(uniq, limit=min(6, count), log=log)
    log("· 글감 %d건 확보" % len(uniq))
    return uniq
