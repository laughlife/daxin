# 提取 PDF 文本（含中文），输出到 txt 并打印概览。
# 用法：python tools/extract-pdf-text.py <pdf路径> [输出txt路径]
import sys

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer, LTAnno, LTChar

pdf_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else "tmp/pdf-extract.txt"

pages_text = []
char_count = 0
for page_no, layout in enumerate(extract_pages(pdf_path), start=1):
    chunks = []
    for element in layout:
        if isinstance(element, LTTextContainer):
            text = element.get_text()
            if text.strip():
                chunks.append(text)
                char_count += len(text)
    pages_text.append((page_no, "".join(chunks)))

with open(out_path, "w", encoding="utf-8") as fh:
    for page_no, text in pages_text:
        fh.write(f"\n{'=' * 70}\n第 {page_no} 页\n{'=' * 70}\n")
        fh.write(text)

print(f"页数: {len(pages_text)}")
print(f"提取字符数: {char_count}")
print(f"输出: {out_path}")
print()
for page_no, text in pages_text[:3]:
    print(f"--- 第 {page_no} 页前 500 字 ---")
    print(text[:500])
    print()
