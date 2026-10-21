<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { qrChannels } from '~/config/contactQr'
import { useSiteSettings } from '~/composables/useSiteSettings'
import type { FooterQrItem } from '~/repositories/settings'
import { normalizeLegalGuideSlides } from '~/utils/contentSettings'
import { qrImageForItemKey } from '~/utils/contactQr'

const { data: siteSettings } = await useSiteSettings()

function settingValue(key: string): unknown {
  const value = siteSettings.value?.settings?.[key]
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const slides = computed(() => {
  const all = normalizeLegalGuideSlides(settingValue('home_legal_guides'))
  /*
   * 未配置的章节不展示。
   * 之前缺图的章节会渲染一个空的「预留占位」框（.home-legal-guides__reserved），
   * 首页上看起来就多了一个没内容的「国际物流」分页。
   * 这里只保留有真实内容的章节（有配图 / 有正文段落 / 有领取说明），
   * 后台把第三块配好后会自动重新出现，不需要再改代码。
   */
  return all.filter(slide => Boolean(slide.image) || slide.paragraphs.length > 0 || Boolean(slide.benefit))
})
const currentIndex = ref(0)
function qrImageForSlide(slide: (typeof slides.value)[number]): string {
  const itemKey = slide.qrItemKey
  if (!itemKey) return ''
  const configured = qrImageForItemKey(siteSettings.value?.footer.qr as FooterQrItem[] | undefined, itemKey)
  if (configured) return configured
  return qrChannels.find(channel => channel.assetKey === itemKey)?.qrSrc ?? ''
}

let rotationTimer: ReturnType<typeof setTimeout> | undefined
let rotationPaused = false
let pointerInside = false
let focusInside = false

function clearRotationTimer() {
  if (rotationTimer) clearTimeout(rotationTimer)
  rotationTimer = undefined
}

function scheduleRotation() {
  clearRotationTimer()
  if (rotationPaused || slides.value.length < 2) return
  rotationTimer = setTimeout(() => {
    currentIndex.value = (currentIndex.value + 1) % slides.value.length
    scheduleRotation()
  }, 5000)
}

function pauseRotation() {
  rotationPaused = true
  clearRotationTimer()
}

function resumeRotation() {
  rotationPaused = false
  scheduleRotation()
}

function onPointerEnter() {
  pointerInside = true
  pauseRotation()
}

function onPointerLeave() {
  pointerInside = false
  if (!focusInside) resumeRotation()
}

function onFocusIn() {
  focusInside = true
  pauseRotation()
}

function onFocusOut(event: FocusEvent) {
  const container = event.currentTarget
  const nextTarget = event.relatedTarget
  if (container instanceof Node && nextTarget instanceof Node && container.contains(nextTarget)) return
  focusInside = false
  if (!pointerInside) resumeRotation()
}

function showSlide(index: number) {
  if (index < 0 || index >= slides.value.length || index === currentIndex.value) return
  currentIndex.value = index
  scheduleRotation()
}

onMounted(scheduleRotation)

onBeforeUnmount(() => {
  clearRotationTimer()
})
</script>

<template>
  <section v-if="slides.length" class="home-legal-guides" aria-label="普法干货">
    <PageContainer>
      <SectionHeading
        align="center"
        eyebrow="LEGAL GUIDES"
        title="普法干货"
      />

      <div
        class="home-legal-guides__carousel"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
      >
        <div class="home-legal-guides__stage">
          <article
            v-for="(slide, index) in slides"
            :key="slide.slug"
            class="home-legal-guides__panel"
            :class="[
              `home-legal-guides__panel--${slide.slug}`,
              { 'home-legal-guides__panel--active': currentIndex === index }
            ]"
            :style="{ '--guide-accent': slide.accent }"
            role="group"
            aria-roledescription="轮播项目"
            :aria-label="`${slide.category}主题`"
            :aria-hidden="currentIndex !== index"
          >
            <div v-if="slide.image" class="home-legal-guides__image">
              <img :src="slide.image" :alt="slide.imageAlt" loading="lazy">
            </div>
            <div v-else class="home-legal-guides__reserved" aria-hidden="true" />

            <div class="home-legal-guides__content">
              <h3 v-if="slide.title">{{ slide.title }}</h3>
              <template v-if="slide.paragraphs.length">
                <p v-for="(paragraph, paragraphIndex) in slide.paragraphs" :key="`${slide.slug}-${paragraphIndex}`" class="home-legal-guides__copy">
                  {{ paragraph }}
                </p>
              </template>
              <p v-else-if="slide.slug === 'logistics'" class="home-legal-guides__category">{{ slide.category }}</p>

              <div v-if="slide.benefit && qrImageForSlide(slide)" class="home-legal-guides__offer">
                <p class="home-legal-guides__benefit">
                  <span class="home-legal-guides__check" aria-hidden="true">✓</span>
                  <span>{{ slide.benefit }}</span>
                </p>
                <figure class="home-legal-guides__qr">
                  <img :src="qrImageForSlide(slide)" :alt="`${slide.category}咨询二维码`" width="112" height="112" loading="lazy">
                  <figcaption>添加领取</figcaption>
                </figure>
              </div>
            </div>
          </article>
        </div>

        <div class="home-legal-guides__indicators" role="group" aria-label="选择普法主题">
          <button
            v-for="(slide, index) in slides"
            :key="slide.slug"
            type="button"
            class="home-legal-guides__indicator"
            :class="{ 'home-legal-guides__indicator--active': currentIndex === index }"
            :style="{ '--guide-accent': slide.accent }"
            :aria-label="`查看${slide.category}主题`"
            :aria-current="currentIndex === index ? 'page' : undefined"
            @mouseenter="() => showSlide(index)"
            @focus="() => showSlide(index)"
            @click="() => showSlide(index)"
          />
        </div>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-legal-guides { padding-block:var(--space-section); background:var(--color-bg-page); }
