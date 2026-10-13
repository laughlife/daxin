<script setup lang="ts">
import { computed } from 'vue'
import type { FooterQrItem } from '~/repositories/settings'
import { useSiteSettings } from '~/composables/useSiteSettings'
import { normalizeContentSidebar, type SidebarQrGroup } from '~/utils/contentSettings'

const props = withDefaults(defineProps<{ group?: SidebarQrGroup }>(), { group: 'all' })
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

const sidebarConfig = computed(() => normalizeContentSidebar(settingValue('content_sidebar')))
const qrGroup = computed<'tro' | 'labor'>(() => props.group === 'labor' ? 'labor' : 'tro')
const visibleFaqLinks = computed(() => sidebarConfig.value.faqLinks.filter((link) => {
  if (!link.enabled) return false
  if (props.group === 'tro' && link.key === 'labor') return false
  if (props.group === 'labor' && link.key === 'tro') return false
  return true
}))
const qrSources = computed<Record<string, string>>(() => {
  const qrItems: FooterQrItem[] = siteSettings.value?.footer.qr ?? []
  const imageFor = (itemKey: string) => qrItems.find(item => item.itemKey === itemKey)?.imageUrl ?? ''
  return {
    'tro-public': String(settingValue('footer_qr_primary') ?? ''),
    'labor-public': String(settingValue('footer_qr_secondary') ?? ''),
    'tro-consult': imageFor('qr-tro-consult'),
    'labor-consult': imageFor('qr-labor-consult'),
  }
})
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
      </div>
    </section>
  </aside>
</template>

<style scoped>
.content-sidebar { display:flex; flex-direction:column; gap:20px; }
.sidebar-card { background:white; border:1px solid var(--color-border); border-radius:12px; padding:20px; box-shadow:var(--shadow-sm); }
.sidebar-card h2 { margin:0 0 14px; font-size:16px; line-height:1.45; }
.sidebar-card__links { display:flex; flex-direction:column; gap:12px; margin:0; padding:0; list-style:none; font-size:14px; }
.sidebar-card__links li + li { border-top:1px solid var(--color-border); padding-top:12px; }
.sidebar-card__links a { color:var(--color-text); }
.sidebar-card__qr { display:flex; flex-direction:column; gap:24px; }
.sidebar-card__qr-block { min-width:0; }
.sidebar-card__qr-block :deep(.contact-qr-grid) { grid-template-columns:minmax(0,1fr); }
.sidebar-card__qr-block :deep(figure) { width:100%; }
.sidebar-card__qr-block :deep(img) { max-width:180px; }
@media(min-width:640px) and (max-width:1023px) { .content-sidebar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; } }
</style>
