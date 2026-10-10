<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ContactItem, FooterItem, QrItem } from '~/types/adminSettings'
import { apiErrorMessage, httpStatusOf } from '~/utils/publicApi'
import { SETTINGS_READ_ONLY_NOTICE, canWriteSettings, nextUniqueSlug } from '~/utils/adminPermission'

/**
 * 页脚配置：页脚业务项、页脚导航链接、联系渠道、二维码。
 *
 * 四块内容来自**三个不同的 kind**（footer / contact / qr），因此提供三个独立的保存动作，
 * 各自提交 `PUT /api/admin/settings`（body { kind, items }）：
 * - footer：footer_services（kind: 'service'）与 footer_links（kind: 'link'）共用一个数组，
 *   按 item_key upsert；
 * - contact：contact_channels，按 item_key upsert；
 * - qr：qr_assets，按 item_key upsert，图片由后台上传后写入 media_id。
 *
 * 保存按钮与输入框对只读角色（viewer）一律禁用，并给出中文说明。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '页脚与联系方式',
  description: '维护页脚业务项、导航链接、联系渠道与二维码。',
  robots: 'noindex, nofollow'
})

/** 三个独立保存单元 */
type SaveKind = 'footer' | 'contact' | 'qr'

/**
 * 表格内的本地行标识。
 * itemKey 允许编辑，不能当 v-for 的 key（一改就整行重建），
 * 因此载入时生成一次性的 uid，用于 key、标签 id 与上传结果的本地映射。
 */
interface FooterRow extends FooterItem {
  uid: string
}

interface ContactRow extends ContactItem {
  uid: string
}

interface QrRow extends QrItem {
  uid: string
}

/** 载入时的序号计数器，只用于生成页面内的临时 uid */
let rowSeq = 0
function nextUid(prefix: string): string {
  rowSeq += 1
  return `${prefix}-${rowSeq}`
}

const requestFetch = useRequestFetch()
const { user } = useAdminSession()

const writable = computed(() => canWriteSettings(user.value?.roles))
const readOnlyNotice = SETTINGS_READ_ONLY_NOTICE
const controlsDisabled = computed(() => !writable.value)

const footerItems = ref<FooterRow[]>([])
const contactItems = ref<ContactRow[]>([])
const qrItems = ref<QrRow[]>([])

