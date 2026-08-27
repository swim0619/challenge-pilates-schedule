"""스마트에디터 ONE 조종 — 글을 타이핑하고 서식을 입히고 '임시저장'까지."""

import math
import re
import sys
from pathlib import Path
import time

from . import selectors as S

MOD = "Meta" if sys.platform == "darwin" else "Control"

# 소제목 앞에 돌아가며 붙일 이모지 (블로그 느낌)
# 여러 코드포인트가 결합된 이모지(예: 🧘‍♀️)는 타이핑 중 깨지므로 단일 문자만 쓴다
HEAD_SIZE = "19"   # 소제목 글자 크기
BODY_SIZE = "15"   # 본문 글자 크기
HEAD_STYLE = "라인&따옴표"   # 소제목에 쓸 인용구 스타일
HEAD_EMOJI_ON = False       # 인용구 소제목에는 이모지를 쓰지 않는다
ALIGN = "center"            # 본문 정렬 (모바일 가독성)
LINE_MIN, LINE_MAX = 8, 15  # 한 줄 글자수

HEAD_EMOJI = ["🌿", "💪", "🔥", "✨", "📌", "🍀", "🔎", "🌙"]

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_BOLD_SPAN = re.compile(r"\*\*.+?\*\*")
_GLUE = "\u0000"   # 줄바꿈 계산 중 **강조** 안의 공백을 잠시 묶어두는 표식


def _vis_len(text):
    """화면에 실제로 보이는 글자수 (** 마커는 세지 않는다)."""
    return len(text.replace("**", "").replace(_GLUE, " "))


def _glue_bold(text):
    """**강조** 구간이 줄 사이로 잘리지 않도록 내부 공백을 묶는다."""
    return _BOLD_SPAN.sub(lambda m: m.group(0).replace(" ", _GLUE), text)


class Editor:
    """page + (있다면) iframe 을 함께 다루는 얇은 래퍼."""

    def __init__(self, page, frame, log=print):
        self.page = page
        self.frame = frame
        self.log = log

    @property
    def ctx(self):
        return self.frame or self.page

    def loc(self, sel):
        return self.ctx.locator(sel)

    # ── 기본 동작 ──────────────────────────────────────────

    def first_visible(self, candidates, timeout=4000):
        for sel in candidates:
            try:
                el = self.loc(sel).first
                el.wait_for(state="visible", timeout=timeout)
                return el
            except Exception:
                continue
        return None

    def click_first(self, candidates, what, timeout=4000):
        el = self.first_visible(candidates, timeout=timeout)
        if el is None:
            self.log("  · %s 버튼을 못 찾았습니다 — 건너뜁니다" % what)
            return False
        try:
            if _is_forbidden(el):
                self.log("  · %s: 발행 버튼으로 보여 클릭을 막았습니다" % what)
                return False
            el.click(timeout=timeout)
            self.page.wait_for_timeout(400)
            return True  # 포커스 복구는 호출한 쪽에서 ensure_focus() 로 처리
        except Exception as exc:
            self.log("  · %s 클릭 실패: %s" % (what, exc))
            return False

    def type(self, text, delay=6):
        self.page.keyboard.type(text, delay=delay)

    def enter(self, times=1):
        for _ in range(times):
            self.page.keyboard.press("Enter")
            self.page.wait_for_timeout(60)

    def bold_is_on(self):
        """굵게가 켜져 있는지 툴바 버튼 상태로 확인 (모르면 None)."""
        try:
            cls = self.loc(S.TOOLBAR_BOLD).first.get_attribute("class") or ""
            return S.TOGGLE_ON_CLASS in cls
        except Exception:
            return None

    def set_bold(self, on):
        """굵게를 켜거나 끈다. 토글이 아니라 '원하는 상태로 맞춘다'.

        Ctrl/Cmd+B 토글은 서식 적용 중 상태가 어긋나면 그대로 뒤집혀서,
        엉뚱한 문단이 굵어지고 소제목은 안 굵어지는 일이 생긴다.
        """
        state = self.bold_is_on()
        if state is None or state == on:
            return
        try:
            self.loc(S.TOOLBAR_BOLD).first.click(timeout=3000)
            self.page.wait_for_timeout(180)
        except Exception:
            self.page.keyboard.press("%s+b" % MOD)   # 최후 수단

    def type_rich(self, text):
        """**강조** 표시만 굵게 처리하면서 타이핑."""
        pos = 0
        for m in _BOLD_RE.finditer(text):
            if m.start() > pos:
                self.type(text[pos : m.start()])
            self.set_bold(True)
            self.type(m.group(1))
            self.set_bold(False)
            pos = m.end()
        if pos < len(text):
            self.type(text[pos:])

    def focus_end(self):
        """본문 맨 끝으로 커서 이동 (이미지 삽입 후 이어쓰기용)."""
        try:
            paras = self.loc(S.BODY_PARAGRAPHS)
            n = paras.count()
            if n:
                paras.nth(n - 1).click()
                self.page.keyboard.press("End")
        except Exception:
            pass

    def ensure_focus(self):
        """툴바 버튼을 누르면 커서가 본문 밖으로 나가는 경우가 있어 되돌린다."""
        try:
            editing = self.ctx.evaluate(
                "() => !!document.activeElement && document.activeElement.isContentEditable"
            )
        except Exception:
            editing = False
        if not editing:
            self.focus_end()


