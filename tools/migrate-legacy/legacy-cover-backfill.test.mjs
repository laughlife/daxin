import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import * as coverBackfill from './legacy-cover-backfill.mjs'

test('封面回填计划按旧文章 ID 配对附件，并按附件 URL 去重', () => {
  const plan = coverBackfill.buildArticleCoverPlan({
    articles: [
      { article_id: '31', source_id: '1977', cover_media_id: null },
      { article_id: '32', source_id: '1978', cover_media_id: null },
    ],
    sourceRows: [
      { id: '1977', thumb: '11454', attachment: '202610/d3a71f84fefdfee.png' },
      { id: '1978', thumb: '11454', attachment: '202610/d3a71f84fefdfee.png' },
    ],
  })

  assert.equal(plan.targetArticleCount, 2)
  assert.equal(plan.referenceCount, 2)
  assert.equal(plan.uniqueAttachmentCount, 1)
  assert.equal(plan.alreadyBoundCount, 0)
  assert.equal(plan.missingSourceCount, 0)
  assert.equal(plan.missingAttachmentCount, 0)
  assert.deepEqual(plan.attachments[0].articleIds, [31, 32])
  assert.equal(plan.attachments[0].sourceUrl, 'https://daxinfawu.com/uploadfile/202610/d3a71f84fefdfee.png')
})

test('封面回填计划跳过已绑定文章并统计缺失源文章或附件', () => {
  const plan = coverBackfill.buildArticleCoverPlan({
    articles: [
      { article_id: '31', source_id: '1977', cover_media_id: '9' },
      { article_id: '32', source_id: '1978', cover_media_id: null },
      { article_id: '33', source_id: '1979', cover_media_id: null },
    ],
    sourceRows: [
      { id: '1977', thumb: '11454', attachment: '202610/covered.png' },
      { id: '1978', thumb: '0', attachment: '' },
    ],
  })

  assert.equal(plan.alreadyBoundCount, 1)
  assert.equal(plan.missingSourceCount, 1)
  assert.equal(plan.missingAttachmentCount, 1)
  assert.equal(plan.directUrlReferenceCount, 0)
  assert.deepEqual(plan.attachments, [])
})

test('thumb 已是旧站官网 URL 时仅接受同域 uploadfile 路径并升级为 HTTPS', () => {
  const plan = coverBackfill.buildArticleCoverPlan({
    articles: [{ article_id: 34, source_id: 1980, cover_media_id: null }],
    sourceRows: [{ id: 1980, thumb: 'http://daxinfawu.com/uploadfile/202609/cover.webp', attachment: '' }],
  })
  assert.equal(plan.referenceCount, 1)
  assert.equal(plan.directUrlReferenceCount, 1)
  assert.equal(plan.missingAttachmentCount, 0)
  assert.equal(plan.attachments[0].sourceUrl, 'https://daxinfawu.com/uploadfile/202609/cover.webp')
  assert.equal(plan.attachments[0].attachmentId, 0)
})

test('thumb 为空时不猜封面地址，也不生成待上传附件', () => {
  const plan = coverBackfill.buildArticleCoverPlan({
    articles: [{ article_id: 35, source_id: 1981, cover_media_id: null }],
    sourceRows: [{ id: 1981, thumb: '', attachment: '' }],
  })
  assert.equal(plan.referenceCount, 0)
  assert.equal(plan.missingAttachmentCount, 1)
  assert.deepEqual(plan.attachments, [])
})

test('封面来源地址仅允许官网 uploadfile 图片路径，不接受外链或路径穿越', () => {
  const valid = 'https://daxinfawu.com/uploadfile/202610/cover.png'
  assert.equal(coverBackfill.isAllowedCoverSourceUrl(valid), true)
  for (const invalid of [
    'http://daxinfawu.com/uploadfile/a.png',
    'https://cdn.example/cover.png',
    'https://daxinfawu.com/other/cover.png',
    'https://daxinfawu.com/uploadfile/../secret.png',
    'https://user@daxinfawu.com/uploadfile/cover.png',
  ]) assert.equal(coverBackfill.isAllowedCoverSourceUrl(invalid), false, invalid)
})

test('旧图映射按附件相对路径复用 OSS 对象，并检测同路径冲突', () => {
  const index = coverBackfill.buildMediaPathIndex({
    'http://daxin.qinianyun.com/uploadfile/202610/cover.png': {
      objectKey: 'Img/20261016/known.png',
      publicUrl: 'https://oss.example/Img/20261016/known.png',
    },
  })
  assert.deepEqual(coverBackfill.resolveMappedCover(
    'https://daxinfawu.com/uploadfile/202610/cover.png',
    index,
  ), {
    objectKey: 'Img/20261016/known.png',
    publicUrl: 'https://oss.example/Img/20261016/known.png',
  })

  const ambiguous = coverBackfill.buildMediaPathIndex({
    'http://daxin.qinianyun.com/uploadfile/202610/cover.png': { objectKey: 'Img/a.png', publicUrl: 'https://oss/a.png' },
    'https://daxinfawu.com/uploadfile/202610/cover.png': { objectKey: 'Img/b.png', publicUrl: 'https://oss/b.png' },
  })
  assert.equal(coverBackfill.resolveMappedCover('https://daxinfawu.com/uploadfile/202610/cover.png', ambiguous), null)
})

test('封面回填默认只预演，只有显式 --apply 才允许写入', () => {
  assert.equal(coverBackfill.parseCoverBackfillArgs([]).apply, false)
  assert.equal(coverBackfill.parseCoverBackfillArgs(['--apply']).apply, true)
  assert.equal(coverBackfill.parseCoverBackfillArgs(['--source-id', '1977']).sourceId, 1977)
})

test('检查点写入只创建完整版本文件，读取者不会读到半截 JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daxin-cover-checkpoint-'))
  const path = join(directory, 'checkpoint.json')
  const { readLatestCheckpoint, writeCheckpointSnapshot } = await import('./legacy-cover-backfill.mjs')
  const errors = []
  let finished = false
  const reader = (async () => {
    while (!finished) {
      try {
        const value = await readLatestCheckpoint(path)
        if (!Number.isInteger(value.checkpointSequence)) continue
        assert.ok(Number.isInteger(value.sequence))
        assert.ok(Array.isArray(value.items))
      } catch (error) {
        errors.push(error)
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 2))
    }
  })()
  try {
    for (let sequence = 0; sequence < 40; sequence += 1) {
      await writeCheckpointSnapshot(path, {
        checkpointSequence: sequence + 1,
        sequence,
        items: Array(100).fill(String(sequence).repeat(100)),
      })
    }
  } finally {
    finished = true
    await reader
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(await readdir(directory), ['checkpoint.json.snapshots'])
  const snapshotDirectory = join(directory, 'checkpoint.json.snapshots')
  const snapshots = await readdir(snapshotDirectory)
  assert.equal(snapshots.length, 40)
  assert.ok(snapshots.every(name => name.endsWith('.json')))
  assert.equal((await readLatestCheckpoint(path)).sequence, 39)
  await rm(directory, { recursive: true, force: true })
})
