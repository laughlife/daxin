// 把提取出来的 Hero 背景帧优化成适合网页的 Banner 图片（PNG → 渐进式 JPEG）。
//
// 为什么需要：2x 截图的 PNG 约 1.5–1.7MB，作为网页 Banner 过重；
// 该图是大面积渐变，转成高质量 JPEG 后视觉几乎无差别，体积可降到几十 KB。
//
// 用法：node tools/optimize-banner-image.mjs <源PNG> <输出JPG> [目标宽度] [质量]
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const python = process.env.DSH_PYTHON
  ?? 'C:\\Users\\1\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'

const [src, dst, widthArg, qualityArg] = process.argv.slice(2)
if (!src || !dst) {
  console.error('用法：node tools/optimize-banner-image.mjs <源PNG> <输出JPG> [目标宽度=2000] [质量=88]')
  process.exitCode = 2
} else if (!existsSync(src)) {
  console.error(`源文件不存在：${src}`)
  process.exitCode = 1
} else {
  const width = Number(widthArg ?? 2000)
  const quality = Number(qualityArg ?? 88)

  // 用 Python + Pillow 处理：项目自带依赖里已有 Pillow，无需额外安装
  const script = `
from PIL import Image
import os
src, dst, width, quality = ${JSON.stringify(src)}, ${JSON.stringify(dst)}, ${width}, ${quality}
img = Image.open(src).convert('RGB')
print('原图:', img.size, round(os.path.getsize(src)/1024, 1), 'KB')
if img.width > width:
    height = round(img.height * width / img.width)
    img = img.resize((width, height), Image.LANCZOS)
img.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
print('输出:', img.size, round(os.path.getsize(dst)/1024, 1), 'KB')
`
  const output = execFileSync(python, ['-c', script], { encoding: 'utf8' })
  console.log(output.trim())
}
