"""사진에서 얼굴·차 번호판 같은 개인정보를 모자이크 처리한다.

원본은 절대 건드리지 않고 편집본을 따로 만든다.
좌표는 '미리보기 크기' 기준으로 주면 원본 해상도에 맞춰 알아서 확대한다.
"""

from pathlib import Path

from PIL import Image, ImageOps


def _scale_box(box, src_size, ref_size, pad):
    x0, y0, x1, y1 = box
    sx, sy = src_size[0] / ref_size[0], src_size[1] / ref_size[1]
    x0, x1 = x0 * sx, x1 * sx
    y0, y1 = y0 * sy, y1 * sy
    # 경계가 어긋나도 가려지도록 여유를 둔다
    dx, dy = (x1 - x0) * pad, (y1 - y0) * pad
    x0, y0 = max(0, x0 - dx), max(0, y0 - dy)
    x1 = min(src_size[0], x1 + dx)
    y1 = min(src_size[1], y1 + dy)
    return tuple(int(round(v)) for v in (x0, y0, x1, y1))


def pixelate(src, dst, boxes, ref_size, blocks=8, pad=0.12, quality=92):
    """boxes 영역을 모자이크 처리해 dst 에 저장한다.

    blocks: 영역의 가로를 몇 칸으로 쪼갤지. **작을수록 굵게 뭉갠다**.
      영역 크기와 무관하게 결과가 일정하다(8이면 어떤 크기든 가로 8칸).
      번호판·얼굴은 8 이하를 쓸 것. 예전에 이 값을 '축소 배율'로 계산해서
      4를 줬다가 겨우 4배만 축소돼 번호판이 그대로 읽힌 적이 있다.
    """
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    for box in boxes:
        x0, y0, x1, y1 = _scale_box(box, im.size, ref_size, pad)
        w, h = x1 - x0, y1 - y0
        if w < 2 or h < 2:
            continue
        region = im.crop((x0, y0, x1, y1))
        cols = max(1, min(blocks, w))
        rows = max(1, int(round(cols * h / w)))
        small = region.resize((cols, rows), Image.BILINEAR)
        im.paste(small.resize((w, h), Image.NEAREST), (x0, y0))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=quality)
    return dst


def grid(src, dst, box=None, ref_side=760, step=20, scale=3):
    """좌표 격자를 얹은 확대 이미지를 만든다.

    번호판처럼 작은 것은 눈대중으로 좌표를 잡으면 어긋난다.
    이걸로 한 번 보고 숫자를 읽어 pixelate 에 넣으면 한 번에 맞는다.
    box 는 미리보기 좌표 기준으로 들여다볼 영역.
    """
    from PIL import ImageDraw

    im = ImageOps.exif_transpose(Image.open(src))
    im.thumbnail((ref_side, ref_side))
    ox, oy = (box[0], box[1]) if box else (0, 0)
    if box:
        im = im.crop(box)
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for gx in range(0, im.width, step * scale):
        d.line([(gx, 0), (gx, im.height)], fill=(255, 0, 0), width=1)
        d.text((gx + 2, 2), str(ox + gx // scale), fill=(255, 0, 0))
    for gy in range(0, im.height, step * scale):
        d.line([(0, gy), (im.width, gy)], fill=(0, 128, 255), width=1)
        d.text((2, gy + 2), str(oy + gy // scale), fill=(0, 128, 255))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=93)
    return dst


def preview(src, dst, max_side=800):
    """EXIF 회전을 반영한 미리보기. 여기서 잰 좌표를 pixelate 에 그대로 쓰면 된다."""
    im = ImageOps.exif_transpose(Image.open(src))
    im.thumbnail((max_side, max_side))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=88)
    return im.size
