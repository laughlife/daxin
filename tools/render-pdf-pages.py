# 把 PDF 每页渲染成 PNG，便于查看配色与样式截图。
# 用法：python tools/render-pdf-pages.py <pdf路径> <输出目录> [dpi]
import sys
from pathlib import Path

import pymupdf

pdf_path = sys.argv[1]
out_dir = Path(sys.argv[2])
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 130
out_dir.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(pdf_path)
print(f"页数: {doc.page_count}")
for index in range(doc.page_count):
    page = doc.load_page(index)
    scale = dpi / 72
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale))
    target = out_dir / f"page-{index + 1}.png"
    pix.save(target)
    print(f"  page-{index + 1}.png  {pix.width}x{pix.height}  {target.stat().st_size // 1024}KB")
doc.close()