.home-legal-guides__stage { display:grid; margin-top:var(--space-8); }
.home-legal-guides__panel {
  /* 原来这里是硬编码蓝 #216695，金色主题下会串色，改为跟主题主色走 */
  --guide-accent:var(--color-primary);
  display:grid;
  grid-area:1 / 1;
  grid-template-columns:minmax(240px,0.9fr) minmax(0,1.1fr);
  /* 需求 2026-10-20：外框缩短一点点，整体比例协调（原 420px） */
  min-height:370px;
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--guide-accent) 22%,white);
  border-radius:var(--radius-xl);
  color:var(--guide-accent);
  background:linear-gradient(115deg,color-mix(in srgb,var(--guide-accent) 4%,white),color-mix(in srgb,var(--guide-accent) 13%,white));
  box-shadow:var(--shadow-md);
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  transform:translateX(12px);
  transition:opacity .3s ease,transform .3s ease,visibility .3s;
}
.home-legal-guides__panel--active { z-index:1; opacity:1; visibility:visible; pointer-events:auto; transform:translateX(0); }
/*
 * 图片单元格用绝对定位托住图片。
 *
 * 为什么：图片是竖版（修剪后 859x1115），若按普通流布局，网格行会被图片的
 * 固有高度撑开——实测把面板从 441px 顶到 721px，反而更不高。
 * 绝对定位的图片不参与尺寸计算，面板高度只由右侧文字栏决定，
 * 图片再 object-fit: contain 填满这块区域，做到「框更矮、图更大」。
 */
.home-legal-guides__image { position:relative; min-height:370px; overflow:hidden; background:color-mix(in srgb,var(--guide-accent) 3%,white); }
.home-legal-guides__image img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:contain; }
.home-legal-guides__content { display:flex; min-width:0; flex-direction:column; align-items:flex-start; padding:clamp(18px,2.2vw,32px); }
.home-legal-guides__category { margin:0; font-size:clamp(28px,4vw,44px); font-weight:800; letter-spacing:0.08em; }
.home-legal-guides__content h3 { margin:0 0 var(--space-4); color:var(--guide-accent); font-size:clamp(22px,2.4vw,30px); line-height:1.3; }
.home-legal-guides__copy { margin:0 0 var(--space-3); color:color-mix(in srgb,var(--guide-accent) 76%,#202020); font-size:var(--text-base); line-height:1.85; }
.home-legal-guides__offer { display:flex; width:100%; align-items:center; justify-content:space-between; gap:var(--space-4); margin-top:auto; padding-top:var(--space-4); }
.home-legal-guides__benefit { display:flex; align-items:center; gap:var(--space-3); margin:0; color:var(--guide-accent); font-size:var(--text-base); font-weight:700; line-height:1.5; }
.home-legal-guides__check { display:grid; width:28px; height:28px; flex:0 0 28px; place-items:center; border:2px solid currentColor; border-radius:50%; font-size:17px; line-height:1; }
.home-legal-guides__qr { width:100px; flex:0 0 100px; margin:0; color:var(--guide-accent); text-align:center; }
.home-legal-guides__qr img { display:block; width:96px; height:96px; margin:auto; border:4px solid white; border-radius:8px; background:white; box-shadow:0 2px 12px rgb(20 20 30 / 14%); }
.home-legal-guides__qr figcaption { margin-top:6px; font-size:var(--text-xs); font-weight:700; }
.home-legal-guides__reserved { min-height:370px; border-right:1px solid color-mix(in srgb,var(--guide-accent) 16%,white); background:linear-gradient(145deg,white, color-mix(in srgb,var(--guide-accent) 10%,white)); }
.home-legal-guides__panel--logistics .home-legal-guides__content { align-items:center; justify-content:center; }
.home-legal-guides__indicators { display:flex; justify-content:center; gap:8px; margin-top:var(--space-4); }
.home-legal-guides__indicator { display:block; width:8px; height:8px; padding:0; border:0; border-radius:999px; background:var(--color-border-strong); cursor:pointer; transition:width .25s ease,background-color .25s ease; }
.home-legal-guides__indicator--active { width:24px; background:var(--guide-accent); }
.home-legal-guides__indicator:focus-visible { outline:2px solid var(--guide-accent); outline-offset:4px; }
@media(max-width:767px) {
  .home-legal-guides { padding-block:var(--space-section); }
  .home-legal-guides__panel { grid-template-columns:1fr; }
  .home-legal-guides__image { min-height:220px; height:220px; }
  .home-legal-guides__image img { max-height:220px; }
  .home-legal-guides__reserved { display:none; }
  .home-legal-guides__content { padding:var(--space-5); }
  .home-legal-guides__offer { align-items:center; }
  .home-legal-guides__qr { width:96px; flex-basis:96px; }
  .home-legal-guides__qr img { width:92px; height:92px; }
  .home-legal-guides__panel--logistics .home-legal-guides__content { min-height:180px; }
}
@media(prefers-reduced-motion:reduce) {
  .home-legal-guides__indicator,.home-legal-guides__panel { transition:none; }
}
</style>
