import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const settingImage = await readFile(new URL('../app/components/admin/SettingImageField.vue', import.meta.url), 'utf8')
const imageList = await readFile(new URL('../app/components/admin/AdminImageListField.vue', import.meta.url), 'utf8')
const jsonImage = await readFile(new URL('../app/components/admin/JsonImageField.vue', import.meta.url), 'utf8')
const mediaPage = await readFile(new URL('../app/pages/admin/media.vue', import.meta.url), 'utf8')

test('后台单图、多图及 JSON 图片控件不显示已保存的图片地址', () => {
  for (const source of [settingImage, imageList, jsonImage]) {
    assert.doesNotMatch(source, /class="[^"]*(?:__url|__address)[^"]*"[^>]*>\s*\{\{\s*(?:previewUrl|url|modelValue)\s*\}\}/)
    assert.match(source, /<img[\s\S]*?:src="(?:previewUrl|url|modelValue)"/)
  }
  assert.match(settingImage, /mediaUrl: string/)
  assert.match(settingImage, /localUrl\.value \|\| props\.mediaUrl/)
  assert.match(imageList, /emit\('update:images', next\)/)
  assert.match(jsonImage, /emit\('update:modelValue', publicUrl\)/)
})

test('媒体上传与资源列表不再直接展示图片访问地址或对象路径', () => {
  const template = mediaPage.split('<template>')[1]?.split('</template>')[0] ?? ''
  assert.doesNotMatch(template, /访问地址|resultLocation|class="admin-media__object-key"/)
  assert.match(template, /:src="row\.publicUrl"/)
  assert.match(mediaPage, /publicUrl: string/)
})
