<script setup lang="ts">
import { computed, ref } from 'vue'
import type { QrItem } from '~/types/adminSettings'
import { canWriteSettings } from '~/utils/adminPermission'
import { apiErrorMessage } from '~/utils/publicApi'

interface QrRow extends QrItem { uid: string }

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
const qrBaseline = ref('')
const saving = ref(false)
const qrError = ref('')
const qrSuccess = ref('')
const uploading = ref<string[]>([])
let uid = 0
function nextUid() { uid += 1; return `qr-${uid}` }

function qrSnapshot() {
  return JSON.stringify(qrItems.value.map(({ uid: _uid, ...item }) => item))
}
function applyQr(payload: { data?: { items?: QrItem[] } }) {
  const byKey = new Map((payload?.data?.items ?? []).map(item => [item.itemKey, item]))
  qrItems.value = REQUIRED_QR_CHANNELS.map((channel, index) => {
    const item = byKey.get(channel.key)
    return {
      uid: nextUid(),
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

const { error: qrLoadError, refresh: refreshQr } = await useAsyncData(
  'admin-site-info-qr',
  () => requestFetch<{ data: { items: QrItem[] } }>('/api/admin/settings', { query: { kind: 'qr' } }),
  { transform: payload => { applyQr(payload); return true } },
)

const qrDirty = computed(() => qrSnapshot() !== qrBaseline.value)
function payloadWithoutUid(items: QrRow[]) {
  return items.map(({ uid: _uid, ...item }) => item)
}
async function saveQr() {
  if (!writable.value || !qrDirty.value || saving.value || uploading.value.length) return
  saving.value = true; qrError.value = ''; qrSuccess.value = ''
  try {
    await requestFetch('/api/admin/settings', { method: 'PUT', body: { kind: 'qr', items: payloadWithoutUid(qrItems.value) } })
    await refreshQr()
    qrSuccess.value = '四类二维码已保存'
  } catch (error) {
    qrError.value = apiErrorMessage(error) || '二维码保存失败，请稍后重试'
  } finally { saving.value = false }
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
  <BaseCard title="二维码管理" :title-level="2" class="site-publishing__card">
    <p class="site-publishing__hint">维护 TRO 与劳动法的公众号、咨询号二维码。首页联系弹窗、内容侧栏和普法干货轮播会读取对应配置。</p>
    <ErrorState v-if="qrLoadError" title="二维码配置加载失败" message="请检查登录状态或稍后重试。" @retry="refreshQr()" />
    <template v-else>
      <div class="site-publishing__qr-grid">
        <section v-for="item in qrItems" :key="item.uid" class="site-publishing__qr-item">
          <h3>{{ REQUIRED_QR_CHANNELS.find(channel => channel.key === item.itemKey)?.label }}</h3>
          <SettingImageField
            :input-id="`site-qr-${item.itemKey}`"
            :label="item.title"
            :media-url="item.mediaUrl"
            :disabled="!writable || saving"
            usage-scope="qr"
            @uploaded="payload => onUploaded(item, payload)"
            @uploading="active => setUploading(item, active)"
          />
        </section>
      </div>
      <p v-if="qrError" class="site-publishing__error" role="alert">{{ qrError }}</p>
      <p v-if="qrSuccess" class="site-publishing__success" role="status">{{ qrSuccess }}</p>
      <BaseButton :disabled="!writable || !qrDirty || saving || uploading.length > 0" @click="saveQr">
        {{ saving ? '保存中…' : qrDirty ? '保存四类二维码' : '二维码暂无修改' }}
      </BaseButton>
    </template>
  </BaseCard>
</template>

<style scoped>
.site-publishing__card { margin-top:var(--space-6); }
.site-publishing__hint { margin-bottom:var(--space-4); color:var(--color-text-muted); font-size:var(--text-sm); }
.site-publishing__qr-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); }
.site-publishing__qr-item { min-width:0; padding:var(--space-4); border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-light); }
.site-publishing__qr-item h3 { margin:0 0 var(--space-3); font-size:var(--text-base); }
.site-publishing__error,.site-publishing__success { margin:var(--space-3) 0; font-size:var(--text-sm); }
.site-publishing__error { color:var(--color-error); }
.site-publishing__success { color:var(--color-success); }
@media(max-width:760px) { .site-publishing__qr-grid { grid-template-columns:1fr; } }
</style>