def _is_forbidden(el):
    try:
        text = (el.inner_text() or "").strip()
    except Exception:
        return False
    return any(bad in text for bad in S.FORBIDDEN_BUTTON_TEXT)


# ── 에디터 열기 ─────────────────────────────────────────────────────


def open_writer(chrome, blog_id, log=print):
    page = chrome.page
    page.bring_to_front()
    urls = [
        "https://blog.naver.com/%s/postwrite" % blog_id,
        "https://blog.naver.com/%s?Redirect=Write" % blog_id,
    ]
    for url in urls:
        log("· 글쓰기 화면 여는 중: %s" % url)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except Exception as exc:
            log("  · 이동 실패: %s" % exc)
            continue
        page.wait_for_timeout(2500)

        frame = next((f for f in page.frames if f.name == S.FRAME_NAME), None)
        ed = Editor(page, frame, log=log)
        if ed.first_visible(S.EDITOR_READY, timeout=12000) is not None:
            _dismiss_popups(ed)
            log("· 에디터 준비 완료")
            return ed
    raise RuntimeError(
        "글쓰기 에디터를 열지 못했습니다. 크롬 창에서 네이버 로그인 상태와 "
        "블로그 아이디(%s)를 확인해 주세요." % blog_id
    )


def _dismiss_popups(ed):
    # "작성 중인 글이 있습니다" → 취소 (새 글로 시작)
    el = ed.first_visible(S.POPUP_CANCEL, timeout=2500)
    if el is not None:
        try:
            el.click()
            ed.log("  · 이전 임시저장 불러오기 팝업 닫음")
            ed.page.wait_for_timeout(600)
        except Exception:
            pass
    # 도움말 패널
    el = ed.first_visible(S.HELP_CLOSE, timeout=1500)
    if el is not None:
        try:
            el.click()
            ed.page.wait_for_timeout(300)
        except Exception:
            pass


# ── 블록 렌더링 ─────────────────────────────────────────────────────


def write_post(ed, post, log=print):
    # 제목
    title_el = ed.first_visible(S.TITLE, timeout=8000)
    if title_el is None:
        raise RuntimeError("제목 입력란을 찾지 못했습니다.")
    title_el.click()
    ed.page.wait_for_timeout(300)
    ed.type(post.title)
    log("· 제목 입력: %s" % post.title)

    # 본문으로 이동
    body = ed.first_visible(S.BODY_FIRST, timeout=8000)
    if body is None:
        raise RuntimeError("본문 입력란을 찾지 못했습니다.")
    body.click()
    ed.page.wait_for_timeout(300)
    _set_align(ed)

    head_i = 0
    for idx, block in enumerate(post.blocks):
        try:
            if block.type == "heading":
                text = block.text
                if HEAD_EMOJI_ON:
                    text = "%s %s" % (HEAD_EMOJI[head_i % len(HEAD_EMOJI)], text)
                    head_i += 1
                _insert_quote(ed, text, style=block.style or HEAD_STYLE, log=log)

            elif block.type == "paragraph":
                # 블로그처럼 문장 단위로 줄을 끊어준다
                for line in _split_sentences(block.text):
                    ed.type_rich(line)
                    ed.enter()

            elif block.type == "list":
                for item in block.items:
                    ed.type_rich("· " + item)
                    ed.enter()
                ed.enter()

            elif block.type == "quote":
                _insert_quote(ed, block.text, style=block.style, log=log)

            elif block.type == "callout":
                ed.set_bold(True)
                ed.type("💡 %s" % _strip_bold(block.text))
                ed.set_bold(False)
                ed.enter(2)

            elif block.type == "divider":
                ed.click_first(S.TOOLBAR_DIVIDER, "구분선")
                _new_body_paragraph(ed)

            elif block.type == "image" and block.files():
                _insert_images(ed, block, log=log)

            elif block.type == "place" and block.place:
                _insert_place(ed, block.place, log=log)

        except Exception as exc:
            log("  · %d번째 블록(%s) 처리 중 오류, 건너뜁니다: %s"
                % (idx + 1, block.type, str(exc).splitlines()[0][:80]))
            _dismiss_blocking_popup(ed)   # 팝업이 떠 있으면 다음 블록까지 막힌다
            ed.focus_end()

    # 태그는 '발행' 설정 화면에서만 입력할 수 있으므로 본문 끝에 적어둔다
    if post.tags:
        ed.enter()
        ed.type(" ".join("#" + t for t in post.tags))
        log("· 태그 %d개를 본문 끝에 넣었습니다 (발행 시 태그란에 붙여넣기 하세요)" % len(post.tags))


