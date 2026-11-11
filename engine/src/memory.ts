// A Mind's working memory as its owner sees it in Settings (#209), for one resource `userId:mindId[:vN]`
// (`resourceId` in mind.ts, the key chat runs use).
// Working memory is free Markdown here: `src/mastra.ts` sets no `template` or `schema`, so the Mind writes whatever
// Markdown it wants (Mastra's default template, "# User Information" with bullet fields, is only a suggestion it is
// shown) and every `updateWorkingMemory` call replaces the whole document (replace semantics; @mastra/memory 1.40
// docs, docs-memory-working-memory.md). It lives in `mastra.mastra_resources` (`workingMemory`, `updatedAt`), one row
// per resource, written by `PostgresStore.updateResource`, which stamps `updatedAt` on every write.
import { mindAgent, storage } from './mastra.ts'

export type WorkingMemory = { markdown: string; updatedAt: string | null }

// From the agent, like threads.ts: the memory the agent runs with, so writes share its per-resource mutex.
const memory = async () => (await mindAgent.getMemory())!

export async function readWorkingMemory(resource: string): Promise<WorkingMemory> {
  const row = await (await storage.getStore('memory'))!.getResourceById({ resourceId: resource })
  const markdown = row?.workingMemory ?? ''
  // A cleared document is an empty string; it has no "updated" time worth showing.
  return { markdown, updatedAt: markdown && row?.updatedAt ? new Date(row.updatedAt).toISOString() : null }
}

// Replaces the whole document, as the Mind's own tool does. Resource scope ignores the thread id.
export async function writeWorkingMemory(resource: string, markdown: string): Promise<WorkingMemory> {
  await (await memory()).updateWorkingMemory({ threadId: '', resourceId: resource, workingMemory: markdown })
  return readWorkingMemory(resource)
}

// Clearing writes an empty document: `Memory.getWorkingMemory` reads '' as none, so the next run starts from the
// template again. Recall embeddings of past chats are not touched (deleting a chat removes those, #207).
export async function clearWorkingMemory(resource: string): Promise<void> {
  await writeWorkingMemory(resource, '')
}
