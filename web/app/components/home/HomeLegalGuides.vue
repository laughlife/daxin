<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { qrChannels } from '~/config/contactQr'
import { useSiteSettings } from '~/composables/useSiteSettings'
import type { FooterQrItem } from '~/repositories/settings'
import { normalizeLegalGuideSlides } from '~/utils/contentSettings'

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

const slides = computed(() => normalizeLegalGuideSlides(settingValue('home_legal_guides')))
const currentIndex = ref(0)
const activeSlide = computed(() => slides.value[currentIndex.value] ?? slides.value[0]!)
const qrImage = computed(() => {
  const itemKey = activeSlide.value.qrItemKey
  if (!itemKey) return ''
  const configured = (siteSettings.value?.footer.qr ?? []).find((item: FooterQrItem) => item.itemKey === itemKey)?.imageUrl
  if (configured) return configured
  const fallbackId = itemKey === 'qr-labor-consult' ? 'labor-consult' : 'tro-consult'
  return qrChannels.find(channel => channel.id === fallbackId)?.qrSrc ?? ''
})
const guideStyle = computed(() => ({ '--guide-accent': activeSlide.value.accent }))

let rotationTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  rotationTimer = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % slides.value.length
  }, 5000)
})

onBeforeUnmount(() => {
  if (rotationTimer) clearInterval(rotationTimer)
})
</script>

<template>
  <section class="home-legal-guides" aria-label="普法干货">
    <PageContainer>
      <SectionHeading
        align="center"
        eyebrow="LEGAL GUIDES"
        title="普法干货"
        description="聚焦跨境经营中的常见法律问题，提供实用知识参考。"
      />

      <Transition name="home-legal-guides__slide" mode="out-in">
        <article
          :key="activeSlide.slug"
          class="home-legal-guides__panel"
          :class="`home-legal-guides__panel--${activeSlide.slug}`"
          :style="guideStyle"
          role="group"
          aria-roledescription="轮播项目"
          :aria-label="`${activeSlide.category}主题`"
        >
          <div v-if="activeSlide.image" class="home-legal-guides__image">
            <img :src="activeSlide.image" :alt="activeSlide.imageAlt" loading="lazy">
          </div>
          <div v-else class="home-legal-guides__reserved" aria-hidden="true" />

          <div class="home-legal-guides__content">
            <h3 v-if="activeSlide.title">{{ activeSlide.title }}</h3>
            <template v-if="activeSlide.paragraphs.length">
              <p v-for="(paragraph, index) in activeSlide.paragraphs" :key="`${activeSlide.slug}-${index}`" class="home-legal-guides__copy">
                {{ paragraph }}
              </p>
            </template>
            <p v-else-if="activeSlide.slug === 'logistics'" class="home-legal-guides__category">{{ activeSlide.category }}</p>

            <div v-if="activeSlide.benefit && qrImage" class="home-legal-guides__offer">
              <p class="home-legal-guides__benefit">
                <span class="home-legal-guides__check" aria-hidden="true">✓</span>
                <span>{{ activeSlide.benefit }}</span>
              </p>
              <figure class="home-legal-guides__qr">
                <img :src="qrImage" :alt="`${activeSlide.category}咨询二维码`" width="112" height="112" loading="lazy">
                <figcaption>添加领取</figcaption>
              </figure>
            </div>
          </div>
        </article>
      </Transition>

      <div class="home-legal-guides__indicators" aria-hidden="true">
        <span
          v-for="(slide, index) in slides"
          :key="slide.slug"
          class="home-legal-guides__indicator"
          :class="{ 'home-legal-guides__indicator--active': currentIndex === index }"
          :style="index === currentIndex ? guideStyle : undefined"
        />
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-legal-guides { padding-block:var(--space-16); background:var(--color-bg-page); }
.home-legal-guides__panel {
  --guide-accent:#216695;
  display:grid;
  grid-template-columns:minmax(260px,0.82fr) minmax(0,1.18fr);
  min-height:420px;
  margin-top:var(--space-8);
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--guide-accent) 22%,white);
  border-radius:var(--radius-xl);
  color:var(--guide-accent);
  background:linear-gradient(115deg,color-mix(in srgb,var(--guide-accent) 4%,white),color-mix(in srgb,var(--guide-accent) 13%,white));
  box-shadow:var(--shadow-md);
}
.home-legal-guides__image { display:grid; min-height:420px; place-items:center; overflow:hidden; background:color-mix(in srgb,var(--guide-accent) 3%,white); }
.home-legal-guides__image img { display:block; width:100%; height:100%; max-height:480px; object-fit:contain; }
.home-legal-guides__content { display:flex; min-width:0; flex-direction:column; align-items:flex-start; padding:clamp(24px,3vw,44px); }
.home-legal-guides__category { margin:0; font-size:clamp(28px,4vw,44px); font-weight:800; letter-spacing:0.08em; }
.home-legal-guides__content h3 { margin:0 0 var(--space-4); color:var(--guide-accent); font-size:clamp(26px,3vw,38px); line-height:1.3; }
.home-legal-guides__copy { margin:0 0 var(--space-3); color:color-mix(in srgb,var(--guide-accent) 76%,#202020); font-size:var(--text-base); line-height:1.85; }
.home-legal-guides__offer { display:flex; width:100%; align-items:flex-end; justify-content:space-between; gap:var(--space-4); margin-top:auto; padding-top:var(--space-4); }
.home-legal-guides__benefit { display:flex; align-items:center; gap:var(--space-3); margin:0; color:var(--guide-accent); font-size:var(--text-base); font-weight:700; line-height:1.5; }
.home-legal-guides__check { display:grid; width:28px; height:28px; flex:0 0 28px; place-items:center; border:2px solid currentColor; border-radius:50%; font-size:17px; line-height:1; }
.home-legal-guides__qr { width:116px; flex:0 0 116px; margin:0; color:var(--guide-accent); text-align:center; }
.home-legal-guides__qr img { display:block; width:112px; height:112px; margin:auto; border:4px solid white; border-radius:8px; background:white; box-shadow:0 2px 12px rgb(20 20 30 / 14%); }
.home-legal-guides__qr figcaption { margin-top:6px; font-size:var(--text-xs); font-weight:700; }
.home-legal-guides__reserved { min-height:420px; border-right:1px solid color-mix(in srgb,var(--guide-accent) 16%,white); background:linear-gradient(145deg,white, color-mix(in srgb,var(--guide-accent) 10%,white)); }
.home-legal-guides__panel--logistics .home-legal-guides__content { align-items:center; justify-content:center; }
.home-legal-guides__indicators { display:flex; justify-content:center; gap:8px; margin-top:var(--space-4); }
.home-legal-guides__indicator { width:8px; height:8px; border-radius:999px; background:var(--color-border-strong); transition:width .25s ease,background-color .25s ease; }
.home-legal-guides__indicator--active { width:24px; background:var(--guide-accent); }
.home-legal-guides__slide-enter-active,.home-legal-guides__slide-leave-active { transition:opacity .35s ease,transform .35s ease; }
.home-legal-guides__slide-enter-from { opacity:0; transform:translateX(18px); }
.home-legal-guides__slide-leave-to { opacity:0; transform:translateX(-18px); }
@media(max-width:767px) {
  .home-legal-guides { padding-block:var(--space-10); }
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
  .home-legal-guides__indicator,.home-legal-guides__slide-enter-active,.home-legal-guides__slide-leave-active { transition:none; }
}
</style>
