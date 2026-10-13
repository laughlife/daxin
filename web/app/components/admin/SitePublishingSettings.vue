<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FooterItem, QrItem } from '~/types/adminSettings'
import { canWriteSettings, nextUniqueSlug } from '~/utils/adminPermission'
import { apiErrorMessage } from '~/utils/publicApi'

interface QrRow extends QrItem { uid: string }
interface FooterRow extends FooterItem { uid: string }

const REQUIRED_QR_CHANNELS = [
  { key: 'qr-tro-public', label: 'TRO 公众号' },
  { key: 'qr-labor-public', label: '劳动法公众号' },
  { key: 'qr-tro-consult', label: 'TRO 咨询号' },
  { key: 'qr-labor-consult', label: '劳动法咨询号' },
] as const

const requestFetch = useRequestFetch()
const { user } = useAdminSession()
const writable = computed(() => canWriteSettings(user.value?.roles))
const qrItems = ref<QrRow[]>([])
const footerItems = ref<FooterRow[]>([])
const qrBaseline = ref('')
const footerBaseline = ref('')
const savingKind = ref<'qr' | 'footer' | ''>('')
const qrError = ref('')
const footerError = ref('')
const qrSuccess = ref('')
const footerSuccess = ref('')
const uploading = ref<string[]>([])
let uid = 0
function nextUid(prefix: string) { uid += 1; return `${prefix}-${uid}` }

function qrSnapshot() {
  return JSON.stringify(qrItems.value.map(({ uid: _uid, ...item }) => item))
}
function footerSnapshot() {
  return JSON.stringify(footerItems.value.map(({ uid: _uid, ...item }) => item))
}
function applyQr(payload: { data?: { items?: QrItem[] } }) {
  const byKey = new Map((payload?.data?.items ?? []).map(item => [item.itemKey, item]))
  qrItems.value = REQUIRED_QR_CHANNELS.map((channel, index) => {
    const item = byKey.get(channel.key)
    return {
      uid: nextUid('qr'),
      id: Number(item?.id ?? 0),
      itemKey: channel.key,
      title: channel.label,
      mediaId: item?.mediaId ?? null,
      mediaUrl: item?.mediaUrl ?? '',
      caption: item?.caption ?? '',
      sortOrder: item?.sortOrder ?? (index + 1) * 10,
      status: 1,
    }
  })
  qrBaseline.value = qrSnapshot()
}
function applyFooter(payload: { data?: { items?: FooterItem[] } }) {
  footerItems.value = (payload?.data?.items ?? []).map(item => ({
    ...item,
    id: Number(item.id ?? 0),
    sortOrder: Number(item.sortOrder ?? 0),
    status: item.status ? 1 : 0,
    uid: nextUid('footer'),
  }))
  footerBaseline.value = footerSnapshot()
}

const { error: qrLoadError, refresh: refreshQr } = await useAsyncData(
  'admin-site-info-qr',
  () => requestFetch<{ data: { items: QrItem[] } }>('/api/admin/settings', { query: { kind: 'qr' } }),
  { transform: payload => { applyQr(payload); return true } },
)
const { error: footerLoadError, refresh: refreshFooter } = await useAsyncData(
  'admin-site-info-footer',
  () => requestFetch<{ data: { items: FooterItem[] } }>('/api/admin/settings', { query: { kind: 'footer' } }),
  { transform: payload => { applyFooter(payload); return true } },
)

const qrDirty = computed(() => qrSnapshot() !== qrBaseline.value)
const footerDirty = computed(() => footerSnapshot() !== footerBaseline.value)
const footerGroups = computed(() => [
  { kind: 'service' as const, label: '业务范围', items: footerItems.value.filter(item => item.kind === 'service') },
  { kind: 'link' as const, label: '页脚导航', items: footerItems.value.filter(item => item.kind === 'link') },
])

function payloadWithoutUid<T extends { uid: string }>(items: T[]) {
  return items.map(({ uid: _uid, ...item }) => item)
}
async function saveQr() {
  if (!writable.value || !qrDirty.value || savingKind.value || uploading.value.length) return
  savingKind.value = 'qr'; qrError.value = ''; qrSuccess.value = ''
  try {
    await requestFetch('/api/admin/settings', { method: 'PUT', body: { kind: 'qr', items: payloadWithoutUid(qrItems.value) } })
    await refreshQr()
    qrSuccess.value = '四类二维码已保存'
  } catch (error) {
    qrError.value = apiErrorMessage(error) || '二维码保存失败，请稍后重试'
  } finally { savingKind.value = '' }
}
async function saveFooter() {
  if (!writable.value || !footerDirty.value || savingKind.value) return
  savingKind.value = 'footer'; footerError.value = ''; footerSuccess.value = ''
  try {
    await requestFetch('/api/admin/settings', { method: 'PUT', body: { kind: 'footer', items: payloadWithoutUid(footerItems.value) } })
    await refreshFooter()
    footerSuccess.value = '页脚业务配置已保存'
  } catch (error) {
    footerError.value = apiErrorMessage(error) || '页脚业务配置保存失败，请稍后重试'
  } finally { savingKind.value = '' }
}
function addFooter(kind: 'service' | 'link') {
  const list = footerItems.value
  const prefix = kind === 'service' ? 'new-footer-service' : 'new-footer-link'
  list.push({ uid: nextUid('footer'), id: 0, itemKey: nextUniqueSlug(prefix, list.map(item => item.itemKey)), title: '', linkPath: '', sortOrder: list.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10, status: 1, kind })
  footerSuccess.value = ''
}
function setUploading(item: QrRow, active: boolean) {
  uploading.value = active ? [...new Set([...uploading.value, item.uid])] : uploading.value.filter(key => key !== item.uid)
}
function onUploaded(item: QrRow, payload: { mediaId: number, mediaUrl: string }) {
  item.mediaId = payload.mediaId
  item.mediaUrl = payload.mediaUrl
  qrSuccess.value = ''
}
</script>

