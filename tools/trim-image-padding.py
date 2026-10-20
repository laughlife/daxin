# 裁掉 PNG 的透明边距，让主体填满画布。
#
# 背景：普法干货的书本图是带大量透明边距的 PNG（主体只占画布约 60% 高、62% 宽），
# 在容器里 contain 之后看起来「图很小」。用 scale 放大只会把主体裁掉，
# 正解是把透明边距裁掉。
#
# 用法：python tools/trim-image-padding.py <图片1> [图片2 ...] [--margin 比例]
import sys

from PIL import Image

args: list[str] = []
margin_ratio = 0.02
index = 0
while index < len(sys.argv[1:]):
    value = sys.argv[1:][index]
    if value == '--margin':
        margin_ratio = float(sys.argv[1:][index + 1])
        index += 2
        continue
    args.append(value)
    index += 1

for path in args:
    image = Image.open(path)
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    bbox = image.getchannel('A').getbbox()
    if not bbox:
        print(f'{path}: 全透明，跳过')
        continue

    left, top, right, bottom = bbox
    width, height = image.size
    pad_x = int((right - left) * margin_ratio)
    pad_y = int((bottom - top) * margin_ratio)
    box = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(width, right + pad_x),
        min(height, bottom + pad_y),
    )
    trimmed = image.crop(box)
    trimmed.save(path, optimize=True)
    print(f'{path}: {image.size} → {trimmed.size}  裁掉透明边距')
