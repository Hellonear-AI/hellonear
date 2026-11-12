// Search past chats needs the embedder; a run without it should still answer. On 13 Nov NEAR AI's embeddings
// endpoint hung (no answer in 60 s, twice) while chat completions answered, and every run with semantic recall failed
// in Mastra's prepare-memory-step ("Failed to determine the embedder's output dimension"), the hosted demo included.
// So a small probe runs in the background, and while the embedder does not answer, runs go without semantic recall
// (`memoryOptions`): no search of other chats and no embedding of the run's own messages. The chat itself still works.
// The embedder is passed in (server.ts gives it src/models.ts's), so this file loads without the engine's env.
type Embedder = { doEmbed: (o: { values: string[]; abortSignal?: AbortSignal }) => PromiseLike<{ embeddings: number[][] }> }

const PROBE_EVERY_MS = 30_000
const PROBE_TIMEOUT_MS = 8_000

let ready = true
let probing: Promise<boolean> | undefined

// One embedding of a short text, within the timeout. Any vector with values counts as up.
export async function probeEmbedder(model: Embedder, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const out = await model.doEmbed({ values: ['ping'], abortSignal: AbortSignal.timeout(timeoutMs) })
    return (out.embeddings[0]?.length ?? 0) > 0
  } catch {
    return false
  }
}

async function check(model: Embedder): Promise<boolean> {
  probing ??= probeEmbedder(model).then((ok) => {
    if (ok !== ready) console.log(ok ? 'embedder answers again: semantic recall back on' : 'embedder does not answer: runs go without semantic recall')
    ready = ok
    return ok
  }).finally(() => { probing = undefined })
  return probing
}

// Last known state; true until a probe says otherwise.
export const embedderReady = () => ready

// Tests only.
export const setEmbedderReady = (ok: boolean) => { ready = ok }

export function startEmbedderProbe(model: Embedder): void {
  void check(model)
  setInterval(() => void check(model), PROBE_EVERY_MS).unref()
}
