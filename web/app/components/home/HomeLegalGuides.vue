<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface GuideSlide {
  slug: 'tro' | 'labor' | 'logistics'
  category: string
  title: string
  paragraphs: string[]
  image?: string
  imageAlt?: string
  benefit?: string
  qr?: string
}

const guideSlides: GuideSlide[] = [
  {
    slug: 'tro',
    category: '跨境tro',
    title: '《破解TRO跨境难题》',
    paragraphs: [
      '卖家最头疼的跨境困局：被美国律所起诉、店铺被锁、资金冻结、链接强制下架，若不及时处理，很可能钱店两空，我们专注各类TRO案件，提供低价和解、资金解冻、店铺解封等服务；同行搞不定的疑难案件，也能高效破局',
    ],
    image: '/images/guides/tro.png',
    imageAlt: '跨境 TRO 法律指南',
    benefit: '历年TRO侵权案例集锦',
    qr: '/images/qr/tro-consult.png',
  },
  {
    slug: 'labor',
    category: '劳动法',
    title: '《懂法用工，规避风险》',
    paragraphs: [
      '还在忽视用工细节？结合近年劳动仲裁大数据，当前企业用工形势日趋严峻，核心风险集中在员工法律意识提升后离职时集中仲裁、企业因用工不规范频发高额赔付，以及事后补救困难且损害企业声誉这三点',
      '与其事后被动应对，不如提前合规布局，以懂法用工实现风险前置管理，护航企业稳健经营',
    ],
    image: '/images/guides/labor-law.png',
    imageAlt: '劳动用工合规指南',
    benefit: '免费领取《88项用工风险自查表》',
    qr: '/images/qr/labor-consult.png',
  },
  {
    slug: 'logistics',
    category: '国际物流',
    title: '',
    paragraphs: [],
  },
]

const currentIndex = ref(0)
const activeSlide = computed(() => guideSlides[currentIndex.value]!)
let rotationTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  rotationTimer = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % guideSlides.length
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
          role="group"
          aria-roledescription="轮播项目"
          :aria-label="`${activeSlide.category}主题`"
        >
          <div v-if="activeSlide.image" class="home-legal-guides__image">
            <img :src="activeSlide.image" :alt="activeSlide.imageAlt ?? ''" loading="lazy">
          </div>
          <div v-else class="home-legal-guides__reserved" aria-hidden="true" />

          <div class="home-legal-guides__content">
            <p v-if="activeSlide.slug === 'logistics'" class="home-legal-guides__category">{{ activeSlide.category }}</p>
            <h3 v-if="activeSlide.title">{{ activeSlide.title }}</h3>
            <template v-if="activeSlide.paragraphs.length">
              <p v-for="paragraph in activeSlide.paragraphs" :key="paragraph" class="home-legal-guides__copy">
                {{ paragraph }}
              </p>
            </template>

            <div v-if="activeSlide.benefit && activeSlide.qr" class="home-legal-guides__offer">
              <p class="home-legal-guides__benefit">
                <span class="home-legal-guides__check" aria-hidden="true">✓</span>
                <span>{{ activeSlide.benefit }}</span>
              </p>
              <figure class="home-legal-guides__qr">
                <img :src="activeSlide.qr" :alt="`${activeSlide.category}咨询二维码`" width="112" height="112" loading="lazy">
                <figcaption>添加领取</figcaption>
              </figure>
            </div>
          </div>
        </article>
      </Transition>

      <div class="home-legal-guides__indicators" aria-hidden="true">
        <span
          v-for="(slide, index) in guideSlides"
          :key="slide.slug"
          class="home-legal-guides__indicator"
          :class="{ 'home-legal-guides__indicator--active': currentIndex === index }"
        />
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-legal-guides {
  padding-block: var(--space-16);
  background: var(--color-bg-page);
}

.home-legal-guides__panel {
  display: grid;
  grid-template-columns: minmax(260px, 0.82fr) minmax(0, 1.18fr);
  min-height: 420px;
  margin-top: var(--space-8);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: white;
  box-shadow: var(--shadow-md);
}

