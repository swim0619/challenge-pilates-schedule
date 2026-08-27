"""모은 글감으로 Claude 가 블로그 글을 쓴다."""

import json
import re

import anthropic

from .config import cfg
from .models import Block, Post

SYSTEM = """당신은 한국의 필라테스 스튜디오를 운영하며 네이버 블로그를 직접 쓰는 원장입니다.
검색해서 모은 자료를 참고하되, 짜깁기가 아니라 본인 경험과 관점으로 새로 씁니다.

문체
- 존댓말, 대화하듯 편안한 어조. "~하시면 좋아요", "~더라고요" 같은 결.
- 한 문장은 짧게. 한 문단은 2~4문장.
- 광고 문구, 과장된 효능, 의학적 단정("치료됩니다", "완치") 금지.
- 자료에 없는 수치·연구·인용은 지어내지 않습니다.
- 특정 블로그 문장을 그대로 옮기지 않습니다. 반드시 다시 씁니다.

구성
- 도입은 독자가 겪는 상황에서 시작합니다.
- 소제목으로 3~5개 꼭지를 나눕니다.
- 실제로 해볼 수 있는 내용을 담습니다.
- 마무리는 부담 없는 한마디로. 과한 영업 멘트는 넣지 않습니다.

반드시 JSON 하나만 출력합니다. 코드펜스나 설명 문장을 앞뒤에 붙이지 마세요."""

SCHEMA_GUIDE = """출력 형식 (JSON):
{
  "title": "네이버 블로그 제목. 25자 내외, 검색어가 자연스럽게 들어가게",
  "summary": "한 줄 요약",
  "tags": ["태그", ...],            // 8~12개, # 없이
  "blocks": [
    {"type": "quote",     "text": "도입부를 여는 짧은 한 문장"},
    {"type": "paragraph", "text": "문단. **강조**로 굵게 표시 가능"},
    {"type": "heading",   "text": "소제목"},
    {"type": "list",      "items": ["항목", "항목"]},
    {"type": "callout",   "text": "기억할 포인트 한 줄"},
    {"type": "image",     "query": "영어 사진 검색어", "caption": "사진 밑에 붙일 한글 설명"},
    {"type": "divider"}
  ]
}

블록 규칙
- 첫 블록은 quote, 그 다음 image 로 대표 사진을 넣습니다.
- 소제목(heading)마다 그 아래에 문단 2~3개를 둡니다.
- image 블록은 총 %d개. 소제목 사이에 흩어놓습니다.
- image 의 query 는 실제 무료 스톡 사진이 검색될 만한 영어 표현으로 씁니다.
  (예: "pilates reformer studio", "woman stretching back at home")
- 전체 분량은 공백 포함 %d자 안팎."""


def _extract_json(text):
    """모델 응답에서 JSON 객체만 뽑아낸다."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("응답에서 JSON 을 찾지 못했습니다:\n" + text[:500])
    return json.loads(text[start : end + 1])


def _sources_prompt(sources, limit=10):
    chunks = [s.for_prompt() for s in sources[:limit] if (s.body or s.snippet)]
    return "\n\n---\n\n".join(chunks) if chunks else "(수집된 자료 없음)"


def compose(topic, sources, images=4, length=1600, extra="", log=print):
    if not cfg.anthropic_key:
        raise RuntimeError(
            ".env 의 ANTHROPIC_API_KEY 가 비어 있습니다. "
            "console.anthropic.com 에서 키를 만들어 넣어주세요."
        )

    client = anthropic.Anthropic(api_key=cfg.anthropic_key)

    user = "\n\n".join(
        [
            "주제: %s" % topic,
            extra.strip() and ("추가 요청사항: %s" % extra.strip()) or "",
            "아래는 이 주제로 네이버에서 모아 온 자료입니다. 사실관계와 독자들이 "
            "궁금해하는 지점을 파악하는 데만 쓰고, 문장은 새로 쓰세요.",
            _sources_prompt(sources),
            SCHEMA_GUIDE % (images, length),
        ]
    ).strip()

    log("· Claude(%s)에게 글 작성 요청" % cfg.model)
    with client.messages.stream(
        model=cfg.model,
        max_tokens=16000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": user}],
    ) as stream:
        message = stream.get_final_message()

    if getattr(message, "stop_reason", "") == "refusal":
        raise RuntimeError("모델이 요청을 거절했습니다. 주제를 바꿔서 다시 시도해 주세요.")

    text = "".join(b.text for b in message.content if b.type == "text")
    data = _extract_json(text)

    blocks = []
    for raw in data.get("blocks", []):
        if not isinstance(raw, dict) or "type" not in raw:
            continue
        blocks.append(
            Block(
                type=raw.get("type", "paragraph"),
                text=(raw.get("text") or "").strip(),
                items=[str(i).strip() for i in (raw.get("items") or [])],
                query=(raw.get("query") or "").strip(),
                caption=(raw.get("caption") or "").strip(),
            )
        )

    post = Post(
        title=(data.get("title") or topic).strip(),
        summary=(data.get("summary") or "").strip(),
        tags=[str(t).lstrip("#").strip() for t in (data.get("tags") or []) if str(t).strip()],
        blocks=blocks,
        topic=topic,
        sources=sources,
    )
    log("· 초안 완성: 「%s」 (%d블록, 태그 %d개)" % (post.title, len(blocks), len(post.tags)))
    return post
