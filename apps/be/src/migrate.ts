// `bun run migrate`: applies pending migrations and exits.
import { migrate, pool } from './db.ts'

const applied = await migrate()
console.log(applied.length ? `applied ${applied.join(', ')}` : 'no pending migrations')
await pool.end()
