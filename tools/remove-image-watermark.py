# 去除图片右下角水印：用同 x 区间的上方纹理填补，并羽化边缘。
#
# 为什么用「取上方纹理」而不是模糊涂抹：
#   这张图是竖向石柱纹理，纵向具有很强的连续性，取正上方的同宽条带
#   在纹理上几乎无缝；直接高斯模糊会留下一块明显发糊的矩形。
#
# 用法：python tools/remove-image-watermark.py <输入> <输出> <x0> <y0> <x1> <y1> [上方偏移]
import sys

from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = (int(v) for v in sys.argv[3:7])
# 源条带上移的距离：默认取水印区高度 + 20px，确保取到干净区域
shift = int(sys.argv[7]) if len(sys.argv) > 7 else (y1 - y0) + 20

image = Image.open(src).convert("RGB")
w, h = image.size
x0, y0 = max(0, x0), max(0, y0)
x1, y1 = min(w, x1), min(h, y1)
bw, bh = x1 - x0, y1 - y0

sy0 = y0 - shift
sy1 = sy0 + bh
if sy0 < 0:
    raise SystemExit(f"上方空间不足：需要 {shift}px，实际只有 {y0}px")

patch = image.crop((x0, sy0, x1, sy1))
# 轻微模糊，抹掉上下条带之间的细微亮度差
patch = patch.filter(ImageFilter.GaussianBlur(1.2))

# 羽化遮罩：中心实心、四边渐隐，避免出现硬边矩形
mask = Image.new("L", (bw, bh), 0)
feather = max(2, min(12, bw // 12, bh // 6))
mask_pixels = mask.load()
for y in range(bh):
    for x in range(bw):
        dx = min(x, bw - 1 - x)
        dy = min(y, bh - 1 - y)
        edge = min(dx, dy)
        value = 255 if edge >= feather else int(255 * edge / feather)
        mask_pixels[x, y] = value

image.paste(patch, (x0, y0), mask)
image.save(dst, quality=94, subsampling=1)
print(f"已去除水印并保存：{dst}  区域=({x0},{y0})-({x1},{y1})  源偏移={shift}px")