const baseline = reactive<Record<SaveKind, string>>({ footer: '', contact: '', qr: '' })
const savingKind = ref<SaveKind | ''>('')
const saveError = reactive<Record<SaveKind, string>>({ footer: '', contact: '', qr: '' })
const saveSuccess = reactive<Record<SaveKind, string>>({ footer: '', contact: '', qr: '' })
/** 本地上传得到的二维码展示地址：行 uid → URL */
const qrUploadedUrls = reactive<Record<string, string>>({})
/** 正在上传的二维码（上传期间禁止保存，避免提交旧 mediaId） */
const uploadingKeys = ref<string[]>([])

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toFlag(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value ? 1 : 0
  return value ? 1 : 0
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

/**
 * 去掉仅前端使用的 uid，只留接口字段（显式挑字段，避免 uid 混进请求体）。
 * 提交体与 baseline 快照都走这里，保证两者可逐字节比较。
 */
function pickFooter(row: FooterRow): FooterItem {
  return {
    id: row.id,
    itemKey: row.itemKey,
    title: row.title,
    linkPath: row.linkPath,
    sortOrder: row.sortOrder,
    status: row.status,
    kind: row.kind
  }
}

function pickContact(row: ContactRow): ContactItem {
  return {
    id: row.id,
    itemKey: row.itemKey,
    channelType: row.channelType,
    label: row.label,
    value: row.value,
    sortOrder: row.sortOrder,
    status: row.status
  }
}

function pickQr(row: QrRow): QrItem {
  return {
    id: row.id,
    itemKey: row.itemKey,
    title: row.title,
    mediaId: row.mediaId,
    mediaUrl: row.mediaUrl,
    caption: row.caption,
    sortOrder: row.sortOrder,
    status: row.status
  }
}

function snapshot(kind: SaveKind): string {
  if (kind === 'footer') return JSON.stringify(footerItems.value.map(pickFooter))
  if (kind === 'contact') return JSON.stringify(contactItems.value.map(pickContact))
  return JSON.stringify(qrItems.value.map(pickQr))
}

function applyFooter(payload: { data: { items: FooterItem[] } }) {
  const items = payload?.data?.items ?? []
  footerItems.value = items.map(item => ({
    uid: nextUid('footer'),
    id: toNumber(item.id),
    itemKey: toText(item.itemKey),
    title: toText(item.title),
    linkPath: toText(item.linkPath),
    sortOrder: toNumber(item.sortOrder),
    status: toFlag(item.status),
    kind: item.kind === 'link' ? 'link' : 'service'
  }))
  baseline.footer = snapshot('footer')
  return footerItems.value
}

function applyContact(payload: { data: { items: ContactItem[] } }) {
  const items = payload?.data?.items ?? []
  contactItems.value = items.map(item => ({
    uid: nextUid('contact'),
    id: toNumber(item.id),
    itemKey: toText(item.itemKey),
    channelType: toText(item.channelType) || 'phone',
    label: toText(item.label),
    value: toText(item.value),
    sortOrder: toNumber(item.sortOrder),
    status: toFlag(item.status)
  }))
  baseline.contact = snapshot('contact')
  return contactItems.value
}

function applyQr(payload: { data: { items: QrItem[] } }) {
  const items = payload?.data?.items ?? []
  for (const key of Object.keys(qrUploadedUrls)) delete qrUploadedUrls[key]
  qrItems.value = items.map(item => ({
    uid: nextUid('qr'),
    id: toNumber(item.id),
    itemKey: toText(item.itemKey),
    title: toText(item.title),
    mediaId: item.mediaId === null || item.mediaId === undefined ? null : toNumber(item.mediaId),
    mediaUrl: toText(item.mediaUrl),
    caption: toText(item.caption),
    sortOrder: toNumber(item.sortOrder),
    status: toFlag(item.status)
  }))
  baseline.qr = snapshot('qr')
  return qrItems.value
}

const { error: footerError, refresh: refreshFooter } = await useAsyncData(
  'admin-settings-footer',
  () => requestFetch<{ data: { items: FooterItem[] } }>('/api/admin/settings', { query: { kind: 'footer' } }),
  { transform: payload => applyFooter(payload) }
)
const { error: contactError, refresh: refreshContact } = await useAsyncData(
  'admin-settings-contact',
  () => requestFetch<{ data: { items: ContactItem[] } }>('/api/admin/settings', { query: { kind: 'contact' } }),
  { transform: payload => applyContact(payload) }
)
const { error: qrError, refresh: refreshQr } = await useAsyncData(
  'admin-settings-qr',
  () => requestFetch<{ data: { items: QrItem[] } }>('/api/admin/settings', { query: { kind: 'qr' } }),
  { transform: payload => applyQr(payload) }
)

const groupErrors = computed<Record<SaveKind, unknown>>(() => ({
  footer: footerError.value,
  contact: contactError.value,
  qr: qrError.value
}))

const dirty = computed<Record<SaveKind, boolean>>(() => ({
  footer: snapshot('footer') !== baseline.footer,
  contact: snapshot('contact') !== baseline.contact,
  qr: snapshot('qr') !== baseline.qr
}))

function loadErrorMessage(kind: SaveKind, label: string): string {
  const error = groupErrors.value[kind]
  const message = apiErrorMessage(error)
  if (message) return message
  const status = httpStatusOf(error)
  if (status === 401) return '登录状态已失效，请重新登录后再试'
  if (status === 403) return '当前账号没有站点配置读取权限'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  return `${label}加载失败，请稍后重试`
}

async function retry(kind: SaveKind) {
  if (kind === 'footer') await refreshFooter()
  else if (kind === 'contact') await refreshContact()
  else await refreshQr()
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------

function canSave(kind: SaveKind): boolean {
  const count = kind === 'footer' ? footerItems.value.length : kind === 'contact' ? contactItems.value.length : qrItems.value.length
  return writable.value
    && !savingKind.value
    && uploadingKeys.value.length === 0
    && dirty.value[kind]
    && count > 0
}

function saveLabel(kind: SaveKind): string {
  if (savingKind.value === kind) return '保存中…'
  if (!writable.value) return '保存（只读角色不可用）'
  if (!dirty.value[kind]) return '保存（暂无修改）'
  return '保存'
}

/** 组装提交体（服务端按 itemKey upsert，id 仅用于审计快照） */
function buildPayload(kind: SaveKind) {
  if (kind === 'footer') return footerItems.value.map(pickFooter)
  if (kind === 'contact') return contactItems.value.map(pickContact)
  return qrItems.value.map(pickQr)
}

async function save(kind: SaveKind) {
  if (!canSave(kind)) return
  const label = kind === 'footer' ? '页脚配置' : kind === 'contact' ? '联系渠道' : '二维码'
  savingKind.value = kind
  saveError[kind] = ''
  saveSuccess[kind] = ''
  try {
    await requestFetch('/api/admin/settings', {
      method: 'PUT',
      body: { kind, items: buildPayload(kind) }
    })
    saveSuccess[kind] = `${label}已保存`
    // 重新拉取，让 mediaUrl 等联表字段回到服务端真实值
    await retry(kind)
  } catch (cause) {
    saveError[kind] = apiErrorMessage(cause) || '保存失败，请稍后重试'
  } finally {
    savingKind.value = ''
  }
}

// ---------------------------------------------------------------------------
// 排序（交换相邻 sortOrder，不使用拖拽库）
// ---------------------------------------------------------------------------

function swapOrder(list: { sortOrder: number }[], index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const current = list[index]
  const other = list[target]
  if (!current || !other) return
  const order = current.sortOrder
  current.sortOrder = other.sortOrder
  other.sortOrder = order
  list.sort((a, b) => a.sortOrder - b.sortOrder)
}

function moveFooter(index: number, delta: number) {
  swapOrder(footerItems.value, index, delta)
  saveSuccess.footer = ''
}

function moveContact(index: number, delta: number) {
  swapOrder(contactItems.value, index, delta)
  saveSuccess.contact = ''
}

function moveQr(index: number, delta: number) {
  swapOrder(qrItems.value, index, delta)
  saveSuccess.qr = ''
}

// ---------------------------------------------------------------------------
// 增删
// ---------------------------------------------------------------------------

/** 由列表取下一个可用的 itemKey（服务端唯一键，不能重复） */
function usedKeys(kind: SaveKind): string[] {
  if (kind === 'footer') return footerItems.value.map(item => item.itemKey)
  if (kind === 'contact') return contactItems.value.map(item => item.itemKey)
  return qrItems.value.map(item => item.itemKey)
}

function nextOrder(list: { sortOrder: number }[]): number {
  return list.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10
}

function addFooter(kind: 'service' | 'link') {
  const list = footerItems.value
  list.push({
    uid: nextUid('footer'),
    id: 0,
    itemKey: nextUniqueSlug(kind === 'link' ? 'new-footer-link' : 'new-footer-service', usedKeys('footer')),
    title: '',
    linkPath: '',
    sortOrder: nextOrder(list),
    status: 1,
    kind
  })
  saveSuccess.footer = ''
}

function removeFooter(index: number) {
  footerItems.value.splice(index, 1)
  saveSuccess.footer = ''
}

function addContact() {
  const list = contactItems.value
  list.push({
    uid: nextUid('contact'),
    id: 0,
    itemKey: nextUniqueSlug('new-contact', usedKeys('contact')),
    channelType: 'phone',
    label: '',
    value: '',
    sortOrder: nextOrder(list),
    status: 1
  })
  saveSuccess.contact = ''
}

function removeContact(index: number) {
  contactItems.value.splice(index, 1)
  saveSuccess.contact = ''
}

function addQr() {
  const list = qrItems.value
  list.push({
    uid: nextUid('qr'),
    id: 0,
    itemKey: nextUniqueSlug('new-qr', usedKeys('qr')),
    title: '',
    mediaId: null,
    mediaUrl: '',
    caption: '',
    sortOrder: nextOrder(list),
    status: 1
  })
  saveSuccess.qr = ''
}

function removeQr(index: number) {
  qrItems.value.splice(index, 1)
  saveSuccess.qr = ''
}

// ---------------------------------------------------------------------------
// 二维码图片上传
// ---------------------------------------------------------------------------

function qrImageUrl(item: QrRow): string {
  return qrUploadedUrls[item.uid] || item.mediaUrl || ''
}

function onQrUploaded(item: QrRow, payload: { mediaId: number, mediaUrl: string }) {
  item.mediaId = payload.mediaId
  qrUploadedUrls[item.uid] = payload.mediaUrl
  saveSuccess.qr = ''
  saveError.qr = ''
}

function onQrUploading(uid: string, value: boolean) {
  if (value) {
    if (!uploadingKeys.value.includes(uid)) uploadingKeys.value = [...uploadingKeys.value, uid]
    return
  }
  uploadingKeys.value = uploadingKeys.value.filter(entry => entry !== uid)
}

const SERVICE_FOOTER_ITEMS = computed(() => footerItems.value.filter(item => item.kind === 'service'))
const LINK_FOOTER_ITEMS = computed(() => footerItems.value.filter(item => item.kind === 'link'))

function indexInFooter(item: FooterRow): number {
  return footerItems.value.indexOf(item)
}

const CHANNEL_TYPES = [
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮箱' },
  { value: 'wechat', label: '微信' },
  { value: 'address', label: '地址' },
  { value: 'other', label: '其他' }
]

const STATUS_OPTIONS = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]
</script>

<template>
  <PageContainer class="admin-footer" size="wide">
    <header class="admin-footer__head">
      <h1 class="admin-footer__title">页脚与联系方式</h1>
      <p class="admin-footer__desc">
        维护页脚业务项、导航链接、联系渠道与二维码。页脚、联系渠道、二维码分属三类配置，
        各自独立保存。
      </p>
    </header>

    <p v-if="!writable" class="admin-footer__readonly" role="note">
      {{ readOnlyNotice }}（当前角色对站点配置只有读取权限，所有输入框与保存按钮均已禁用）。
    </p>

    <!-- 一、页脚业务项 + 导航链接：同一个 kind（footer），一个保存按钮 -->
    <BaseCard class="admin-footer__card" title="页脚配置（业务项与导航链接）" :title-level="2">
      <ErrorState
        v-if="footerError"
        title="页脚配置加载失败"
        :message="loadErrorMessage('footer', '页脚配置')"
        @retry="refreshFooter()"
      />
      <template v-else>
        <section aria-labelledby="footer-services-title">
          <h3 id="footer-services-title" class="admin-footer__group-title">页脚业务项（kind: service）</h3>
          <div
            v-for="item in SERVICE_FOOTER_ITEMS"
            :key="item.uid"
            class="admin-footer__row"
          >
            <div class="admin-footer__grid">
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-service-${indexInFooter(item)}-key`">
                  标识 itemKey
                </label>
                <input
                  :id="`footer-service-${indexInFooter(item)}-key`"
                  v-model="item.itemKey"
                  class="admin-footer__input"
                  type="text"
                  maxlength="64"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-service-${indexInFooter(item)}-title`">名称</label>
                <input
                  :id="`footer-service-${indexInFooter(item)}-title`"
                  v-model="item.title"
                  class="admin-footer__input"
                  type="text"
                  maxlength="128"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-service-${indexInFooter(item)}-link`">链接</label>
                <input
                  :id="`footer-service-${indexInFooter(item)}-link`"
                  v-model="item.linkPath"
                  class="admin-footer__input"
                  type="text"
                  maxlength="255"
                  placeholder="留空表示不带链接"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-service-${indexInFooter(item)}-order`">排序值</label>
                <input
                  :id="`footer-service-${indexInFooter(item)}-order`"
                  v-model.number="item.sortOrder"
                  class="admin-footer__input"
                  type="number"
                  min="0"
                  max="65535"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-service-${indexInFooter(item)}-status`">状态</label>
                <select
                  :id="`footer-service-${indexInFooter(item)}-status`"
                  v-model.number="item.status"
                  class="admin-footer__select"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
                  <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="admin-footer__actions">
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== '' || indexInFooter(item) === 0"
                @click="moveFooter(indexInFooter(item), -1)"
              >
                上移
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== '' || indexInFooter(item) === footerItems.length - 1"
                @click="moveFooter(indexInFooter(item), 1)"
              >
                下移
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== ''"
                @click="removeFooter(indexInFooter(item))"
              >
                移除
              </BaseButton>
            </div>
          </div>
          <p v-if="SERVICE_FOOTER_ITEMS.length === 0" class="admin-footer__hint">暂无页脚业务项。</p>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="controlsDisabled || savingKind !== ''"
            @click="addFooter('service')"
          >
            新增业务项
          </BaseButton>
        </section>

        <section class="admin-footer__group" aria-labelledby="footer-links-title">
          <h3 id="footer-links-title" class="admin-footer__group-title">页脚导航链接（kind: link）</h3>
          <div
            v-for="item in LINK_FOOTER_ITEMS"
            :key="item.uid"
            class="admin-footer__row"
          >
            <div class="admin-footer__grid">
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-link-${indexInFooter(item)}-key`">标识 itemKey</label>
                <input
                  :id="`footer-link-${indexInFooter(item)}-key`"
                  v-model="item.itemKey"
                  class="admin-footer__input"
                  type="text"
                  maxlength="64"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-link-${indexInFooter(item)}-title`">名称</label>
                <input
                  :id="`footer-link-${indexInFooter(item)}-title`"
                  v-model="item.title"
                  class="admin-footer__input"
                  type="text"
                  maxlength="128"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-link-${indexInFooter(item)}-link`">链接</label>
                <input
                  :id="`footer-link-${indexInFooter(item)}-link`"
                  v-model="item.linkPath"
                  class="admin-footer__input"
                  type="text"
                  maxlength="255"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-link-${indexInFooter(item)}-order`">排序值</label>
                <input
                  :id="`footer-link-${indexInFooter(item)}-order`"
                  v-model.number="item.sortOrder"
                  class="admin-footer__input"
                  type="number"
                  min="0"
                  max="65535"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
              </div>
              <div class="admin-footer__cell">
                <label class="admin-footer__label" :for="`footer-link-${indexInFooter(item)}-status`">状态</label>
                <select
                  :id="`footer-link-${indexInFooter(item)}-status`"
                  v-model.number="item.status"
                  class="admin-footer__select"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
                  <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="admin-footer__actions">
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== '' || indexInFooter(item) === 0"
                @click="moveFooter(indexInFooter(item), -1)"
              >
                上移
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== '' || indexInFooter(item) === footerItems.length - 1"
                @click="moveFooter(indexInFooter(item), 1)"
              >
                下移
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="controlsDisabled || savingKind !== ''"
                @click="removeFooter(indexInFooter(item))"
              >
                移除
              </BaseButton>
            </div>
          </div>
          <p v-if="LINK_FOOTER_ITEMS.length === 0" class="admin-footer__hint">暂无页脚导航链接。</p>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="controlsDisabled || savingKind !== ''"
            @click="addFooter('link')"
          >
            新增导航链接
          </BaseButton>
        </section>

        <p v-if="saveSuccess.footer" class="admin-footer__success" role="status">{{ saveSuccess.footer }}</p>
        <p v-if="saveError.footer" class="admin-footer__error" role="alert">{{ saveError.footer }}</p>

        <div class="admin-footer__save">
          <BaseButton :disabled="!canSave('footer')" @click="save('footer')">
            {{ saveLabel('footer') }}
          </BaseButton>
          <span v-if="savingKind === 'footer'" class="admin-footer__hint" role="status">保存中，请勿关闭页面…</span>
          <span v-else-if="dirty.footer && writable" class="admin-footer__hint">有未保存的修改</span>
        </div>

        <p class="admin-footer__hint">
          说明：接口按 itemKey 更新，不会删除未提交的项；「移除」只表示本次不提交该项。
        </p>
      </template>
    </BaseCard>

    <!-- 二、联系渠道：kind = contact -->
    <BaseCard class="admin-footer__card" title="联系渠道" :title-level="2">
      <ErrorState
        v-if="contactError"
        title="联系渠道加载失败"
        :message="loadErrorMessage('contact', '联系渠道')"
        @retry="refreshContact()"
      />
      <template v-else>
        <div v-for="(item, index) in contactItems" :key="item.uid" class="admin-footer__row">
          <div class="admin-footer__grid">
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`contact-${index}-key`">标识 itemKey</label>
              <input
                :id="`contact-${index}-key`"
                v-model="item.itemKey"
                class="admin-footer__input"
                type="text"
                maxlength="64"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`contact-${index}-type`">渠道类型</label>
              <select
                :id="`contact-${index}-type`"
                v-model="item.channelType"
                class="admin-footer__select"
                :disabled="controlsDisabled || savingKind !== ''"
              >
                <option v-for="option in CHANNEL_TYPES" :key="option.value" :value="option.value">
                  {{ option.label }}（{{ option.value }}）
                </option>
              </select>
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`contact-${index}-label`">展示名称</label>
              <input
                :id="`contact-${index}-label`"
                v-model="item.label"
                class="admin-footer__input"
                type="text"
                maxlength="128"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell admin-footer__cell--wide">
              <label class="admin-footer__label" :for="`contact-${index}-value`">联系方式</label>
              <input
                :id="`contact-${index}-value`"
                v-model="item.value"
                class="admin-footer__input"
                type="text"
                maxlength="512"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`contact-${index}-order`">排序值</label>
              <input
                :id="`contact-${index}-order`"
                v-model.number="item.sortOrder"
                class="admin-footer__input"
                type="number"
                min="0"
                max="65535"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`contact-${index}-status`">状态</label>
              <select
                :id="`contact-${index}-status`"
                v-model.number="item.status"
                class="admin-footer__select"
                :disabled="controlsDisabled || savingKind !== ''"
              >
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
          <div class="admin-footer__actions">
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== '' || index === 0"
              @click="moveContact(index, -1)"
            >
              上移
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== '' || index === contactItems.length - 1"
              @click="moveContact(index, 1)"
            >
              下移
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== ''"
              @click="removeContact(index)"
            >
              移除
            </BaseButton>
          </div>
        </div>

        <p v-if="contactItems.length === 0" class="admin-footer__hint">暂无联系渠道。</p>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="controlsDisabled || savingKind !== ''"
          @click="addContact"
        >
          新增联系渠道
        </BaseButton>

        <p v-if="saveSuccess.contact" class="admin-footer__success" role="status">{{ saveSuccess.contact }}</p>
        <p v-if="saveError.contact" class="admin-footer__error" role="alert">{{ saveError.contact }}</p>

        <div class="admin-footer__save">
          <BaseButton :disabled="!canSave('contact')" @click="save('contact')">
            {{ saveLabel('contact') }}
          </BaseButton>
          <span v-if="savingKind === 'contact'" class="admin-footer__hint" role="status">保存中，请勿关闭页面…</span>
          <span v-else-if="dirty.contact && writable" class="admin-footer__hint">有未保存的修改</span>
        </div>
      </template>
    </BaseCard>

    <!-- 三、二维码：kind = qr -->
    <BaseCard class="admin-footer__card" title="二维码" :title-level="2">
      <ErrorState
        v-if="qrError"
        title="二维码加载失败"
        :message="loadErrorMessage('qr', '二维码')"
        @retry="refreshQr()"
      />
      <template v-else>
        <div v-for="(item, index) in qrItems" :key="item.uid" class="admin-footer__row">
          <div class="admin-footer__grid">
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`qr-${index}-key`">标识 itemKey</label>
              <input
                :id="`qr-${index}-key`"
                v-model="item.itemKey"
                class="admin-footer__input"
                type="text"
                maxlength="64"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`qr-${index}-title`">标题</label>
              <input
                :id="`qr-${index}-title`"
                v-model="item.title"
                class="admin-footer__input"
                type="text"
                maxlength="128"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell admin-footer__cell--wide">
              <label class="admin-footer__label" :for="`qr-${index}-caption`">说明文字</label>
              <input
                :id="`qr-${index}-caption`"
                v-model="item.caption"
                class="admin-footer__input"
                type="text"
                maxlength="255"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`qr-${index}-order`">排序值</label>
              <input
                :id="`qr-${index}-order`"
                v-model.number="item.sortOrder"
                class="admin-footer__input"
                type="number"
                min="0"
                max="65535"
                :disabled="controlsDisabled || savingKind !== ''"
              >
            </div>
            <div class="admin-footer__cell">
              <label class="admin-footer__label" :for="`qr-${index}-status`">状态</label>
              <select
                :id="`qr-${index}-status`"
                v-model.number="item.status"
                class="admin-footer__select"
                :disabled="controlsDisabled || savingKind !== ''"
              >
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="admin-footer__qr">
            <p class="admin-footer__label">二维码图片</p>
            <SettingImageField
              :input-id="`qr-image-${index}`"
              :label="item.title || item.itemKey"
              :media-url="qrImageUrl(item)"
              :disabled="controlsDisabled || savingKind !== ''"
              usage-scope="qr"
              @uploaded="payload => onQrUploaded(item, payload)"
              @uploading="value => onQrUploading(item.uid, value)"
            />
          </div>

          <div class="admin-footer__actions">
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== '' || index === 0"
              @click="moveQr(index, -1)"
            >
              上移
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== '' || index === qrItems.length - 1"
              @click="moveQr(index, 1)"
            >
              下移
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || savingKind !== ''"
              @click="removeQr(index)"
            >
              移除
            </BaseButton>
          </div>
        </div>

        <p v-if="qrItems.length === 0" class="admin-footer__hint">暂无二维码。</p>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="controlsDisabled || savingKind !== ''"
          @click="addQr"
        >
          新增二维码
        </BaseButton>

        <p v-if="saveSuccess.qr" class="admin-footer__success" role="status">{{ saveSuccess.qr }}</p>
        <p v-if="saveError.qr" class="admin-footer__error" role="alert">{{ saveError.qr }}</p>

        <div class="admin-footer__save">
          <BaseButton :disabled="!canSave('qr')" @click="save('qr')">
            {{ saveLabel('qr') }}
          </BaseButton>
          <span v-if="savingKind === 'qr'" class="admin-footer__hint" role="status">保存中，请勿关闭页面…</span>
          <span v-else-if="dirty.qr && writable" class="admin-footer__hint">有未保存的修改</span>
        </div>
      </template>
    </BaseCard>

    <p class="admin-footer__back">
      <NuxtLink to="/admin">返回后台首页</NuxtLink>
    </p>
  </PageContainer>
</template>

<style scoped>
.admin-footer {
  padding-block: var(--space-8) var(--space-16);
}

.admin-footer__head {
  margin-bottom: var(--space-6);
}

.admin-footer__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-footer__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-footer__readonly {
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-footer__card {
  margin-top: var(--space-6);
}

.admin-footer__group {
  margin-top: var(--space-6);
}

.admin-footer__group-title {
  margin-bottom: var(--space-3);
  font-size: var(--text-base);
  color: var(--color-text);
}

.admin-footer__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
}

.admin-footer__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
}

.admin-footer__cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.admin-footer__cell--wide {
  grid-column: span 2;
}

.admin-footer__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text);
}

.admin-footer__input,
.admin-footer__select {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-footer__select {
  max-width: 240px;
}

.admin-footer__input:disabled,
.admin-footer__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-footer__qr {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--color-border-strong);
}

.admin-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-footer__hint {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-footer__save {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.admin-footer__success {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-footer__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-footer__back {
  margin-top: var(--space-8);
  font-size: var(--text-sm);
}
</style>
