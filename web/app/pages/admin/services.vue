<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ServiceChildItem, ServiceSection } from '~/types/adminSettings'
import { apiErrorMessage, httpStatusOf } from '~/utils/publicApi'
import { SETTINGS_READ_ONLY_NOTICE, canWriteSettings, nextUniqueSlug } from '~/utils/adminPermission'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '团队业务配置', robots: 'noindex, nofollow' })

interface ServicesPayload { items: ServiceSection[] }
const requestFetch = useRequestFetch()
const { user } = useAdminSession()
const writable = computed(() => canWriteSettings(user.value?.roles))
const sections = ref<ServiceSection[]>([])
const baseline = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

function toText(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}
function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}
function toFlag(value: unknown): number { return value ? 1 : 0 }
function snapshot(): string { return JSON.stringify(sections.value) }
function applyPayload(payload: { data: ServicesPayload }) {
  sections.value = (payload?.data?.items ?? []).map(section => ({
    ...section,
    id: toNumber(section.id),
    slug: toText(section.slug),
    title: toText(section.title),
    subtitle: toText(section.subtitle),
    summary: toText(section.summary),
    iconKey: toText(section.iconKey),
    linkPath: toText(section.linkPath),
    showDetailLink: toFlag(section.showDetailLink),
    sortOrder: toNumber(section.sortOrder),
    status: toFlag(section.status),
    items: (Array.isArray(section.items) ? section.items : []).map(child => ({
      ...child,
      id: toNumber(child.id),
      slug: toText(child.slug),
      title: toText(child.title),
      summary: toText(child.summary),
      sortOrder: toNumber(child.sortOrder),
      status: toFlag(child.status)
    }))
  }))
  baseline.value = snapshot()
  return sections.value
}

const { error: loadError, refresh } = await useAsyncData(
  'admin-settings-services',
  () => requestFetch<{ data: ServicesPayload }>('/api/admin/settings', { query: { kind: 'services' } }),
  { transform: payload => applyPayload(payload) }
)
const dirty = computed(() => snapshot() !== baseline.value)
function canSave(): boolean { return writable.value && !saving.value && dirty.value && sections.value.length > 0 }
function saveLabel(): string {
  if (saving.value) return '保存中…'
  if (!writable.value) return '保存（只读角色不可用）'
  if (!sections.value.length) return '暂无可保存的板块'
  if (!dirty.value) return '保存（暂无修改）'
  return '保存'
}
function loadErrorMessage(): string {
  const message = apiErrorMessage(loadError.value)
  if (message) return message
  const status = httpStatusOf(loadError.value)
  if (status === 401) return '登录状态已失效，请重新登录后再试'
  if (status === 403) return '当前账号没有站点配置读取权限'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  return '核心业务配置加载失败，请稍后重试'
}

