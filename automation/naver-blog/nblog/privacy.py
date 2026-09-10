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


def pixelate(src, dst, boxes, ref_size, blocks=12, pad=0.12, quality=92):
    """boxes 영역을 모자이크 처리해 dst 에 저장한다.

    blocks: 모자이크 한 변에 들어갈 칸 수. 작을수록 굵게(더 알아보기 어렵게) 뭉갠다.
    """
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    for box in boxes:
        x0, y0, x1, y1 = _scale_box(box, im.size, ref_size, pad)
        w, h = x1 - x0, y1 - y0
        if w < 2 or h < 2:
            continue
        region = im.crop((x0, y0, x1, y1))
        small = region.resize((max(1, w // blocks), max(1, h // blocks)), Image.BILINEAR)
        im.paste(small.resize((w, h), Image.NEAREST), (x0, y0))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=quality)
    return dst


def preview(src, dst, max_side=800):
    """EXIF 회전을 반영한 미리보기. 여기서 잰 좌표를 pixelate 에 그대로 쓰면 된다."""
    im = ImageOps.exif_transpose(Image.open(src))
    im.thumbnail((max_side, max_side))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, quality=88)
    return im.size
