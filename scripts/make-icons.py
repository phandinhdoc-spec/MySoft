#!/usr/bin/env python3
"""Vẽ biểu tượng PVTA: hình tròn mực tím, chữ PVTA ở giữa (phông Montserrat ExtraBold).

Dùng:
  npm i --no-save @fontsource/montserrat        # lấy phông (hoặc truyền đường dẫn .woff/.ttf)
  python3 scripts/make-icons.py [đường-dẫn-phông]

Tạo: addin/public/icon-{16,32,64,80,128}.png (nền trong suốt) và scripts/windows/pvta.ico.
Cần: pip install pillow fonttools
"""
import io
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "addin" / "public"
ICO = ROOT / "scripts" / "windows" / "pvta.ico"
DEFAULT_FONT = ROOT / "node_modules" / "@fontsource" / "montserrat" / "files" / "montserrat-latin-800-normal.woff"

TEXT = "PVTA"
TOP = (125, 94, 214)  # tím sáng (góc trên trái)
BOTTOM = (52, 34, 108)  # tím đậm (góc dưới phải)
SS = 1024  # vẽ ở khổ lớn rồi thu nhỏ cho mịn


def load_font(path: Path) -> bytes:
    """Trả về dữ liệu TTF (đọc .woff/.woff2 rồi bỏ lớp nén)."""
    f = TTFont(str(path))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


def gradient(size: int) -> Image.Image:
    """Chuyển sắc chéo từ góc trên trái xuống góc dưới phải."""
    # linear_gradient chạy đen -> trắng từ trên xuống; chuyển vị cho ra bản trái -> phải, lấy trung bình hai bản.
    vertical = Image.linear_gradient("L").resize((size, size), Image.BICUBIC)
    horizontal = vertical.transpose(Image.Transpose.TRANSPOSE)
    ramp = ImageChops.add(horizontal, vertical, scale=2.0)
    top = Image.new("RGB", (size, size), TOP)
    bottom = Image.new("RGB", (size, size), BOTTOM)
    return Image.composite(bottom, top, ramp)


def tracked_width(font: ImageFont.FreeTypeFont, text: str, track: float) -> float:
    return sum(font.getlength(c) for c in text) + track * (len(text) - 1)


def draw_icon(font_bytes: bytes, out_px: int) -> Image.Image:
    small = out_px <= 32
    d = SS
    img = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    # Nền tròn có chuyển sắc.
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, d - 3, d - 3), fill=255)
    img.paste(gradient(d), (0, 0), mask)
    draw = ImageDraw.Draw(img)
    # Viền trong mảnh, chỉ ở cỡ đủ lớn.
    if not small:
        inset = int(d * 0.075)
        w = max(2, int(d * 0.014))
        draw.ellipse((inset, inset, d - inset, d - inset), outline=(255, 255, 255, 120), width=w)
    # Chữ: bề ngang chiếm ~72% (cỡ lớn) hoặc ~82% (cỡ nhỏ) đường kính.
    target = d * (0.82 if small else 0.70)
    size = 200
    track = 0.0
    for _ in range(40):
        font = ImageFont.truetype(io.BytesIO(font_bytes), size)
        track = size * (0.02 if small else 0.06)
        w = tracked_width(font, TEXT, track)
        if abs(w - target) < 3:
            break
        size = max(10, int(size * target / w))
    font = ImageFont.truetype(io.BytesIO(font_bytes), size)
    track = size * (0.02 if small else 0.06)
    total = tracked_width(font, TEXT, track)
    # Căn giữa theo khung chữ in hoa thật (không theo dòng).
    asc_box = font.getbbox("PVTA")
    cap_h = asc_box[3] - asc_box[1]
    x = (d - total) / 2
    y = (d - cap_h) / 2 - asc_box[1] - d * 0.004
    for c in TEXT:
        draw.text((x, y), c, font=font, fill=(255, 255, 255, 255))
        x += font.getlength(c) + track
    # BOX = trung bình vùng: không gợn viền sẫm quanh chữ như LANCZOS.
    return img.resize((out_px, out_px), Image.Resampling.BOX)


def main() -> None:
    font_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FONT
    font_bytes = load_font(font_path)
    OUT.mkdir(parents=True, exist_ok=True)
    for px in (16, 32, 64, 80, 128):
        draw_icon(font_bytes, px).save(OUT / f"icon-{px}.png", optimize=True)
        print("icon", px)
    big = draw_icon(font_bytes, 256)
    ICO.parent.mkdir(parents=True, exist_ok=True)
    big.save(ICO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("ico", ICO)


if __name__ == "__main__":
    main()
