<script setup lang="ts">
import { qrChannels } from '~/config/contactQr'
const props = withDefaults(defineProps<{
  group?: 'tro' | 'labor' | 'all'
  kind?: 'all' | 'public' | 'consult'
  zoomable?: boolean
  sources?: Record<string, string>
  hideName?: boolean
  /** 隐藏「扫码关注 · 获取资讯」这类操作说明，只保留二维码名称（页脚用）。 */
  hideNote?: boolean
}>(), { group: 'all', kind: 'all', hideName: false, hideNote: false, sources: () => ({}) })
const emit = defineEmits<{ zoom: [group: 'tro' | 'labor'] }>()
const channels = computed(() => qrChannels.filter(item => (props.group === 'all' || item.group === props.group) && (props.kind === 'all' || item.kind === props.kind)))
function qrSource(id: string, fallback: string) {
  return props.sources[id] || fallback
}
const grid = ref<HTMLElement | null>(null)
const twoLineIds = ref<string[]>([])
let observer: ResizeObserver | undefined

// 以完整短语测量宽度；同一对二维码共用行数，避免逐字折行和高低错位。
function updateCaptionRows() {
  const figures = Array.from(grid.value?.querySelectorAll<HTMLElement>('figure') ?? [])
  const ids: string[] = []
  for (let i = 0; i < figures.length; i += 2) {
    const pair = figures.slice(i, i + 2)
    const needsTwoLines = pair.some(figure => {
      const parts = Array.from(figure.querySelectorAll<HTMLElement>('.contact-qr-grid__phrase'))
      const width = parts.reduce((total, part) => total + part.getBoundingClientRect().width, 0) + 18
      return width > figure.clientWidth
    })
    if (needsTwoLines) pair.forEach(figure => ids.push(figure.dataset.qrId!))
  }
  if (ids.join(',') !== twoLineIds.value.join(',')) twoLineIds.value = ids
}

onMounted(() => {
  observer = new ResizeObserver(updateCaptionRows)
  if (grid.value) observer.observe(grid.value)
  updateCaptionRows()
  document.fonts.ready.then(() => { if (grid.value) updateCaptionRows() })
})
watch(channels, () => nextTick(updateCaptionRows))
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div ref="grid" class="contact-qr-grid" :class="{ 'contact-qr-grid--single': channels.length === 1 }">
    <figure v-for="channel in channels" :key="channel.id" :data-qr-id="channel.id">
      <button v-if="zoomable" type="button" class="contact-qr-grid__zoom" :aria-label="`放大${channel.name}二维码`" @click="emit('zoom', channel.group)">
        <img :src="qrSource(channel.id, channel.qrSrc)" :alt="`${channel.name}二维码`" width="160" height="160" loading="lazy">
      </button>
      <img v-else :src="qrSource(channel.id, channel.qrSrc)" :alt="`${channel.name}二维码`" width="160" height="160" loading="lazy">
      <figcaption v-if="!hideName || !hideNote">
        <strong v-if="!hideName">{{ channel.name }}</strong>
        <!-- 页脚只需要二维码名称，不需要「扫码关注 · 获取资讯」这类操作说明 -->
        <span v-if="!hideNote" class="contact-qr-grid__note" :class="{ 'contact-qr-grid__note--two': twoLineIds.includes(channel.id) }">
          <span class="contact-qr-grid__phrase">{{ channel.kind === 'public' ? '扫码关注' : '扫码咨询' }}</span>
          <span class="contact-qr-grid__separator" aria-hidden="true">·</span>
          <span class="contact-qr-grid__phrase">{{ channel.kind === 'public' ? '获取资讯' : '免费初步评估' }}</span>
        </span>
      </figcaption>
    </figure>
  </div>
</template>
<style scoped>
.contact-qr-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.contact-qr-grid__zoom { display:block; width:100%; padding:0; border:0; background:transparent; cursor:zoom-in; }
.contact-qr-grid__zoom:focus-visible { outline:2px solid var(--color-accent); outline-offset:4px; border-radius:8px; }
figure { margin:0; min-width:0; text-align:center; }
img { display:block; width:100%; max-width:180px; height:auto; aspect-ratio:1; object-fit:contain; margin:0 auto 8px; background:white; border:8px solid white; border-radius:8px; }
figcaption { display:flex; flex-direction:column; gap:6px; font-size:12px; }
figcaption strong { font-size:14px; }
.contact-qr-grid__note { display:flex; justify-content:center; align-items:center; gap:6px; line-height:1.6; }
.contact-qr-grid__phrase { white-space:nowrap; flex-shrink:0; }
.contact-qr-grid__note--two { flex-direction:column; gap:0; }
.contact-qr-grid__note--two .contact-qr-grid__separator { display:none; }
.contact-qr-grid--single { grid-template-columns:1fr; }
.contact-qr-grid--single img { max-width:240px; }
</style>
