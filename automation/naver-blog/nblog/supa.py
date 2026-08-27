"""생성한 초안을 Supabase blog_drafts 테이블에도 넣어두기 (선택).

관리자 화면 admin/blog.html 에서 바로 검토·수정할 수 있게 하려는 용도.
anon 키로는 status='draft' 인 insert 만 허용되어 있다 (migration_blog_drafts.sql).
"""

import requests

from .config import cfg


def save_draft(post, log=print):
    if not cfg.has_supabase:
        return False
    url = cfg.supabase_url.rstrip("/") + "/rest/v1/blog_drafts"
    payload = {
        "title": post.title,
        "content": post.to_markdown(),
        "keywords": post.tags,
        "source_topic": post.topic,
        "status": "draft",
    }
    try:
        r = requests.post(
            url,
            headers={
                "apikey": cfg.supabase_key,
                "Authorization": "Bearer " + cfg.supabase_key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
        log("· Supabase blog_drafts 에 저장했습니다 (관리자 > 블로그 메뉴에서 확인)")
        return True
    except Exception as exc:
        log("· Supabase 저장 실패: %s" % exc)
        return False
