// Postgres pool and a minimal migration runner (plain SQL files in migrations/, applied in name order).
import { readdir, readFile } from 'node:fs/promises'
import pg from 'pg'
import { config } from './config.ts'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

export async function query<T extends pg.QueryResultRow = any>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(text, values)).rows
}

export async function migrate(): Promise<string[]> {
  const dir = new URL('../migrations/', import.meta.url)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const client = await pool.connect()
  const applied: string[] = []
  try {
    // One backend instance migrates at a time.
    await client.query('select pg_advisory_lock(4100001)')
    await client.query('create table if not exists be_migrations (name text primary key, applied_at timestamptz not null default now())')
    const done = new Set((await client.query('select name from be_migrations')).rows.map((r) => r.name))
    for (const file of files.filter((f) => !done.has(f))) {
      await client.query('begin')
      try {
        await client.query(await readFile(new URL(file, dir), 'utf8'))
        await client.query('insert into be_migrations (name) values ($1)', [file])
        await client.query('commit')
        applied.push(file)
      } catch (e) {
        await client.query('rollback')
        throw new Error(`migration ${file} failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(4100001)').catch(() => {})
    client.release()
  }
  return applied
}
