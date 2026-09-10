"""수집 → 작성 → 게시 사이를 오가는 데이터 구조."""

import dataclasses
import json
from typing import List, Optional


@dataclasses.dataclass
class Source:
    """검색으로 모은 글감 한 건."""

    title: str
    url: str
    snippet: str = ""
    body: str = ""          # 본문까지 읽어온 경우
    origin: str = ""        # naver_blog / naver_news / naver_kin ...

    def for_prompt(self, max_chars=1800):
        text = (self.body or self.snippet or "").strip()
        if len(text) > max_chars:
            text = text[:max_chars] + " …"
        return "[%s] %s\n%s\n%s" % (self.origin, self.title, self.url, text)


@dataclasses.dataclass
class Block:
    """글 본문을 이루는 한 덩어리. 에디터 렌더러가 이걸 보고 서식을 넣는다."""

    type: str                       # heading|paragraph|list|quote|callout|divider|image|place
    text: str = ""
    items: List[str] = dataclasses.field(default_factory=list)
    query: str = ""                 # image 블록: 어떤 사진을 찾을지
    caption: str = ""               # image 블록: 사진 설명
    path: Optional[str] = None      # image 블록: 파일 한 장
    paths: List[str] = dataclasses.field(default_factory=list)  # image 블록: 여러 장 묶어 넣기
    credit: str = ""                # image 블록: 출처/저작자 표기
    place: str = ""                 # place 블록: 네이버 지도에서 검색할 장소명
    layout: str = "개별사진"          # image 블록: 개별사진 | 콜라주 | 슬라이드
    style: str = ""                 # quote/heading 블록: 인용구 스타일 이름

    def files(self):
        """image 블록이 실제로 넣을 파일 목록."""
        return list(self.paths) if self.paths else ([self.path] if self.path else [])


@dataclasses.dataclass
class Post:
    title: str
    blocks: List[Block]
    tags: List[str] = dataclasses.field(default_factory=list)
    topic: str = ""
    summary: str = ""
    sources: List[Source] = dataclasses.field(default_factory=list)

    # ── 직렬화 ──────────────────────────────────────────
    def to_dict(self):
        return {
            "title": self.title,
            "topic": self.topic,
            "summary": self.summary,
            "tags": self.tags,
            "blocks": [dataclasses.asdict(b) for b in self.blocks],
            "sources": [dataclasses.asdict(s) for s in self.sources],
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            title=d.get("title", ""),
            topic=d.get("topic", ""),
            summary=d.get("summary", ""),
            tags=list(d.get("tags") or []),
            blocks=[Block(**b) for b in d.get("blocks") or []],
            sources=[Source(**s) for s in d.get("sources") or []],
        )

    def save_json(self, path):
        path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def to_markdown(self):
        """사람이 눈으로 확인하는 미리보기용."""
        out = ["# %s" % self.title, ""]
        for b in self.blocks:
            if b.type == "heading":
                out += ["## %s" % b.text, ""]
            elif b.type == "paragraph":
                out += [b.text, ""]
            elif b.type == "list":
                out += ["- %s" % i for i in b.items] + [""]
            elif b.type == "quote":
                out += ["> %s" % b.text, ""]
            elif b.type == "callout":
                out += ["**%s**" % b.text, ""]
            elif b.type == "divider":
                out += ["---", ""]
            elif b.type == "image":
                for f in b.files():
                    out.append("![%s](%s)" % (b.caption or b.query, f))
                if b.credit:
                    out.append("_%s_" % b.credit)
                out.append("")
            elif b.type == "place":
                out += ["📍 %s" % b.place, ""]
        if self.tags:
            out += ["", " ".join("#" + t for t in self.tags)]
        return "\n".join(out).strip() + "\n"
