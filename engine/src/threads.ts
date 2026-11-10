// Forgetting a chat the owner deleted (#207). Semantic recall is resource-scoped (`userId:mindId[:vN]`), so a deleted
// thread's messages would otherwise keep coming back, by vector search, in the Mind's other chats.
// `Memory.deleteThread` (@mastra/memory 1.40) calls `PostgresStore.deleteThread` (@mastra/pg 1.34), which in one
// transaction deletes the thread's rows in `mastra_messages`, its rows in every `memory_messages*` vector table of
// the schema (today `mastra.memory_messages_1024`, matched on `metadata->>'thread_id'`) and the `mastra_threads` row.
// Memory then starts its own cleanup over every `memory_messages*` / `memory_observations*` index in the background;
// `settled()` waits for it, so the answer comes after every copy is gone.
// Working memory is per resource (`mastra_resources`), not per thread: it stays, as decided on #207.
import { mindAgent } from './mastra.ts'
import { ownsResource } from './mind.ts'

// 'missing': Mastra has no such thread (never chatted, or already forgotten), so there is nothing to do.
// 'not_owner': the thread belongs to another user or Mind and is left alone.
export async function forgetThread(userId: string, mindId: string, threadId: string): Promise<'forgotten' | 'missing' | 'not_owner'> {
  // From the agent, which hands the memory the Mastra instance's storage, as in a run.
  const memory = (await mindAgent.getMemory())!
  const thread = await memory.getThreadById({ threadId })
  if (!thread) return 'missing'
  if (!ownsResource(thread.resourceId, userId, mindId)) return 'not_owner'
  await memory.deleteThread(threadId)
  await memory.settled()
  return 'forgotten'
}
