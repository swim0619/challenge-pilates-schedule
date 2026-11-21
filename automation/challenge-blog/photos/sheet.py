"""사진 폴더를 번호가 적힌 미리보기 판(6x4)으로 만든다. 사진을 한눈에 보고 고를 때 쓴다.

사용: .venv/bin/python sheet.py <사진폴더> <결과폴더>
"""
import sys, glob, os
from PIL import Image, ImageOps, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
files = sorted(f for f in glob.glob(src + "/*") if f.lower().endswith((".jpg", ".jpeg", ".png")))
open(out + "/list.txt", "w").write("\n".join(files))
W, H, C, R = 300, 300, 6, 4
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
for n in range(0, len(files), C * R):
    sheet = Image.new("RGB", (W * C, (H + 26) * R), "white"); d = ImageDraw.Draw(sheet)
    for k, f in enumerate(files[n:n + C * R]):
        try:
            im = ImageOps.exif_transpose(Image.open(f)).convert("RGB"); im.thumbnail((W - 6, H - 6))
        except Exception:
            continue
        x, y = (k % C) * W, (k // C) * (H + 26)
        sheet.paste(im, (x + (W - im.width) // 2, y + (H - im.height) // 2))
        d.text((x + 6, y + H + 2), os.path.basename(f).replace("IMG_", "").split(".")[0], fill="black", font=font)
    sheet.save(out + "/s%02d.jpg" % (n // (C * R)), quality=80)
print(len(files), "photos")
