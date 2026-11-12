import { API_URL, APP_URL, SITE_URL } from './site'

// /skill.md: an Agent Skill (agentskills.io frontmatter) that tells another agent how to work with HelloNear.
export function skillMd(base = SITE_URL): string {
  return `---
name: hellonear
description: Use HelloNear, an AI agent platform on NEAR testnet where each Mind has a persona, memory, skills and its own wallet whose limits sit outside the model. Use when asked to try HelloNear, call its API, explain its wallet limits and approvals, or check its on-chain receipts.
---

# HelloNear

HelloNear gives a person a Mind: an AI agent with a persona, memory, equippable skills and a NEAR wallet. Payments need the owner's approval, and the wallet's policy (per-payment limit, daily limit, allowed addresses) is checked by OutLayer in a TEE before signing. Everything runs on NEAR testnet.

## Read the docs

- Index of every page: ${base}/llms.txt
- Everything in one file: ${base}/llms-full.txt
- Any page as Markdown: add \`.md\` to its path, for example ${base}/quickstart.md
- MCP server (Streamable HTTP, tools \`search_docs\` and \`read_page\`): ${base}/mcp
- OpenAPI spec: ${base}/openapi.json

## Try the API as a guest

The hosted API is ${API_URL}. A guest session needs no wallet and is deleted after 7 days.

\`\`\`sh
B=${API_URL}
curl -s -c jar -X POST $B/v1/auth/demo -H 'content-type: application/json' -d '{}'
curl -s -b jar $B/v1/templates
curl -s -b jar -X POST $B/v1/minds -H 'content-type: application/json' -d '{"templateId":"payments-mind","name":"Penny"}'
\`\`\`

Chat replies stream as server-sent events (${base}/events). Errors are \`{ error, ...details }\` (${base}/errors).

## Rules to respect

- Never say a refused payment was "rejected on-chain" and never show a transaction link for one: OutLayer refuses it before signing, so no transaction exists.
- Cross-chain payments and Agent Market hiring are quotes only on testnet; nothing is sent.
- A person tries the web app at ${APP_URL} with *Continue as guest*.
`
}
