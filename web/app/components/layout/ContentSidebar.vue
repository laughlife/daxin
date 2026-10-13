<script setup lang="ts">
import { computed } from 'vue'
import { useSiteSettings } from '~/composables/useSiteSettings'
import { normalizeContentSidebar, type SidebarQrGroup } from '~/utils/contentSettings'
import { useSiteIdentity } from '~/composables/useSiteIdentity'
import { qrSourcesFromAssets } from '~/utils/contactQr'

const props = withDefaults(defineProps<{ group?: SidebarQrGroup }>(), { group: 'all' })
const { data: siteSettings } = await useSiteSettings()
const identity = useSiteIdentity()

function settingValue(key: string): unknown {
  const value = siteSettings.value?.settings?.[key]
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const sidebarConfig = computed(() => normalizeContentSidebar(settingValue('content_sidebar')))
const qrGroup = computed<'tro' | 'labor'>(() => props.group === 'labor' ? 'labor' : 'tro')
const visibleFaqLinks = computed(() => sidebarConfig.value.faqLinks.filter((link) => {
  if (!link.enabled) return false
  if (props.group === 'tro' && link.key === 'labor') return false
  if (props.group === 'labor' && link.key === 'tro') return false
  return true
}))
const qrSources = computed(() => qrSourcesFromAssets(siteSettings.value?.footer.qr))
const sidebarPhone = computed(() => identity.value.phone.trim())
</script>

<template>
  <aside class="content-sidebar" aria-label="常见问题与公众号咨询">
    <section class="sidebar-card sidebar-card--faq">
      <h2>{{ sidebarConfig.faqTitle }}</h2>
      <ul class="sidebar-card__links">
        <li v-for="link in visibleFaqLinks" :key="link.key">
          <NuxtLink :to="link.path">{{ link.label }}</NuxtLink>
        </li>
      </ul>
    </section>

    <section class="sidebar-card sidebar-card--qr">
      <div class="sidebar-card__qr-block">
        <h2>{{ sidebarConfig.publicHeading }}</h2>
        <ContactQrGrid
          :group="qrGroup"
          kind="public"
          :sources="qrSources"
          :hide-name="true"
          :hide-note="true"
        />
      </div>
      <div class="sidebar-card__qr-block">
        <h2>{{ sidebarConfig.consultHeading }}</h2>
        <ContactQrGrid
          :group="qrGroup"
          kind="consult"
          :sources="qrSources"
          :hide-name="true"
          :hide-note="true"
        />
        <p v-if="sidebarPhone" class="sidebar-card__phone">
          电话咨询：<a :href="`tel:${sidebarPhone.replace(/[^\d+]/g, '')}`">{{ sidebarPhone }}</a>
        </p>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.content-sidebar { display:flex; flex-direction:column; gap:var(--space-5); }
.sidebar-card { padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.sidebar-card h2 { margin:0 0 var(--space-4); font-size:var(--text-lg); line-height:var(--leading-tight); }
.sidebar-card__links { display:flex; flex-direction:column; gap:var(--space-3); margin:0; padding:0; list-style:none; font-size:var(--text-sm); }
.sidebar-card__links li + li { padding-top:var(--space-3); border-top:1px solid var(--color-border); }
.sidebar-card__links a { color:var(--color-text); }
.sidebar-card__qr { display:flex; flex-direction:column; gap:var(--space-6); }
.sidebar-card__qr-block { min-width:0; }
.sidebar-card__qr-block :deep(.contact-qr-grid) { grid-template-columns:minmax(0,1fr); }
.sidebar-card__qr-block :deep(figure) { width:100%; }
.sidebar-card__qr-block :deep(img) { max-width:180px; }
.sidebar-card__phone { margin:var(--space-3) 0 0; text-align:center; color:var(--color-text-muted); font-size:var(--text-sm); }
.sidebar-card__phone a { color:var(--color-primary); font-weight:600; white-space:nowrap; }
@media(min-width:640px) and (max-width:1023px) { .content-sidebar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; } }
</style>
