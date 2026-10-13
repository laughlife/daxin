import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { qrImageForItemKey, qrSourcesFromAssets } from '../app/utils/contactQr.ts'

const qrUtil = readFileSync(new URL('../app/utils/contactQr.ts', import.meta.url), 'utf8')
let migration = ''
try {
  migration = await readFile(new URL('../../database/migrations/014_configurable_qr_channels.sql', import.meta.url), 'utf8')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const adminFooter = await readFile(new URL('../app/components/admin/SitePublishingSettings.vue', import.meta.url), 'utf8')
const home = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const modal = await readFile(new URL('../app/components/contact/WechatQrModal.vue', import.meta.url), 'utf8')

test('four public and consultation QR channels have stable asset keys and resolve from QR settings', () => {
  assert.match(migration, /-- @data-migration/)
  for (const key of ['qr-tro-public', 'qr-labor-public', 'qr-tro-consult', 'qr-labor-consult']) {
    assert.ok(qrUtil.includes(key), `${key} maps to a channel`)
    assert.ok(migration.includes(key), `${key} has a seeded QR asset`)
  }
  assert.match(qrUtil, /function qrSourcesFromAssets/)
  assert.match(qrUtil, /function qrImageForItemKey/)
  assert.match(migration, /footer_qr_primary/)
  assert.match(migration, /footer_qr_secondary/)
  assert.match(migration, /WHERE NOT EXISTS/)

  const assets = [
    { itemKey: 'qr-tro-public', imageUrl: 'https://cdn.test/tro-public.png' },
    { itemKey: 'qr-labor-public', imageUrl: 'https://cdn.test/labor-public.png' },
    { itemKey: 'qr-tro-consult', imageUrl: 'https://cdn.test/tro-consult.png' },
    { itemKey: 'qr-labor-consult', imageUrl: 'https://cdn.test/labor-consult.png' },
  ]
  assert.deepEqual(qrSourcesFromAssets(assets), {
    'tro-public': 'https://cdn.test/tro-public.png',
    'tro-consult': 'https://cdn.test/tro-consult.png',
    'labor-public': 'https://cdn.test/labor-public.png',
    'labor-consult': 'https://cdn.test/labor-consult.png',
  })
  assert.equal(qrImageForItemKey(assets, 'qr-labor-consult'), 'https://cdn.test/labor-consult.png')
})

test('admin exposes the four named QR image fields and protects their stable keys', () => {
  for (const label of ['TRO 公众号', '劳动法公众号', 'TRO 咨询号', '劳动法咨询号']) {
    assert.ok(adminFooter.includes(label), `${label} is visible in QR management`)
  }
  assert.match(adminFooter, /REQUIRED_QR_CHANNELS/)
  assert.match(adminFooter, /itemKey: channel\.key/)
  assert.match(adminFooter, /status: 1/)
})

test('homepage contact modal resolves QR images from the shared QR asset settings', () => {
  assert.match(home, /qrSourcesFromAssets/)
  assert.match(home, /<WechatQrModal[^>]*:sources="qrSources"/)
  assert.match(modal, /:sources="sources"/)
})
