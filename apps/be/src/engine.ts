// Client for the engine HTTP API (docs/api-contract.md §2). Only the backend talks to the engine.
import { config } from './config.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

export type MindConfig = {
  templateId: string
  name: string
  soul: { identity: string; invariants: string[]; priors: string[] }
  model?: string
  skills: { skillId: string }[]
  // Present once the name or soul changed (#116): the engine reads memory as userId:mindId:v{n}.
  personaVersion?: number
}
export type EngineSecret = { name: string; value: string; allowedHosts: string[] }
export type SkillInfo = { skillId: string; description: string; status: string; connections: string[]; note?: string }
export type Template = MindConfig & { tagline: string; quote: string; skills: SkillInfo[] }
export type CatalogSkill = SkillInfo & { tools: string[] }

export async function engineFetch(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<Response> {
  try {
    return await fetch(config.engineUrl + path, {
      method: init.method ?? 'GET',
      signal: init.signal,
      headers: { 'x-engine-key': config.engineApiKey, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'engine_unavailable', { reason: fetchFailure(e) })
  }
}

// JSON calls: engine 4xx answers are passed to the browser as they are (they describe the user's input);
// anything else is a backend problem.
export async function engineJson(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await engineFetch(path, init)
  if (res.status >= 500) throw new HttpError(UPSTREAM_ERROR, 'engine_error')
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}

// Templates change only when the engine is redeployed; cache them briefly.
let templatesCache: { at: number; templates: Template[] } | undefined
export async function templates(): Promise<Template[]> {
  if (templatesCache && Date.now() - templatesCache.at < 60_000) return templatesCache.templates
  const { status, body } = await engineJson('/v1/templates')
  if (status !== 200) throw new HttpError(UPSTREAM_ERROR, 'engine_error')
  templatesCache = { at: Date.now(), templates: body.templates }
  return body.templates
}
// Every skill a Mind may equip (engine `GET /v1/skills`), not only those templates start with: the Visual
// Builder needs skills such as `near-account` and `http-request` that no template offers.
let skillsCache: { at: number; skills: CatalogSkill[] } | undefined
export async function skills(): Promise<CatalogSkill[]> {
  if (skillsCache && Date.now() - skillsCache.at < 60_000) return skillsCache.skills
  const { status, body } = await engineJson('/v1/skills')
  if (status !== 200) throw new HttpError(UPSTREAM_ERROR, 'engine_error')
  skillsCache = { at: Date.now(), skills: body.skills }
  return body.skills
}
export const clearTemplatesCache = () => { templatesCache = undefined; skillsCache = undefined }
