import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkSqlStatements } from './mysql-client.mjs'

test('SQL 批次按大小和条数切分，保持顺序且不拆语句', () => {
  const statements = ['INSERT A', 'INSERT B', 'INSERT C', 'INSERT D']
  const chunks = chunkSqlStatements(statements, { maxBytes: 20, maxStatements: 2 })
  assert.deepEqual(chunks, [['INSERT A', 'INSERT B'], ['INSERT C', 'INSERT D']])
  assert.deepEqual(chunks.flat(), statements)
})

test('超长 SQL 单条保留在单独批次', () => {
  const statements = ['x'.repeat(20), 'y']
  assert.deepEqual(chunkSqlStatements(statements, { maxBytes: 10, maxStatements: 100 }), [['x'.repeat(20)], ['y']])
})