def _insert_images(ed, block, log=print):
    """사진 여러 장을 한 번에 첨부한다 (에디터가 알아서 묶어서 배치)."""
    files = block.files()
    before = ed.loc(S.IMAGE_COMPONENTS).count()
    btn = ed.first_visible(S.TOOLBAR_IMAGE, timeout=4000)
    if btn is None:
        log("  · 사진 버튼을 못 찾아 이미지를 건너뜁니다")
        return
    try:
        with ed.page.expect_file_chooser(timeout=15000) as fc:
            btn.click(timeout=8000)
        fc.value.set_files(files)
    except Exception as exc:
        log("  · 사진 첨부 실패(%d장): %s" % (len(files), exc))
        _dismiss_blocking_popup(ed)
        return

    # 2장 이상이면 "사진 첨부 방식" 팝업이 뜬다. 고르지 않으면 그 뒤 클릭이 전부 막힌다.
    if len(files) > 1:
        _choose_image_layout(ed, block.layout, log=log)

    # 업로드가 끝나 컴포넌트가 늘어날 때까지 기다린다 (장당 최대 30초)
    target = before + 1
    for _ in range(60 * max(1, len(files))):
        ed.page.wait_for_timeout(500)
        if ed.loc(S.IMAGE_COMPONENTS).count() >= target:
            break
    log("  · 사진 %d장 삽입(%s): %s"
        % (len(files), block.layout, ", ".join(Path(f).name for f in files)))

    caption = block.caption or ""
    if block.credit:
        caption = (caption + " (" + block.credit + ")").strip()
    if caption:
        try:
            imgs = ed.loc(S.IMAGE_COMPONENTS)
            # 방금 넣은 묶음의 첫 사진에 설명을 단다
            target = imgs.nth(before) if imgs.count() > before else imgs.last
            # 캡션 입력란은 이미지를 선택해야 나타난다
            target.click(timeout=5000)
            ed.page.wait_for_timeout(500)
            target.locator(S.CAPTION_IN_IMAGE).first.click(timeout=5000)
            ed.type(caption)
        except Exception as exc:
            log("  · 사진 설명은 넣지 못했습니다: %s" % str(exc).splitlines()[0][:60])
    _new_body_paragraph(ed)


def _choose_image_layout(ed, layout="개별사진", log=print):
    """'사진 첨부 방식' 팝업에서 레이아웃을 고른다."""
    try:
        ed.page.wait_for_selector(S.IMAGE_TYPE_POPUP, timeout=8000)
    except Exception:
        return  # 팝업이 안 뜨는 경우도 있다 (한 장일 때 등)
    sel = S.IMAGE_TYPE_OPTION.get(layout) or S.IMAGE_TYPE_OPTION["개별사진"]
    try:
        ed.loc(sel).first.click(timeout=5000)
        ed.page.wait_for_selector(S.IMAGE_TYPE_POPUP, state="detached", timeout=10000)
    except Exception as exc:
        log("  · 첨부 방식 선택 실패(%s): %s" % (layout, str(exc).splitlines()[0][:60]))
        _dismiss_blocking_popup(ed)


