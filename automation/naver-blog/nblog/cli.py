"""명령줄 진입점.

  ./run.sh login
  ./run.sh write "필라테스 초보 주 몇 번" --images 4
  ./run.sh write "거북목 스트레칭" --dry-run        # 글만 만들고 네이버는 건드리지 않음
  ./run.sh post out/20260827-1130-거북목/post.json  # 만들어둔 초안만 올리기
"""

import argparse
import datetime
import json
import re
import sys
from pathlib import Path

from . import editor as ED
from . import imagery, supa
from .browser import Chrome
from .collect import collect
from .compose import compose
from .config import cfg
from .models import Post


def log(*args):
    print(*args)
    sys.stdout.flush()


def _slug(text, limit=24):
    s = re.sub(r"\s+", "-", text.strip())
    s = re.sub(r"[^0-9A-Za-z가-힣\-]", "", s)
    return s[:limit] or "post"


def _new_out_dir(topic):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    path = cfg.out_dir / ("%s-%s" % (stamp, _slug(topic)))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _publish_to_naver(post, out_dir, keep_open=False):
    with Chrome(log=log) as chrome:
        chrome.ensure_login()
        blog_id = chrome.detect_blog_id()
        ed = ED.open_writer(chrome, blog_id, log=log)
        ED.write_post(ed, post, log=log)
        ED.save_draft(ed, log=log)
        ED.screenshot(ed, out_dir / "screenshot.png", log=log)
        if keep_open:
            log("· 크롬 창은 열어둡니다. 내용 확인 후 직접 '발행'하시면 됩니다.")


# ── 명령 ────────────────────────────────────────────────────────────


def cmd_login(args):
    with Chrome(log=log) as chrome:
        chrome.ensure_login()
        log("· 블로그 아이디: %s" % chrome.detect_blog_id())
        log("· 이 프로필(chrome-profile/)에 로그인이 저장됐습니다. 다음부터는 바로 실행돼요.")


def cmd_write(args):
    topic = args.topic
    out_dir = _new_out_dir(topic)
    log("주제: %s" % topic)
    log("작업 폴더: %s" % out_dir)

    need_browser_for_collect = not cfg.has_naver_api

    # 1) 글감 수집
    if need_browser_for_collect:
        with Chrome(log=log) as chrome:
            chrome.ensure_login()
            sources = collect(topic, count=args.count, page=chrome.page, log=log)
    else:
        sources = collect(topic, count=args.count, log=log)

    if not sources:
        log("! 글감을 하나도 모으지 못했습니다. 주제를 조금 더 일반적인 말로 바꿔보세요.")
        return 1

    # 2) 글 작성
    post = compose(
        topic,
        sources,
        images=0 if args.no_images else args.images,
        length=args.length,
        extra=args.note or "",
        log=log,
    )

    # 3) 사진
    if not args.no_images:
        imagery.attach_images(post, out_dir / "images", source=args.images_from, log=log)

    # 4) 파일로 남기기
    post.save_json(out_dir / "post.json")
    (out_dir / "post.md").write_text(post.to_markdown(), encoding="utf-8")
    log("· 초안 저장: %s" % (out_dir / "post.md"))

    if args.save_supabase:
        supa.save_draft(post, log=log)

    # 5) 네이버 임시저장
    if args.dry_run:
        log("· --dry-run 이라 네이버에는 올리지 않았습니다.")
        log("  올리려면: ./run.sh post %s" % (out_dir / "post.json"))
        return 0

    _publish_to_naver(post, out_dir, keep_open=args.keep_open)
    return 0


def cmd_post(args):
    path = Path(args.path)
    post = Post.from_dict(json.loads(path.read_text(encoding="utf-8")))
    _publish_to_naver(post, path.parent, keep_open=args.keep_open)
    return 0


def build_parser():
    p = argparse.ArgumentParser(
        prog="nblog", description="글감 수집 → AI 글쓰기 → 네이버 블로그 임시저장"
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("login", help="크롬을 띄우고 네이버 로그인 상태를 만들어 둡니다")

    w = sub.add_parser("write", help="주제 하나로 글 한 편을 만듭니다")
    w.add_argument("topic", help="글 주제 (예: '필라테스 처음 시작할 때')")
    w.add_argument("--count", type=int, default=8, help="모을 글감 수 (기본 8)")
    w.add_argument("--images", type=int, default=4, help="넣을 사진 수 (기본 4)")
    w.add_argument("--no-images", action="store_true", help="사진 없이 글만")
    w.add_argument(
        "--images-from",
        default="auto",
        choices=["auto", "local", "pexels", "wikimedia"],
        help="사진 출처 (기본 auto: 내 사진 → Pexels → 위키미디어)",
    )
    w.add_argument("--length", type=int, default=1600, help="목표 분량(자), 기본 1600")
    w.add_argument("--note", help="추가 요청사항 (예: '수업 안내는 빼줘')")
    w.add_argument("--dry-run", action="store_true", help="네이버에 올리지 않고 파일만 생성")
    w.add_argument("--save-supabase", action="store_true", help="blog_drafts 테이블에도 저장")
    w.add_argument("--keep-open", action="store_true", help="끝난 뒤 크롬 창 그대로 두기")

    o = sub.add_parser("post", help="만들어 둔 post.json 을 네이버에 임시저장")
    o.add_argument("path", help="post.json 경로")
    o.add_argument("--keep-open", action="store_true")

    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.cmd == "login":
            return cmd_login(args) or 0
        if args.cmd == "write":
            return cmd_write(args)
        if args.cmd == "post":
            return cmd_post(args)
    except KeyboardInterrupt:
        log("\n중단했습니다.")
        return 130
    except Exception as exc:
        log("\n! 오류: %s" % exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
