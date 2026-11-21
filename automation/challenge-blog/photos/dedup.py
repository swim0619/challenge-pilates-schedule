"""회원 사진이 이미 블로그에 올라간 사진과 같은지 dHash 로 비교한다.

사용: .venv/bin/python dedup.py <사진목록 list.txt> <발행글 사진 폴더>
발행글 사진은 PostView.naver HTML 에서 postfiles.pstatic.net 주소를 모아 '?type=w773' 을 붙여 내려받는다
(Referer: https://blog.naver.com/ 필요). 거리 45 이하면 같은 사진으로 본다. 연속으로 찍은 같은 장면도 빼야 한다.
"""
import sys, glob, os
from PIL import Image, ImageOps
def dhash(path, n=16):
    im = ImageOps.exif_transpose(Image.open(path)).convert("L").resize((n + 1, n), Image.LANCZOS)
    px = list(im.getdata()); bits = 0
    for r in range(n):
        for c in range(n):
            bits = (bits << 1) | (px[r * (n + 1) + c] > px[r * (n + 1) + c + 1])
    return bits
files = [f for f in open(sys.argv[1]).read().split("\n") if f]
pub = {os.path.basename(p): dhash(p) for p in glob.glob(sys.argv[2] + "/*.jpg") if os.path.getsize(p)}
for f in files:
    h = dhash(f)
    d, k = min((bin(h ^ v).count("1"), k) for k, v in pub.items())
    if d <= 45:
        print("이미 사용:", os.path.basename(f), "≈", k, "(거리 %d)" % d)