def _insert_quote(ed, text, style="", log=print):
    """지정한 스타일의 인용구 블록을 넣고 그 안에 글을 쓴다."""
    value = S.QUOTE_STYLES.get(style or "")
    placed = False
    if value:
        # 스타일 드롭다운에서 고르면 그 스타일로 삽입된다
        if ed.click_first(S.TOOLBAR_QUOTE_SELECT, "인용구 스타일", timeout=3000):
            try:
                ed.loc(S.QUOTE_STYLE_OPTION.format(style=value)).first.click(timeout=3000)
                ed.page.wait_for_timeout(500)
                placed = True
            except Exception as exc:
                log("  · 인용구 스타일(%s) 선택 실패: %s" % (style, str(exc).splitlines()[0][:50]))
                try:
                    ed.page.keyboard.press("Escape")
                except Exception:
                    pass
    if not placed:
        ed.click_first(S.TOOLBAR_QUOTE, "인용구")
    ed.page.wait_for_timeout(500)

    # 인용구를 넣어도 커서가 자동으로 들어가지 않는다.
    # ensure_focus() 를 쓰면 오히려 앞 문단으로 돌아가 버리므로 직접 클릭한다.
    try:
        box = ed.loc(S.QUOTE_COMPONENT).last.locator(S.QUOTE_TEXT).first
        box.click(timeout=5000)
        ed.page.wait_for_timeout(250)
    except Exception as exc:
        log("  · 인용구 안으로 커서를 옮기지 못했습니다: %s" % str(exc).splitlines()[0][:50])
        ed.ensure_focus()

    ed.type_rich(text)
    _new_body_paragraph(ed)


def _set_align(ed, align=ALIGN):
    """문단 정렬을 바꾼다. 실패해도 글쓰기는 계속된다."""
    if not align or align == "left":
        return False
    try:
        if not ed.click_first(S.ALIGN_DROPDOWN, "정렬", timeout=2500):
            return False
        ed.loc(S.ALIGN_OPTION[align]).first.click(timeout=2500)
        ed.page.wait_for_timeout(200)
        return True
    except Exception:
        try:
            ed.page.keyboard.press("Escape")
        except Exception:
            pass
        return False


def _new_body_paragraph(ed, align=ALIGN):
    """캔버스 맨 아래 '본문 추가' 버튼으로 새 본문 문단을 만든다.

    인용구 안에서 Enter 를 치면 인용구가 계속 이어져서 뒤 내용이 전부
    인용구에 먹힌다. 이 버튼은 항상 본문 컴포넌트를 새로 만들어 준다.
    """
    ok = True
    try:
        ed.loc(S.CANVAS_BOTTOM_BUTTON).first.click(timeout=4000)
        ed.page.wait_for_timeout(400)
    except Exception:
        ed.focus_end()
        ed.enter()
        ok = False
    _set_align(ed, align)   # 새 본문 컴포넌트는 정렬이 초기화된다
    return ok


def _dismiss_blocking_popup(ed):
    """화면을 덮고 있는 팝업을 닫아 다음 동작이 막히지 않게 한다."""
    for sel in (".se-popup-close-button", ".se-popup-button-cancel"):
        try:
            ed.loc(sel).first.click(timeout=1500)
            ed.page.wait_for_timeout(400)
            return True
        except Exception:
            continue
    try:
        ed.page.keyboard.press("Escape")
    except Exception:
        pass
    return False


def _insert_place(ed, query, log=print):
    """네이버 지도에서 장소를 검색해 본문에 지도 블록으로 넣는다."""
    if not ed.click_first(S.TOOLBAR_MAP, "장소"):
        return
    page = ed.page
    try:
        page.wait_for_selector(S.MAP_POPUP, timeout=10000)
        box = ed.first_visible(S.MAP_SEARCH_INPUT, timeout=5000)
        if box is None:
            raise RuntimeError("장소 검색창을 찾지 못함")
        box.click()
        box.fill(query)
        page.wait_for_timeout(500)
        ed.click_first(S.MAP_SEARCH_BUTTON, "장소 검색")

        item = ed.loc(S.MAP_RESULT_ITEM).first
        item.wait_for(state="visible", timeout=10000)
        found = item.locator(S.MAP_RESULT_TITLE).inner_text().strip()
        # '추가' 버튼은 항목에 마우스를 올려야 나타난다
        item.hover()
        page.wait_for_timeout(400)
        item.locator(S.MAP_ADD_BUTTON).first.click(timeout=8000)
        page.wait_for_timeout(700)
        ed.click_first(S.MAP_CONFIRM, "장소 확인")
        page.wait_for_timeout(1500)
        log("  · 지도 첨부: %s" % found)
    except Exception as exc:
        log("  · 지도 첨부 실패(%s): %s" % (query, exc))
        for sel in (".se-popup-close-button", ".se-popup-button-cancel"):
            try:
                ed.loc(sel).first.click(timeout=1500)
                break
            except Exception:
                continue
    finally:
        _new_body_paragraph(ed)


def _apply_font_size(ed, size):
    """현재 선택(없으면 앞으로 칠 글자)에 글자 크기를 적용한다.

    툴바 구조는 네이버가 자주 바꾸므로 실패해도 글쓰기는 계속된다.
    (그 경우 소제목은 '굵게 + 이모지'만으로 구분된다.)
    """
    try:
        if not ed.click_first(S.TOOLBAR_FONT_SIZE, "글자크기", timeout=2500):
            return False
        ed.loc(S.FONT_SIZE_OPTION.format(size=size)).first.click(timeout=2500)
        ed.page.wait_for_timeout(200)
        return True
    except Exception:
        try:
            ed.page.keyboard.press("Escape")
        except Exception:
            pass
        return False




