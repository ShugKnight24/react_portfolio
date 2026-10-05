#!/usr/bin/env python3
"""Make web-sized copies of the photos in public/img/photos (needs Pillow).

For every <name>.jpg original (left untouched: it is the lightbox image and the download):
  <name>-thumb.jpg     900px on the long edge, progressive JPEG, the fallback
  <name>-thumb.webp    900px on the long edge, WebP, what the grids load
Thumbs are encoded at the highest quality that fits their budget (busy photos get a lower one).
Video posters (<name>-poster.jpg) get a WebP twin. The large portraits used as page heroes
get <name>-<width>.webp sizes for their srcsets (see RESPONSIVE).

Outputs newer than their source are skipped; pass --force to rebuild everything.
Run: python3 scripts/optimize_images.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

IMG = Path(__file__).resolve().parent.parent / 'public' / 'img'
ROOT = IMG / 'photos'
THUMB_EDGE = 900
THUMB_BUDGET = {'.webp': 60 * 1024, '.jpg': 75 * 1024}
RESPONSIVE = {
    ROOT / 'me' / 'shug-luna-car-smile.jpg': (640, 1000),
    IMG / 'shug_bpak.jpg': (600, 1000),
    IMG / 'jbp_shug.jpg': (800,),
}
FORCE = '--force' in sys.argv


def stale(src: Path, out: Path) -> bool:
    return FORCE or not out.exists() or out.stat().st_mtime < src.stat().st_mtime


def load(src: Path) -> Image.Image:
    # Bake in EXIF rotation, since the outputs carry no EXIF
    return ImageOps.exif_transpose(Image.open(src)).convert('RGB')


def save(image: Image.Image, out: Path, quality: int) -> None:
    if out.suffix == '.webp':
        image.save(out, 'WEBP', quality=quality, method=6)
    else:
        image.save(out, 'JPEG', quality=quality, optimize=True, progressive=True)
    print(f'  {out.relative_to(IMG)}  q{quality}  {out.stat().st_size // 1024} KB')


def save_within_budget(image: Image.Image, out: Path, quality: int, floor: int = 40) -> None:
    while True:
        save(image, out, quality)
        if quality <= floor or out.stat().st_size <= THUMB_BUDGET[out.suffix]:
            return
        quality -= 6


def resized(image: Image.Image, edge: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((edge, edge), Image.LANCZOS)
    return copy


for src in sorted(ROOT.glob('*/*.jpg')):
    name = src.stem
    if name.endswith('-thumb'):
        continue
    if name.endswith('-poster'):
        out = src.with_suffix('.webp')
        if stale(src, out):
            save(load(src), out, 72)
        continue

    thumb_jpg = src.with_name(f'{name}-thumb.jpg')
    thumb_webp = src.with_name(f'{name}-thumb.webp')
    if not any(stale(src, out) for out in (thumb_jpg, thumb_webp)):
        continue
    thumb = resized(load(src), THUMB_EDGE)
    save_within_budget(thumb, thumb_jpg, 72)
    save_within_budget(thumb, thumb_webp, 70)

for src, widths in RESPONSIVE.items():
    for width in widths:
        out = src.with_name(f'{src.stem}-{width}.webp')
        if stale(src, out):
            image = load(src)
            size = (width, round(image.height * width / image.width))
            save(image.resize(size, Image.LANCZOS), out, 76)
