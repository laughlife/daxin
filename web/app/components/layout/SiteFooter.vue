<script setup lang="ts">
import { siteConfig } from '~/config/site'
import { groupFooterServices } from '~/utils/footerServices'

const qrOpen = ref(false)
const qrGroup = ref<'tro' | 'labor'>('tro')
function enlargeQr(group: 'tro' | 'labor') { qrGroup.value = group; qrOpen.value = true }

/**
 * 网站 Footer：品牌信息 + 横向业务范围 + 双公众号二维码
 * + 联系方式 + 配置化备案信息与版权信息。
 *
 * 业务范围改为读取后台维护的 footer_services（需求要求「可点击业务项」），
 * 每项渲染为链接；服务端未返回数据时回退为 siteConfig 里的静态标签，
 * 保证页脚不出现整块空白。
 */
const { data: settings } = await useSiteSettings()

const footerServiceGroups = computed(() =>
  groupFooterServices(settings.value?.footer?.services ?? [], siteConfig.footerNav),
)

const footerIntro = computed(() => {
  const value = settings.value?.settings?.footer_intro
  return typeof value === 'string' && value.trim() ? value.trim() : siteConfig.footerIntro
})

const footerRegistration = computed(() => {
  const value = settings.value?.settings?.footer_registration
  return typeof value === 'string' ? value.trim() : ''
})

const qrSources = computed(() => {
  const values = settings.value?.settings ?? {}
  const primary = values.footer_qr_primary
  const secondary = values.footer_qr_secondary
  return {
    'tro-public': typeof primary === 'string' && primary.trim() ? primary.trim() : '',
    'labor-public': typeof secondary === 'string' && secondary.trim() ? secondary.trim() : '',
  }
})

/** 页脚 logo：优先用后台站点配置的 site_logo（新 logo）。 */
const logoSrc = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

/**
 * 站点名称与联系方式改为「后台配置优先、config 兜底」，
 * 后台「站点信息」里填了电话/邮箱/地址就会立即生效，不再是改了不生效。
 */
const identity = useSiteIdentity()
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
              :alt="identity.name"
            >
            <p v-else class="site-footer__name">{{ identity.name }}</p>
          </div>
          <p class="site-footer__subtitle">{{ footerIntro }}</p>
          <!-- 二维码下方只保留名称，不显示「扫码关注 · 获取资讯」 -->
          <ContactQrGrid
            kind="public"
            zoomable
            hide-name
            hide-note
            :sources="qrSources"
            class="site-footer__channels"
            @zoom="enlargeQr"
          />
        </section>

        <section class="site-footer__column" aria-label="业务范围">
          <div class="site-footer__service-groups">
            <section v-for="group in footerServiceGroups" :key="group.title" class="site-footer__service-group">
              <h3 class="site-footer__section-title">{{ group.title }}</h3>
              <ul class="site-footer__list">
                <li v-for="item in group.items" :key="item.itemKey">
                  <NuxtLink v-if="item.to" class="site-footer__service-link" :to="item.to">
                    {{ item.label }}
                  </NuxtLink>
                  <span v-else>{{ item.label }}</span>
                </li>
              </ul>
            </section>
          </div>
        </section>

        <section class="site-footer__column" aria-label="联系我们">
          <h3 class="site-footer__section-title">联系我们</h3>
          <dl class="site-footer__contact-list">
            <div><dt>微信</dt><dd>{{ identity.wechat }}</dd></div>
            <div><dt>电话</dt><dd><a :href="`tel:${identity.phone}`">{{ identity.phone }}</a></dd></div>
            <div><dt>邮箱</dt><dd><a :href="`mailto:${identity.email}`">{{ identity.email }}</a></dd></div>
            <div><dt>地址</dt><dd>{{ identity.address }}</dd></div>
          </dl>
        </section>
      </div>
    </PageContainer>

    <div class="site-footer__bottom">
      <PageContainer class="site-footer__bottom-inner">
        <p v-if="footerRegistration" class="site-footer__registration">{{ footerRegistration }}</p>
      </PageContainer>
    </div>
    <WechatQrModal :open="qrOpen" :group="qrGroup" kind="public" :sources="qrSources" @close="qrOpen = false" />
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
.site-footer__service-groups { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); }
.site-footer__service-group { display:flex; min-width:0; flex-direction:column; gap:var(--space-3); }
.site-footer__service-group .site-footer__section-title { font-size:var(--text-base); letter-spacing:0; }
.site-footer__section-title::after { content:''; display:block; width:28px; height:2px; margin:8px 0 0; background:var(--color-accent); }
.site-footer__list { display:flex; flex-direction:column; gap:var(--space-2); margin:0; padding:0; list-style:none; color:rgb(255 255 255 / 80%); }
.site-footer__service-link { color:rgb(255 255 255 / 80%); line-height:1.7; }
.site-footer__service-link:hover { color:var(--color-accent); }
.site-footer__channels { grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-6); margin:0; }
.site-footer__channels :deep(img) { width:100%; max-width:100px; }
.site-footer__contact-list { display:flex; flex-direction:column; gap:var(--space-3); margin:0; }
.site-footer__contact-list > div { display:flex; align-items:baseline; gap:var(--space-2); min-width:0; }
.site-footer__contact-list dt { flex-shrink:0; font-size:var(--text-sm); color:rgb(255 255 255 / 50%); }
.site-footer__contact-list dd { margin:0; color:rgb(255 255 255 / 85%); line-height:1.7; overflow-wrap:anywhere; }
.site-footer__contact-list a { color:inherit; }
.site-footer__contact-list a:hover { color:var(--color-accent); }
.site-footer__notice { margin-top:var(--space-3); font-size:var(--text-xs); color:rgb(255 255 255 / 45%); }
.site-footer__link { color:rgb(255 255 255 / 65%); }
.site-footer__link:hover { color:var(--color-text-inverse); }
.site-footer__bottom { border-top:1px solid rgb(255 255 255 / 15%); padding-block:var(--space-4); }
.site-footer__bottom-inner { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--space-2); text-align:center; color:rgb(255 255 255 / 55%); }
.site-footer__registration { display:flex; justify-content:center; margin:0; }
.site-footer__registration { color:rgb(255 255 255 / 70%); }
@media (max-width:1023px) {
  /* 窄屏：三列降为单列堆叠 */
  .site-footer__columns { grid-template-columns:1fr; gap:var(--space-6); }
  .site-footer__channels { max-width:280px; }
  .site-footer__bottom-inner { text-align:center; }
}
</style>
