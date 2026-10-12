// 把首页首屏「动态背景」的帧序列合成一张可无缝循环的动画 WebP。
//
// 为什么要跨完整周期采样：
//   首屏背景里的漂浮光斑是 hero-float 动画，周期 14s、infinite。
//   若只截很短一段（如 1s）就循环，光斑位置会每次跳变，肉眼能看出接缝。
//   因此采满一个完整周期，让循环点回到同一相位。
//
// 为什么还要交叉淡入淡出：
//   采满周期后首尾相位虽一致，但采样与编码误差仍可能留下细微跳变，
//   末尾若干帧向起始帧做交叉淡化可以把接缝抹平。
//
// 参数（环境变量覆盖）：
//   FRAME_COUNT     帧数（默认 84）
//   FRAME_INTERVAL_MS 采样间隔（默认 167 ≈ 6fps）
//   FADE_FRAMES     末尾做交叉淡化的帧数（默认 6）
//   OUT_WIDTH       输出宽度（默认 1600）
//   WEBP_QUALITY    WebP 质量（默认 72）
//   MAX_BYTES       体积上限，超出则自动降宽/降质重试（默认 4MB）
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const python = process.env.DSH_PYTHON
  ?? 'C:\\Users\\1\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'

const framesDir = process.env.FRAMES_DIR ?? 'D:\\AppData\\hero-anim\\frames'
const outFile = process.env.OUT_FILE ?? 'D:\\AppData\\hero-anim\\hero-bg-animated.webp'
const outWidth = Number(process.env.OUT_WIDTH ?? 1600)
const quality = Number(process.env.WEBP_QUALITY ?? 72)
const fadeFrames = Number(process.env.FADE_FRAMES ?? 6)
const maxBytes = Number(process.env.MAX_BYTES ?? 4 * 1024 * 1024)
const fps = Number(process.env.FPS ?? 6)

if (!existsSync(framesDir)) {
  console.error(`帧目录不存在：${framesDir}`)
  process.exitCode = 1
} else {
  const frames = readdirSync(framesDir).filter((name) => name.endsWith('.png')).sort()
  console.log(`帧数 ${frames.length}，输出宽度 ${outWidth}，质量 ${quality}，帧率 ${fps}fps`)

  const script = `
from PIL import Image
import os, sys

frames_dir = ${JSON.stringify(framesDir)}
out_file = ${JSON.stringify(outFile)}
frames = sorted(f for f in os.listdir(frames_dir) if f.endswith('.png'))
out_width = ${outWidth}
quality = ${quality}
fade = ${fadeFrames}
fps = ${fps}
duration_ms = round(1000 / fps)
max_bytes = ${maxBytes}

def load(width, q):
    images = []
    for name in frames:
        img = Image.open(os.path.join(frames_dir, name)).convert('RGB')
        if img.width != width:
            h = round(img.height * width / img.width)
            img = img.resize((width, h), Image.LANCZOS)
        images.append(img)
    # 末尾 fade 帧向起始帧做交叉淡化，抹平循环接缝
    if fade > 0 and len(images) > fade:
        base = images[0]
        n = len(images)
        for k in range(fade):
            idx = n - fade + k
            alpha = (k + 1) / (fade + 1)
            images[idx] = Image.blend(images[idx], base, alpha)
    return images

for attempt in range(6):
    width = max(800, round(out_width * (0.85 ** attempt)))
    q = max(45, quality - attempt * 5)
    images = load(width, q)
    images[0].save(
        out_file, 'WEBP', save_all=True, append_images=images[1:],
        duration=duration_ms, loop=0, quality=q, method=6,
    )
    size = os.path.getsize(out_file)
    print(f'  尝试 {attempt + 1}: 宽 {width} 质量 {q} -> {round(size/1024, 1)} KB')
    if size <= max_bytes:
        print(f'  最终: {width}x{images[0].height} {round(size/1024,1)} KB')
        break
else:
    print('  已达重试上限，仍超出体积上限')
`
  const output = execFileSync(python, ['-c', script], { encoding: 'utf8' })
  console.log(output.trim())
  if (existsSync(outFile)) {
    console.log(`输出文件: ${outFile}（${Math.round(statSync(outFile).size / 1024)} KB）`)
  }
}
