"""네이버 스마트에디터 ONE 셀렉터 모음.

네이버가 DOM 을 바꾸면 여기만 고치면 된다. 각 항목은 '먼저 맞는 것을 쓴다'는
후보 목록이라, 새 셀렉터를 앞에 하나 추가하는 식으로 대응할 수 있다.
"""

# 에디터가 iframe 안에 있는 경우의 프레임 이름
FRAME_NAME = "mainFrame"

# 에디터 본체가 떴는지 확인용
EDITOR_READY = [".se-container", ".se-canvas", "[class*='se-content']"]

# 진입 시 뜨는 팝업들 — 있으면 닫는다
POPUP_CANCEL = [
    ".se-popup-button-cancel",           # "작성 중인 글이 있습니다" → 취소
    ".se-popup-button.se-popup-button-cancel",
    "button.se-popup-button-cancel",
]
HELP_CLOSE = [
    ".se-help-panel-close-button",
    "button.se-help-panel-close-button",
    ".se-guide-close",
]

# 제목 / 본문
TITLE = [
    ".se-section-documentTitle .se-text-paragraph",
    ".se-documentTitle .se-text-paragraph",
    ".se-placeholder.__se_placeholder",
]
BODY_FIRST = [
    ".se-component.se-text:not(.se-documentTitle) .se-text-paragraph",
    ".se-section-text .se-text-paragraph",
]
BODY_PARAGRAPHS = ".se-component.se-text:not(.se-documentTitle) .se-text-paragraph"
IMAGE_COMPONENTS = ".se-component.se-image"
IMAGE_CAPTION = ".se-component.se-image .se-caption .se-text-paragraph"
# 이미지 컴포넌트를 클릭해 선택한 뒤에야 캡션 입력란이 보인다
CAPTION_IN_IMAGE = ".se-caption .se-text-paragraph"

# 사진 2장 이상을 한 번에 올리면 뜨는 "사진 첨부 방식" 팝업
IMAGE_TYPE_POPUP = ".se-popup-image-type"
IMAGE_TYPE_OPTION = {
    "개별사진": "li.se-image-type-item[data-log='limgatt.ind']",
    "콜라주": "li.se-image-type-item[data-log='limgatt.coll']",
    "슬라이드": "li.se-image-type-item[data-log='limgatt.slide']",
}

# 굵게 버튼. 켜져 있으면 클래스에 se-is-selected 가 붙는다.
TOOLBAR_BOLD = "button.se-bold-toolbar-button"
TOGGLE_ON_CLASS = "se-is-selected"

# 캔버스 맨 아래 '본문 추가' 버튼 — 특수 블록 뒤에 새 본문 문단을 만들 때 쓴다
CANVAS_BOTTOM_BUTTON = "button.se-canvas-bottom-button"

# 툴바 버튼
TOOLBAR_IMAGE = [
    "button.se-image-toolbar-button",
    "[data-name='image'] button",
    "button[data-log='ect.image']",
]
TOOLBAR_QUOTE = [
    "button.se-insert-quotation-default-toolbar-button",
    "button[data-name='quotation']",
]
# 인용구 스타일 선택 드롭다운 (인용구 종류를 고르면 그 스타일로 삽입된다)
TOOLBAR_QUOTE_SELECT = [
    "button.se-document-toolbar-select-option-button[data-name='quotation']",
]
QUOTE_STYLE_OPTION = "button[data-value='{style}']"
QUOTE_COMPONENT = ".se-component.se-quotation"
QUOTE_TEXT = ".se-text-paragraph"   # 인용구 안 첫 문단(둘째는 '출처' 칸)
QUOTE_STYLES = {
    "따옴표": "default",            # 인용구1
    "라인&따옴표": "quotation_line",  # 인용구2
    "말풍선": "quotation_bubble",    # 인용구3
    "밑줄": "quotation_underline",   # 인용구4
    "포스트잇": "quotation_postit",   # 인용구5
    "모서리": "quotation_corner",     # 인용구6
}

# 문단 정렬
ALIGN_DROPDOWN = ["button[data-name='align-drop-down-with-justify']"]
ALIGN_OPTION = {
    "left": "button[data-log='prt.left']",
    "center": "button[data-log='prt.center']",
    "right": "button[data-log='prt.right']",
}

TOOLBAR_DIVIDER = [
    "button.se-insert-horizontal-line-default-toolbar-button",
    "button[data-name='horizontal-line']",
]
TOOLBAR_FONT_SIZE = [
    "button.se-font-size-code-toolbar-button",
    "button[data-name='font-size']",
]
# 옵션 값은 'fs19' 처럼 fs 접두어가 붙는다
FONT_SIZE_OPTION = "button[data-value='fs{size}']"

# 장소(지도) 첨부 — 툴바 → 장소명 검색 → 추가 → 확인
TOOLBAR_MAP = [
    "button.se-map-toolbar-button",
    "button[data-name='map']",
]
MAP_POPUP = ".se-popup-placesMap"
MAP_SEARCH_INPUT = [
    "input.react-autosuggest__input",
    "input[placeholder*='장소명']",
]
MAP_SEARCH_BUTTON = ["button.se-place-search-button"]
MAP_RESULT_ITEM = ".se-place-map-search-result-item"
MAP_RESULT_TITLE = ".se-place-map-search-result-title"
MAP_ADD_BUTTON = "button.se-place-add-button"
MAP_CONFIRM = ["button.se-popup-button-confirm"]
# 본문에 삽입된 지도 컴포넌트 (확인용)
MAP_COMPONENT = ".se-component.se-placesMap"

# 상단 헤더의 저장(임시저장) 버튼. '발행'은 절대 누르지 않는다.
SAVE_DRAFT = [
    "button[class*='save_btn']",
    ".header button:has-text('저장')",
    "button:has-text('저장'):not(:has-text('발행'))",
]
# 안전장치: 이 텍스트가 들어간 버튼은 무슨 일이 있어도 클릭 대상에서 제외
FORBIDDEN_BUTTON_TEXT = ("발행", "publish")
