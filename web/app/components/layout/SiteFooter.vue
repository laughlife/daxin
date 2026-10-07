<script setup lang="ts">
import { siteConfig } from '~/config/site'

/**
 * 网站 Footer：品牌信息 + 横向业务范围 + 双公众号二维码
 * + 联系方式 + ICP / 版权 / 隐私政策 / 免责声明占位。
 * 导航与联系方式数据来自 siteConfig，不硬编码。
 */
</script>

<template>
  <footer class="site-footer">
    <PageContainer class="site-footer__main">
      <div class="site-footer__brand">
        <span class="site-footer__logo" aria-hidden="true">{{ siteConfig.logo.text }}</span>
        <p class="site-footer__name">{{ siteConfig.name }}</p>
        <p class="site-footer__subtitle">大信法务团队深耕跨境电商与国际物流法律服务，覆盖海运、空运、TRO 知识产权、用工劳动合规及合同风控。</p>
        <ContactQrGrid kind="public" class="site-footer__channels" />
      </div>

      <section class="site-footer__nav" aria-label="业务范围">
        <div
          v-for="group in siteConfig.footerNav"
          :key="group.title"
          class="site-footer__nav-group"
        >
          <ul>
            <li v-for="item in group.items" :key="item.label">
              {{ item.label }}
            </li>
          </ul>
        </div>
      </section>

      <div class="site-footer__contact" aria-label="联系我们">
        <ul class="site-footer__contact-list">
          <li>地址：{{ siteConfig.contact.address }}</li>
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>微信：{{ siteConfig.contact.wechatAccounts.find(channel => channel.id === 'labor')?.wechatId }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
        </ul>
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
  </footer>
</template>

<style scoped>
.site-footer { background:var(--color-bg-dark); color:var(--color-text-inverse); font-size:var(--text-sm); }
.site-footer__main { display:flex; flex-direction:column; gap:var(--space-8); padding-block:var(--space-12); }
.site-footer__brand { display:flex; flex-direction:column; align-items:center; text-align:center; gap:var(--space-3); }
.site-footer__logo { display:inline-flex; align-items:center; justify-content:center; width:80px; height:80px; border-radius:var(--radius-lg); background:var(--color-primary); color:var(--color-text-on-primary); font-size:var(--text-3xl); font-weight:700; }
.site-footer__name { font-size:var(--text-3xl); font-weight:700; }
.site-footer__subtitle { max-width:760px; line-height:var(--leading-relaxed); color:rgb(255 255 255 / 65%); }
.site-footer__nav { display:flex; flex-wrap:wrap; justify-content:center; gap:var(--space-5) var(--space-8); padding-block:var(--space-6); border-block:1px solid rgb(255 255 255 / 15%); }
.site-footer__nav-group { display:flex; flex-direction:column; align-items:center; gap:var(--space-4); width:100%; }
.site-footer__nav-title { font-size:var(--text-base); color:var(--color-text-inverse); flex-shrink:0; }
.site-footer__nav ul { display:flex; flex-wrap:wrap; justify-content:center; gap:var(--space-3) var(--space-6); max-width:920px; color:rgb(255 255 255 / 65%); list-style:none; padding:0; }
.site-footer__contact { text-align:center; }
.site-footer__contact > h3 { margin-bottom:var(--space-6); font-size:var(--text-xl); }
.site-footer__channels { grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; max-width:440px; margin:var(--space-4) auto 0; gap:var(--space-6); }
.site-footer__channels :deep(img) { width:100%; max-width:180px; }
.site-footer__contact-list { display:flex; flex-direction:column; align-items:center; gap:var(--space-3); color:rgb(255 255 255 / 65%); list-style:none; padding:0; overflow-wrap:anywhere; }
.site-footer__contact-list li { max-width:100%; line-height:var(--leading-relaxed); }
.site-footer__notice { margin-top:var(--space-3); font-size:var(--text-xs); color:rgb(255 255 255 / 45%); }
.site-footer__link { color:rgb(255 255 255 / 65%); }
.site-footer__link:hover { color:var(--color-text-inverse); }
.site-footer__bottom { border-top:1px solid rgb(255 255 255 / 15%); padding-block:var(--space-4); }
.site-footer__bottom-inner { display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); flex-wrap:wrap; color:rgb(255 255 255 / 55%); }
.site-footer__legal, .site-footer__policies { display:flex; gap:var(--space-4); flex-wrap:wrap; }
@media (max-width:767px) {
  .site-footer__channels { grid-template-columns:repeat(2,minmax(0,1fr)); max-width:440px; }
  .site-footer__nav { justify-content:center; }
  .site-footer__nav-group { width:100%; flex-direction:column; gap:var(--space-2); }
  .site-footer__contact-list { flex-direction:column; overflow-wrap:anywhere; }
  .site-footer__bottom-inner { flex-direction:column; text-align:center; }
  .site-footer__legal, .site-footer__policies { justify-content:center; }
}
</style>