# 문장부호가 있을 때만 끊는다. '요/다/죠'로 끊으면
# "홀이 거의 다 / 찼습니다." 처럼 문장 중간이 잘린다.
_SENT_RE = re.compile(r"(?<=[.!?~])\s+")


def _wrap_balanced(sentence, lo, hi):
    """한 문장을 lo~hi 글자 줄로 고르게 나눈다.

    앞줄만 꽉 채우면 끝에 '편합니다.' 같은 짧은 조각이 남는다.
    줄 수를 늘려가며 모든 줄이 lo~hi 안에 들어오는 배분을 찾는다.
    """
    words = sentence.split()
    if _vis_len(sentence) <= hi:
        return [sentence]

    for n in range(math.ceil(_vis_len(sentence) / hi), len(words) + 1):
        target = math.ceil(_vis_len(sentence) / n)
        lines, cur = [], ""
        for w in words:
            cand = (cur + " " + w).strip()
            if cur and (_vis_len(cand) > hi or (_vis_len(cur) >= target and len(lines) < n - 1)):
                lines.append(cur)
                cur = w
            else:
                cur = cand
        if cur:
            lines.append(cur)
        if all(lo <= _vis_len(x) <= hi for x in lines):
            return lines

    # 딱 맞는 배분이 없으면 짧은 꼬리만 앞줄에 붙여 준다
    lines, cur = [], ""
    for w in words:
        cand = (cur + " " + w).strip()
        if cur and _vis_len(cand) > hi:
            lines.append(cur)
            cur = w
        else:
            cur = cand
    if cur:
        lines.append(cur)
    # 마지막 줄이 짧으면 앞줄에서 단어를 하나씩 내려 균형을 맞춘다
    # (앞줄에 통째로 붙이면 그 줄이 hi 를 넘어버린다)
    if len(lines) > 1 and _vis_len(lines[-1]) < lo:
        prev = lines[-2].split()
        while _vis_len(lines[-1]) < lo and len(prev) > 1:
            word = prev[-1]
            if _vis_len(" ".join(prev[:-1])) < lo:
                break
            prev.pop()
            lines[-1] = word + " " + lines[-1]
        lines[-2] = " ".join(prev)
    # 그래도 짧은 꼬리가 남으면(단어 경계상 8~15자로 못 쪼개는 문장) 앞줄에 붙인다.
    # 5자짜리 외톨이 줄보다는 16자 한 줄이 읽기 낫다.
    if len(lines) > 1 and _vis_len(lines[-1]) < lo:
        tail = lines.pop()
        lines[-1] = lines[-1] + " " + tail
    return lines


def _split_sentences(text, lo=LINE_MIN, hi=LINE_MAX):
    """문단을 한 줄 8~15자로 쪼갠다 — 휴대폰에서 읽기 좋은 호흡."""
    lines = []
    for sent in [x.strip() for x in _SENT_RE.split(_glue_bold(text.strip())) if x.strip()]:
        lines.extend(_wrap_balanced(sent, lo, hi))
    return [l.replace(_GLUE, " ") for l in lines]


def _strip_bold(text):
    return _BOLD_RE.sub(r"\1", text)


# ── 임시저장 ────────────────────────────────────────────────────────


def save_draft(ed, log=print):
    """'저장'(임시저장)만 누른다. '발행'은 이 도구가 절대 누르지 않는다."""
    page = ed.page
    for sel in S.SAVE_DRAFT:
        for scope in (page, ed.ctx):
            try:
                el = scope.locator(sel).first
                el.wait_for(state="visible", timeout=3000)
            except Exception:
                continue
            if _is_forbidden(el):
                continue
            try:
                el.click()
                page.wait_for_timeout(2500)
                log("· 임시저장 완료 — 네이버 블로그 '저장 글' 목록에서 확인하세요")
                return True
            except Exception as exc:
                log("  · 저장 클릭 실패(%s): %s" % (sel, exc))
    log("· 저장 버튼을 찾지 못했습니다. 크롬 창에서 직접 '저장'을 눌러주세요.")
    return False


def screenshot(ed, path, log=print):
    try:
        ed.page.screenshot(path=str(path), full_page=False)
        log("· 화면 캡처: %s" % path)
    except Exception as exc:
        log("  · 캡처 실패: %s" % exc)
