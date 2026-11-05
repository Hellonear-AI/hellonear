// Client for the engine HTTP API (docs/api-contract.md §2). Only the backend talks to the engine.
import { config } from './config.ts'
import { HttpError } from './http.ts'

export type MindConfig = {
  templateId: string
  name: string
  soul: { identity: string; invariants: string[]; priors: string[] }
  model?: string
  skills: { skillId: string }[]
}
export type EngineSecret = { name: string; value: string; allowedHosts: string[] }
export type Template = MindConfig & { tagline: string; skills: { skillId: string; description: string; status: string; connections: string[]; note?: string }[] }

export async function engineFetch(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  try {
    return await fetch(config.engineUrl + path, {
      method: init.method ?? 'GET',
      headers: { 'x-engine-key': config.engineApiKey, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new HttpError(502, 'engine_unavailable')
  }
}

// JSON calls: engine 4xx answers are passed to the browser as they are (they describe the user's input);
// anything else is a backend problem.
export async function engineJson(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await engineFetch(path, init)
  if (res.status >= 500) throw new HttpError(502, 'engine_error')
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}

// Templates change only when the engine is redeployed; cache them briefly.
let templatesCache: { at: number; templates: Template[] } | undefined
export async function templates(): Promise<Template[]> {
  if (templatesCache && Date.now() - templatesCache.at < 60_000) return templatesCache.templates
  const { status, body } = await engineJson('/v1/templates')
  if (status !== 200) throw new HttpError(502, 'engine_error')
  templatesCache = { at: Date.now(), templates: body.templates }
  return body.templates
}
export const clearTemplatesCache = () => { templatesCache = undefined }
