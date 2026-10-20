# 从渲染好的 PDF 页面 PNG 里裁剪指定区域并放大，便于看清截图细节。
# 用法：python tools/crop-pdf-region.py <输入png> <输出png> <left> <top> <right> <bottom> [放大倍数]
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
left, top, right, bottom = (int(v) for v in sys.argv[3:7])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0

image = Image.open(src).convert("RGB")
crop = image.crop((left, top, right, bottom))
if scale != 1.0:
    crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
crop.save(dst)
print(f"{dst}  {crop.width}x{crop.height}")
