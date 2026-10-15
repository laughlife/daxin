import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const footer = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const settings = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../database/migrations/016_footer_registration.sql', import.meta.url), 'utf8').catch(() => '')

test('页脚备案信息可配置、公开显示居中，且不再显示隐私声明、免责声明或待确认占位', () => {
  assert.match(settings, /footer_registration: '备案信息'/)
  assert.match(settings, /footer_registration/)
  assert.match(migration, /'footer_registration',\s*'general'/)
  assert.match(migration, /WHERE NOT EXISTS[\s\S]*setting_key = 'footer_registration'/)
  assert.match(footer, /settings\.value\?\.settings\?\.footer_registration/)
  assert.match(footer, /site-footer__registration/)
  assert.match(footer, /text-align:\s*center/)
  assert.doesNotMatch(footer, /site-footer__legal|siteConfig\.legal\.copyright/)
  assert.doesNotMatch(footer, /siteConfig\.legal\.icp|privacyLink|disclaimerLink|隐私政策|免责声明|备案信息待确认/)
})