function buildPayload() {
  return sections.value.map((section, sectionIndex) => ({
    ...section,
    title: section.title,
    sortOrder: (sectionIndex + 1) * 10,
    items: section.items.map((child, childIndex) => ({
      ...child,
      title: child.title,
      sortOrder: (childIndex + 1) * 10
    }))
  }))
}
async function save() {
  if (!canSave()) return
  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''
  try {
    await requestFetch('/api/admin/settings', { method: 'PUT', body: { kind: 'services', items: buildPayload() } })
    saveSuccess.value = '业务范围已保存'
    await refresh()
  } catch (cause) {
    saveError.value = apiErrorMessage(cause) || '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
function moveItem<T>(items: T[], index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= items.length) return
  const [item] = items.splice(index, 1)
  if (item !== undefined) items.splice(target, 0, item)
  saveSuccess.value = ''
}
function moveSection(index: number, delta: number) { moveItem(sections.value, index, delta) }
function moveChild(section: ServiceSection, index: number, delta: number) { moveItem(section.items, index, delta) }
function usedSlugs(): string[] {
  return sections.value.flatMap(section => [section.slug, ...section.items.map(child => child.slug)])
}
function addSection() {
  const sortOrder = sections.value.length * 10 + 10
  sections.value.push({
    id: 0,
    slug: nextUniqueSlug('new-section', usedSlugs()),
    title: '',
    subtitle: '',
    summary: '',
    iconKey: 'scale',
    linkPath: '',
    showDetailLink: 0,
    sortOrder,
    status: 1,
    items: []
  })
  saveSuccess.value = ''
}
function addChild(section: ServiceSection) {
  const sortOrder = section.items.length * 10 + 10
  const child: ServiceChildItem = {
    id: 0,
    slug: nextUniqueSlug('new-child', usedSlugs()),
    title: '',
    summary: '',
    sortOrder,
    status: 1
  }
  section.items.push(child)
  saveSuccess.value = ''
}
</script>

<template>
  <PageContainer class="admin-services" size="wide">
    <header class="admin-services__head"><h1 class="admin-services__title">团队业务配置</h1></header>
    <p v-if="!writable" class="admin-services__readonly" role="note">{{ SETTINGS_READ_ONLY_NOTICE }}</p>
    <ErrorState v-if="loadError" title="核心业务配置加载失败" :message="loadErrorMessage()" @retry="refresh()" />
    <template v-else>
      <BaseCard
        v-for="(section, sectionIndex) in sections"
        :key="section.id || section.slug || sectionIndex"
        class="admin-services__section"
        :title="section.title || '新业务板块'"
        :title-level="2"
      >
        <div class="admin-services__title-row">
          <label class="admin-services__label" :for="`section-${sectionIndex}-title`">板块标题</label>
          <input :id="`section-${sectionIndex}-title`" v-model="section.title" class="admin-services__input" type="text" maxlength="128" :disabled="!writable || saving">
          <div class="admin-services__row-actions">
            <BaseButton variant="ghost" size="sm" :disabled="!writable || saving || sectionIndex === 0" @click="moveSection(sectionIndex, -1)">上移</BaseButton>
            <BaseButton variant="ghost" size="sm" :disabled="!writable || saving || sectionIndex === sections.length - 1" @click="moveSection(sectionIndex, 1)">下移</BaseButton>
          </div>
        </div>

        <section class="admin-services__children" :aria-label="`${section.title || '业务板块'}子项`">
          <div v-for="(child, childIndex) in section.items" :key="child.id || child.slug || childIndex" class="admin-services__child-row">
            <label class="admin-services__label" :for="`child-${sectionIndex}-${childIndex}-title`">子项标题</label>
            <input :id="`child-${sectionIndex}-${childIndex}-title`" v-model="child.title" class="admin-services__input" type="text" maxlength="128" :disabled="!writable || saving">
            <div class="admin-services__row-actions">
              <BaseButton variant="ghost" size="sm" :disabled="!writable || saving || childIndex === 0" @click="moveChild(section, childIndex, -1)">上移</BaseButton>
              <BaseButton variant="ghost" size="sm" :disabled="!writable || saving || childIndex === section.items.length - 1" @click="moveChild(section, childIndex, 1)">下移</BaseButton>
            </div>
          </div>
          <BaseButton variant="secondary" size="sm" :disabled="!writable || saving" @click="addChild(section)">新增子项</BaseButton>
        </section>
      </BaseCard>
      <BaseButton class="admin-services__add-section" variant="secondary" :disabled="!writable || saving" @click="addSection">新增业务板块</BaseButton>
      <p v-if="saveSuccess" class="admin-services__success" role="status">{{ saveSuccess }}</p>
      <p v-if="saveError" class="admin-services__error" role="alert">{{ saveError }}</p>
      <div class="admin-services__footer">
        <BaseButton :disabled="!canSave()" @click="save">{{ saveLabel() }}</BaseButton>
        <span v-if="saving" role="status">保存中，请勿关闭页面…</span>
        <span v-else-if="dirty && writable">有未保存的修改</span>
      </div>
    </template>
  </PageContainer>
</template>

<style scoped>
.admin-services { padding-block: var(--space-8) var(--space-16); }
.admin-services__head { margin-bottom: var(--space-6); }
.admin-services__title { font-size: var(--text-2xl); color: var(--color-text); }
.admin-services__readonly { margin-bottom: var(--space-5); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-warning) 8%, transparent); color: var(--color-warning); font-size: var(--text-sm); }
.admin-services__section { margin-top: var(--space-5); }
.admin-services__title-row, .admin-services__child-row { display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.admin-services__label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text); }
.admin-services__input { width: 100%; min-width: 0; padding: var(--space-3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-bg-page); color: var(--color-text); font: inherit; }
.admin-services__input:disabled { background: var(--color-bg-light); color: var(--color-text-muted); cursor: not-allowed; }
.admin-services__row-actions { display: flex; gap: var(--space-1); }
.admin-services__children { display: grid; gap: var(--space-3); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
.admin-services__child-row { padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-bg-light); }
.admin-services__add-section { margin-top: var(--space-5); }
.admin-services__footer { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-6); color: var(--color-text-muted); font-size: var(--text-sm); }
.admin-services__success, .admin-services__error { margin-top: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid; border-radius: var(--radius-md); font-size: var(--text-sm); }
.admin-services__success { border-color: var(--color-success); background: color-mix(in srgb, var(--color-success) 8%, transparent); color: var(--color-success); }
.admin-services__error { border-color: var(--color-error); background: color-mix(in srgb, var(--color-error) 8%, transparent); color: var(--color-error); }
@media (max-width: 720px) {
  .admin-services__title-row, .admin-services__child-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
  .admin-services__row-actions { justify-content: flex-start; }
}
</style>