<template>
  <BaseCard title="四类二维码" :title-level="3" class="site-publishing__card">
    <p class="site-publishing__hint">配置首页联系弹窗、内容侧栏与普法干货轮播使用的二维码；页脚公众号二维码继续使用上方的站点信息配置。</p>
    <ErrorState v-if="qrLoadError" title="二维码配置加载失败" message="请检查登录状态或稍后重试。" @retry="refreshQr()" />
    <template v-else>
      <div class="site-publishing__qr-grid">
        <section v-for="item in qrItems" :key="item.uid" class="site-publishing__qr-item">
          <h4>{{ REQUIRED_QR_CHANNELS.find(channel => channel.key === item.itemKey)?.label }}</h4>
          <SettingImageField
            :input-id="`site-qr-${item.itemKey}`"
            :label="item.title"
            :media-url="item.mediaUrl"
            :disabled="!writable || savingKind !== ''"
            usage-scope="qr"
            @uploaded="payload => onUploaded(item, payload)"
            @uploading="active => setUploading(item, active)"
          />
        </section>
      </div>
      <p v-if="qrError" class="site-publishing__error" role="alert">{{ qrError }}</p>
      <p v-if="qrSuccess" class="site-publishing__success" role="status">{{ qrSuccess }}</p>
      <BaseButton :disabled="!writable || !qrDirty || savingKind !== '' || uploading.length > 0" @click="saveQr">
        {{ savingKind === 'qr' ? '保存中…' : qrDirty ? '保存四类二维码' : '二维码暂无修改' }}
      </BaseButton>
    </template>
  </BaseCard>

  <BaseCard title="页脚业务配置" :title-level="3" class="site-publishing__card">
    <p class="site-publishing__hint">维护页脚中的业务范围与导航链接；更新会同步到公开页面页脚。</p>
    <ErrorState v-if="footerLoadError" title="页脚业务配置加载失败" message="请检查登录状态或稍后重试。" @retry="refreshFooter()" />
    <template v-else>
      <section v-for="group in footerGroups" :key="group.kind" class="site-publishing__footer-group">
        <h4>{{ group.label }}</h4>
        <div v-for="item in group.items" :key="item.uid" class="site-publishing__footer-row">
          <label>
            <span>名称</span>
            <input v-model="item.title" type="text" :disabled="!writable || savingKind !== ''">
          </label>
          <label>
            <span>链接</span>
            <input v-model="item.linkPath" type="text" :disabled="!writable || savingKind !== ''">
          </label>
          <label class="site-publishing__order">
            <span>顺序</span>
            <input v-model.number="item.sortOrder" type="number" min="0" :disabled="!writable || savingKind !== ''">
          </label>
          <label class="site-publishing__enabled">
            <input v-model.number="item.status" type="checkbox" :true-value="1" :false-value="0" :disabled="!writable || savingKind !== ''">
            显示
          </label>
          <small>{{ item.itemKey }}</small>
        </div>
        <BaseButton variant="secondary" size="sm" :disabled="!writable || savingKind !== ''" @click="addFooter(group.kind)">
          新增{{ group.kind === 'service' ? '业务项' : '导航链接' }}
        </BaseButton>
      </section>
      <p v-if="footerError" class="site-publishing__error" role="alert">{{ footerError }}</p>
      <p v-if="footerSuccess" class="site-publishing__success" role="status">{{ footerSuccess }}</p>
      <BaseButton :disabled="!writable || !footerDirty || savingKind !== ''" @click="saveFooter">
        {{ savingKind === 'footer' ? '保存中…' : footerDirty ? '保存页脚业务配置' : '页脚配置暂无修改' }}
      </BaseButton>
    </template>
  </BaseCard>
</template>

<style scoped>
.site-publishing__card { margin-top:var(--space-6); }
.site-publishing__hint { margin-bottom:var(--space-4); color:var(--color-text-muted); font-size:var(--text-sm); }
.site-publishing__qr-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); }
.site-publishing__qr-item { min-width:0; padding:var(--space-4); border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-light); }
.site-publishing__qr-item h4,.site-publishing__footer-group h4 { margin:0 0 var(--space-3); font-size:var(--text-base); }
.site-publishing__footer-group { margin-bottom:var(--space-6); }
.site-publishing__footer-row { display:grid; grid-template-columns:1fr 1.3fr 100px auto; align-items:end; gap:var(--space-3); padding:var(--space-3) 0; border-bottom:1px solid var(--color-border); }
.site-publishing__footer-row label { display:grid; gap:var(--space-1); font-size:var(--text-xs); }
.site-publishing__footer-row input:not([type=checkbox]) { width:100%; min-width:0; padding:var(--space-2); border:1px solid var(--color-border-strong); border-radius:var(--radius-sm); font:inherit; }
.site-publishing__footer-row small { grid-column:1/-1; color:var(--color-text-muted); }
.site-publishing__enabled { display:flex!important; align-items:center; gap:6px!important; white-space:nowrap; }
.site-publishing__error,.site-publishing__success { margin:var(--space-3) 0; font-size:var(--text-sm); }
.site-publishing__error { color:var(--color-error); }
.site-publishing__success { color:var(--color-success); }
@media(max-width:760px) { .site-publishing__qr-grid { grid-template-columns:1fr; } .site-publishing__footer-row { grid-template-columns:1fr 1fr; } }
</style>
