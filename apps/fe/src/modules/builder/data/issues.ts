// The engine's `400 invalid_workflow` issues, each pinned to the block it is about (B1.3).

export type EngineIssue = { node: string | null; text: string }

/**
 * The engine names blocks by their ids ("node ask-x", "nodes.2…"): pin each issue to its block,
 * given the saved canvas's node ids in order, and drop the id from the words shown.
 */
export function engineIssues(raw: { path?: string; message?: string }[], ids: string[]): EngineIssue[] {
  return raw.map((i) => {
    const where = `${i.path ?? ""} ${i.message ?? ""}`
    const byId = where.match(/node ([\w-]+)/)?.[1]
    const byIndex = where.match(/nodes\.(\d+)/)?.[1]
    const node = byId && ids.includes(byId) ? byId : byIndex !== undefined ? (ids[Number(byIndex)] ?? null) : null
    return { node, text: (i.message ?? "This job contains something that is not allowed.").replace(/^node [\w-]+:\s*/, "") }
  })
}
