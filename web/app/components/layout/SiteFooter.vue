<script setup lang="ts">
import { siteConfig } from '~/config/site'

const qrOpen = ref(false)
const qrGroup = ref<'tro' | 'labor'>('tro')
function enlargeQr(group: 'tro' | 'labor') { qrGroup.value = group; qrOpen.value = true }

/**
 * 网站 Footer：品牌信息 + 横向业务范围 + 双公众号二维码
 * + 联系方式 + ICP / 版权 / 隐私政策 / 免责声明占位。
 *
 * 业务范围改为读取后台维护的 footer_services（需求要求「可点击业务项」），
 * 每项渲染为链接；服务端未返回数据时回退为 siteConfig 里的静态标签，
 * 保证页脚不出现整块空白。
 */
const { data: settings } = await useSiteSettings()

const footerServices = computed(() => {
  const items = settings.value?.footer?.services ?? []
  return items.filter((item) => item.title)
})

/** 页脚 logo：优先用后台站点配置的 site_logo（新 logo）。 */
const logoSrc = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

/** 劳动法咨询微信号，从联系渠道读取，取不到时回退静态配置。 */
const laborWechat = computed(() => {
  const channel = (settings.value?.footer?.channels ?? []).find((item) => item.itemKey === 'contact-wechat-labor')
  return channel?.value
    || siteConfig.contact.wechatAccounts.find((item) => item.id === 'labor')?.wechatId
    || ''
})

/** 服务端暂无配置时的静态兜底（仅文案，不可点击）。 */
const fallbackGroups = computed(() => siteConfig.footerNav)
</script>

<template>
  <footer class="site-footer">
    <PageContainer class="site-footer__main">
      <!-- 三列竖排：①公司介绍 + logo + 两个公众号二维码 ②业务范围 ③联系我们 -->
      <div class="site-footer__columns">
        <section class="site-footer__column site-footer__column--brand" aria-label="公司介绍">
          <div class="site-footer__identity">
            <img
              v-if="logoSrc"
              class="site-footer__logo-img"
              :src="logoSrc"
              :alt="siteConfig.name"
            >
            <p v-else class="site-footer__name">{{ siteConfig.name }}</p>
          </div>
          <p class="site-footer__subtitle">{{ siteConfig.footerIntro }}</p>
          <!-- 二维码下方只保留名称，不显示「扫码关注 · 获取资讯」 -->
          <ContactQrGrid
            kind="public"
            zoomable
            hide-note
            class="site-footer__channels"
            @zoom="enlargeQr"
          />
        </section>

        <section class="site-footer__column" aria-label="业务范围">
          <h3 class="site-footer__section-title">业务范围</h3>
          <ul v-if="footerServices.length > 0" class="site-footer__list">
            <li v-for="item in footerServices" :key="item.itemKey">
              <NuxtLink v-if="item.linkPath" class="site-footer__service-link" :to="item.linkPath">
                {{ item.title }}
              </NuxtLink>
              <span v-else>{{ item.title }}</span>
            </li>
          </ul>
          <ul v-else class="site-footer__list">
            <li v-for="group in fallbackGroups" :key="group.title">
              <span v-for="item in group.items" :key="item.label">{{ item.label }}</span>
            </li>
          </ul>
        </section>

        <section class="site-footer__column" aria-label="联系我们">
          <h3 class="site-footer__section-title">联系我们</h3>
          <dl class="site-footer__contact-list">
            <div><dt>微信</dt><dd>{{ laborWechat }}</dd></div>
            <div><dt>电话</dt><dd><a :href="`tel:${siteConfig.contact.phone}`">{{ siteConfig.contact.phone }}</a></dd></div>
            <div><dt>邮箱</dt><dd><a :href="`mailto:${siteConfig.contact.email}`">{{ siteConfig.contact.email }}</a></dd></div>
            <div><dt>地址</dt><dd>{{ siteConfig.contact.address }}</dd></div>
          </dl>
        </section>
      </div>
    </PageContainer>

    <div class="site-footer__bottom">
      <PageContainer class="site-footer__bottom-inner">
        <p class="site-footer__legal">
          <span>{{ siteConfig.legal.icp }}</span>
          <span>{{ siteConfig.legal.copyright }}</span>
        </p>
        <p class="site-footer__policies">
          <NuxtLink :to="siteConfig.legal.privacyLink.to ?? '/'" class="site-footer__link">
            {{ siteConfig.legal.privacyLink.label }}
          </NuxtLink>
          <NuxtLink :to="siteConfig.legal.disclaimerLink.to ?? '/'" class="site-footer__link">
            {{ siteConfig.legal.disclaimerLink.label }}
          </NuxtLink>
        </p>
      </PageContainer>
    </div>
    <WechatQrModal :open="qrOpen" :group="qrGroup" kind="public" @close="qrOpen = false" />
  </footer>
