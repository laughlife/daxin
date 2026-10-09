// mysql2 is loaded dynamically by server/utils/db/pool.ts so the UI can be tested
// without opening a database connection. Deployment installs the runtime package.
declare module 'mysql2/promise' {
  export function createPool(options: Record<string, unknown>): unknown
}
