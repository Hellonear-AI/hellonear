// The sidebar, and the order of /llms.txt. Every docs page in content/ must appear here once (a test checks it);
// the trust pages have their own tabs.
export const NAV: { title: string; slugs: string[] }[] = [
  { title: 'Get started', slugs: ['', 'quickstart', 'how-it-works', 'tech-stack'] },
  {
    title: 'Concepts',
    slugs: ['minds', 'skills', 'wallet-and-approvals', 'verified-replies', 'privacy', 'autopilot', 'telegram', 'connections', 'agent'],
  },
  { title: 'Track features', slugs: ['tracks', 'haggling', 'agent-market', 'contract-check', 'payments-csv', 'relayer', 'swarm-auction'] },
  { title: 'API', slugs: ['api-reference', 'api', 'events', 'errors', 'status'] },
  { title: 'Smart contracts', slugs: ['contracts'] },
  { title: 'More', slugs: ['run-locally', 'connectors', 'hackathon-phase'] },
]

export const TRUST_TABS: { slug: string; label: string }[] = [
  { slug: 'trust', label: 'Overview' },
  { slug: 'trust/resources', label: 'Resources' },
  { slug: 'trust/subprocessors', label: 'Subprocessors' },
  { slug: 'trust/faq', label: 'FAQ' },
  { slug: 'trust/updates', label: 'Updates' },
]