</template>

<style scoped>
.site-footer { background:var(--color-bg-dark); color:var(--color-text-inverse); font-size:var(--text-sm); }
.site-footer__main { display:flex; flex-direction:column; gap:var(--space-6); padding-block:var(--space-8); }

/* 三列竖排：品牌（logo + 简介 + 二维码）/ 业务范围 / 联系我们 */
.site-footer__columns { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr); gap:var(--space-8); }
.site-footer__column { display:flex; flex-direction:column; gap:var(--space-4); min-width:0; }
.site-footer__column--brand { gap:var(--space-5); }
.site-footer__identity { display:flex; align-items:center; gap:var(--space-3); }
.site-footer__logo-img { height:52px; width:auto; }
.site-footer__name { font-size:var(--text-2xl); font-weight:700; }
.site-footer__subtitle { margin:0; max-width:460px; line-height:var(--leading-relaxed); color:rgb(255 255 255 / 65%); }

/* 下：三项竖排 */
.site-footer__columns { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:var(--space-8); padding-top:var(--space-6); border-top:1px solid rgb(255 255 255 / 15%); }
.site-footer__column { display:flex; flex-direction:column; gap:var(--space-4); min-width:0; }
.site-footer__section-title { font-size:var(--text-lg); font-weight:600; color:var(--color-text-inverse); text-align:left; letter-spacing:0.08em; padding-top:4px; }
.site-footer__section-title::after { content:''; display:block; width:28px; height:2px; margin:8px 0 0; background:var(--color-accent); }
.site-footer__list { display:flex; flex-direction:column; gap:8px; margin:0; padding:0; list-style:none; color:rgb(255 255 255 / 80%); }
.site-footer__service-link { color:rgb(255 255 255 / 80%); line-height:1.7; }
.site-footer__service-link:hover { color:var(--color-accent); }
.site-footer__channels { grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-6); margin:0; }
.site-footer__channels :deep(img) { width:100%; max-width:100px; }
.site-footer__contact-list { display:flex; flex-direction:column; gap:10px; margin:0; }
.site-footer__contact-list > div { display:flex; align-items:baseline; gap:8px; min-width:0; }
.site-footer__contact-list dt { flex-shrink:0; font-size:var(--text-sm); color:rgb(255 255 255 / 50%); }
.site-footer__contact-list dd { margin:0; color:rgb(255 255 255 / 85%); line-height:1.7; overflow-wrap:anywhere; }
.site-footer__contact-list a { color:inherit; }
.site-footer__contact-list a:hover { color:var(--color-accent); }
.site-footer__notice { margin-top:var(--space-3); font-size:var(--text-xs); color:rgb(255 255 255 / 45%); }
.site-footer__link { color:rgb(255 255 255 / 65%); }
.site-footer__link:hover { color:var(--color-text-inverse); }
.site-footer__bottom { border-top:1px solid rgb(255 255 255 / 15%); padding-block:var(--space-4); }
.site-footer__bottom-inner { display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); flex-wrap:wrap; color:rgb(255 255 255 / 55%); }
.site-footer__legal, .site-footer__policies { display:flex; gap:var(--space-4); flex-wrap:wrap; }
@media (max-width:1023px) {
  /* 窄屏：三列降为单列堆叠 */
  .site-footer__columns { grid-template-columns:1fr; gap:var(--space-6); }
  .site-footer__channels { max-width:280px; }
  .site-footer__bottom-inner { flex-direction:column; text-align:center; }
  .site-footer__legal, .site-footer__policies { justify-content:center; }
}
</style>
