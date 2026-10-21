import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeCoreAdvantages,
  normalizeTeamServices,
} from '../app/utils/homeData.mjs'

test('normalizes enabled team services and drops disabled sections/items', () => {
  const result = normalizeTeamServices([
    {
      slug: 'team-tro',
      title: 'TRO全流程处理',
      description: 'summary',
      iconKey: 'scale',
      status: 1,
      items: [
        { title: '和解', status: 1, sortOrder: 10 },
        { title: '隐藏项', status: 0, sortOrder: 20 },
      ],
    },
    { slug: 'disabled', title: '隐藏', status: 0, items: [] },
  ])

  assert.deepEqual(result, [{
    slug: 'team-tro',
    title: 'TRO全流程处理',
    description: 'summary',
    iconKey: 'scale',
    imageUrl: '',
    items: [{ title: '和解', description: '' }],
  }])
})

test('uses safe core advantage fallback for malformed input and preserves highlights', () => {
  const fallback = normalizeCoreAdvantages('not-json')
  assert.equal(fallback.length, 4)
  assert.deepEqual(fallback[0].highlights, ['30'])

  const parsed = normalizeCoreAdvantages([
    { title: '经验丰富', description: '深耕8年，处理上万起TRO', highlights: ['8年', '上万起TRO'] },
  ])
  assert.deepEqual(parsed, [{
    title: '经验丰富',
    description: '深耕8年，处理上万起TRO',
    highlights: ['8年', '上万起TRO'],
  }])
})
