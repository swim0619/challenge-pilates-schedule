# 챌린지필라테스 센터 블로그 도구

센터 블로그(blogId `challenge_pilates`)의 임시저장 글을 Ego Lite 브라우저(`ego-browser nodejs`)로 고칠 때 쓰는 도구 모음.
맛집 블로그 자동 작성 도구는 `../naver-blog` 에 따로 있다.

## editor/ — 스마트에디터 조작 (ego-browser 스크립트에서 import)
- `load.js` `loadDraft(page, 제목일부)` — 글쓰기 화면을 열고 임시저장 글을 불러온다.
- `para.js` `replacePara(page, 문단앞부분, [새줄...])` — 문단을 세 번 클릭해 선택한 뒤 바꾼다.
  `urlLineToLink(page, url, linkify)` — 주소만 있는 줄을 지우고 위 제목 줄에 링크를 건다.
- `finish.js` `linkify` 글자에 링크 걸기, `addCards` '💬 예약·문의' 줄 아래에 카카오톡 채널 카드
  (http://pf.kakao.com/_JIxgpxj)와 네이버 톡톡 배너 넣기, `check` 링크·카드·사진 개수 확인.
- `insert.js` `insertAfter(page, 문단, 파일)` 문단 뒤에 사진 한 장 넣기, `replaceAll(page, {title,text,html})`
  본문 전체 교체(예전 굵게·기울임·크기 16이 남지 않게 끄고 15로 맞춘 뒤 붙여넣기).

주의: 붙여넣은 HTML 의 `<a>` 링크는 에디터가 지운다 → 링크는 `linkify` 로 건다.
저장은 헤더 `save_btn`(임시저장)만 누르고 '발행'은 누르지 않는다.

## photos/ — 회원 사진 고르기
- `sheet.py` 사진 폴더(iCloud Drive '챌린지회원님')를 번호 붙은 미리보기 판으로 만든다.
- `dedup.py` 이미 발행한 글의 사진과 겹치는지 비교한다.
- 얼굴 모자이크는 `../naver-blog/nblog/privacy.py` 의 `pixelate` 를 쓴다(원본은 두고 편집본을 올린다).
  TRX 사진·다른 사람 인스타그램 캡처는 쓰지 않는다.

## 글 쓰는 원칙
건강·의학 내용은 주장마다 자료(대학병원 건강정보, 학회, 논문)를 찾아 대조하고, 확인 안 되는 내용은 빼거나 약하게 쓴다.