.home-legal-guides__image {
  display: grid;
  min-height: 420px;
  place-items: center;
  overflow: hidden;
  background: white;
}

.home-legal-guides__image img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 480px;
  object-fit: contain;
}

.home-legal-guides__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  padding: clamp(24px, 3vw, 44px);
}

.home-legal-guides__category {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.home-legal-guides__content h3 {
  margin: 0 0 var(--space-4);
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.3;
}

.home-legal-guides__copy {
  margin: 0 0 var(--space-3);
  font-size: var(--text-base);
  line-height: 1.85;
}

.home-legal-guides__offer {
  display: flex;
  width: 100%;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: auto;
  padding-top: var(--space-4);
}

.home-legal-guides__benefit {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.5;
}

.home-legal-guides__check {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border: 2px solid currentColor;
  border-radius: 50%;
  font-size: 17px;
  line-height: 1;
}

.home-legal-guides__qr {
  width: 116px;
  flex: 0 0 116px;
  margin: 0;
  text-align: center;
}

.home-legal-guides__qr img {
  display: block;
  width: 112px;
  height: 112px;
  border: 4px solid white;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 12px rgb(20 20 30 / 14%);
}

.home-legal-guides__qr figcaption {
  margin-top: 6px;
  font-size: var(--text-xs);
  font-weight: 700;
}

.home-legal-guides__panel--tro { color: #642a86; background: linear-gradient(115deg, #fcf8ff, #f2e8fb); }
.home-legal-guides__panel--labor { color: #a84d18; background: linear-gradient(115deg, #fffaf3, #ffefd9); }
.home-legal-guides__panel--logistics { color: #216695; background: linear-gradient(115deg, #f4fbff, #e3f2fb); }
.home-legal-guides__panel--tro .home-legal-guides__image { background: #fbf8fd; }
.home-legal-guides__panel--labor .home-legal-guides__image { background: #fffaf3; }
.home-legal-guides__panel--tro .home-legal-guides__copy { color: #493359; }
.home-legal-guides__panel--labor .home-legal-guides__copy { color: #694323; }
.home-legal-guides__panel--logistics .home-legal-guides__reserved {
  min-height: 420px;
  border-right: 1px solid rgb(33 102 149 / 12%);
  background: linear-gradient(145deg, rgb(255 255 255 / 48%), rgb(190 224 244 / 34%));
}
.home-legal-guides__panel--logistics .home-legal-guides__content {
  align-items: center;
  justify-content: center;
}
.home-legal-guides__panel--logistics .home-legal-guides__category {
  font-size: clamp(28px, 4vw, 44px);
  letter-spacing: 0.08em;
}

.home-legal-guides__indicators {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: var(--space-4);
}

.home-legal-guides__indicator {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-border-strong);
  transition: width 0.25s ease, background-color 0.25s ease;
}

.home-legal-guides__indicator--active {
  width: 24px;
  background: var(--color-primary);
}

.home-legal-guides__slide-enter-active,
.home-legal-guides__slide-leave-active { transition: opacity 0.35s ease, transform 0.35s ease; }
.home-legal-guides__slide-enter-from { opacity: 0; transform: translateX(18px); }
.home-legal-guides__slide-leave-to { opacity: 0; transform: translateX(-18px); }

@media (max-width: 767px) {
  .home-legal-guides { padding-block: var(--space-10); }
  .home-legal-guides__panel { grid-template-columns: 1fr; }
  .home-legal-guides__image { min-height: 220px; height: 220px; }
  .home-legal-guides__image img { max-height: 220px; }
  .home-legal-guides__reserved { display: none; }
  .home-legal-guides__content { padding: var(--space-5); }
  .home-legal-guides__offer { align-items: center; }
  .home-legal-guides__qr { width: 96px; flex-basis: 96px; }
  .home-legal-guides__qr img { width: 92px; height: 92px; }
  .home-legal-guides__panel--logistics .home-legal-guides__content { min-height: 180px; }
}

@media (prefers-reduced-motion: reduce) {
  .home-legal-guides__indicator,
  .home-legal-guides__slide-enter-active,
  .home-legal-guides__slide-leave-active { transition: none; }
}
</style>
