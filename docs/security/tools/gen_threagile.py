import json, subprocess, sys
def da(id, desc, conf, integ, avail, qty='many', origin='Owner'):
    return dict(id=id, description=desc, usage='business', tags=[], origin=origin, owner='HelloNear team', quantity=qty,
                confidentiality=conf, integrity=integ, availability=avail, justification_cia_rating=desc)
data_assets = {
 'Session Cookie': da('session-cookie','hn_session cookie; only sha256(token) is stored','confidential','critical','operational'),
 'Chat and Memory': da('chat-memory','Messages, run events and Mind memory (may hold email and calendar content)','confidential','important','operational'),
 'Stored Secrets': da('stored-secrets','OutLayer wallet keys, user API keys, Telegram bot tokens; AES-256-GCM with SECRETS_MASTER_KEY','strictly-confidential','critical','important'),
 'Service Keys': da('service-keys','be.env and engine.env: NEAR AI, Composio, AgentMail, demo wallet key, master key','strictly-confidential','critical','critical','very-few','HelloNear team'),
 'Payment Records': da('payment-records','wallet_payments rows and receipts (testnet NEAR)','restricted','critical','operational'),
 'AI Credit': da('ai-credit','The shared NEAR AI Cloud credit of the team, spent by every run','internal','important','critical','very-few','HelloNear team'),
 'Public Status': da('public-status','/v1/health and /v1/status answers','public','operational','operational'),
 'Source Code': da('source-code','Public GitHub repository; main is deployed automatically','public','critical','important','few','HelloNear team'),
}
def link(target, desc, proto, authn, authz, sent, recv, ro=False, ipf=False, usage='business'):
    return dict(target=target, description=desc, protocol=proto, authentication=authn, authorization=authz, tags=[], vpn=False,
                ip_filtered=ipf, readonly=ro, usage=usage, data_assets_sent=sent, data_assets_received=recv)
def ta(id, desc, typ, tech, internet, machine, conf, integ, avail, processed, stored, links=None, human=False, out=False, custom=False, enc='none', size='service', usage='business', formats=('json',)):
    return dict(id=id, description=desc, type=typ, usage=usage, used_as_client_by_human=human, out_of_scope=out,
                justification_out_of_scope='Third-party service, not operated by HelloNear' if out else '', size=size, technology=tech, tags=[],
                internet=internet, machine=machine, encryption=enc, owner='Third party' if out else 'HelloNear team',
                confidentiality=conf, integrity=integ, availability=avail, justification_cia_rating=desc,
                multi_tenant=out, redundant=False, custom_developed_parts=custom,
                data_assets_processed=processed, data_assets_stored=stored, data_formats_accepted=list(formats), communication_links=links or {})
technical_assets = {
 'Owner Browser': ta('owner-browser','The owner or a guest in a browser, with a NEAR wallet (Meteor)','external-entity','browser',True,'physical','confidential','important','operational',['session-cookie','chat-memory'],[],
    {'Browser to Edge': link('cloudflare-edge','All web app and API traffic','https','session-id','enduser-identity-propagation',['session-cookie','chat-memory'],['chat-memory','payment-records','public-status'])}, human=True, out=True, size='component'),
 'Cloudflare Edge': ta('cloudflare-edge','Cloudflare proxy for hellonear.xyz: TLS, DDoS protection, managed ruleset, one rate-limit rule on /v1/ (60 requests per 10 s per IP)','process','waf',True,'virtual','confidential','critical','critical',['session-cookie','chat-memory'],[],
    {'Edge to Tunnel': link('tunnel-host','Cloudflare Tunnel','https','token','technical-user',['session-cookie','chat-memory'],['chat-memory','payment-records','public-status'])}, out=True),
 'Tunnel Host': ta('tunnel-host','cloudflared on a LAN machine separate from the app container; forwards to ports 4000, 3000, 3100','process','reverse-proxy',False,'physical','confidential','critical','critical',['session-cookie','chat-memory'],[],
    {'Tunnel to Backend': link('backend-api','HTTP on the LAN; the CF-Connecting-IP header carries the visitor IP','http','none','none',['session-cookie','chat-memory'],['chat-memory','payment-records','public-status'],ipf=True),
     'Tunnel to Web App': link('web-app','HTTP on the LAN','http','none','none',[],[],ro=True,ipf=True)}),
 'Web App': ta('web-app','Next.js web app (apps/fe), port 3000; the browser calls api.hellonear.xyz directly','process','web-application',False,'container','internal','important','operational',[],[],custom=True, size='application'),
 'Backend API': ta('backend-api','apps/be on node:http, port 4000: sessions, NEP-413 login, run relay, limits, secrets, wallets','process','web-service-rest',False,'container','strictly-confidential','critical','critical',['session-cookie','chat-memory','stored-secrets','service-keys','payment-records','ai-credit','public-status'],[],
    {'Backend to Postgres': link('postgres','Loopback SQL','jdbc','credentials','technical-user',['chat-memory','stored-secrets','payment-records','session-cookie'],['chat-memory','stored-secrets','payment-records','session-cookie']),
     'Backend to Engine': link('engine','Loopback HTTP with X-Engine-Key; the Mind config and secrets go with each run','http','token','technical-user',['chat-memory','stored-secrets'],['chat-memory']),
     'Backend to OutLayer': link('outlayer','Wallet API (testnet) with the Mind wallet key','https','token','technical-user',['stored-secrets','payment-records'],['payment-records']),
     'Backend to Composio': link('composio','Connect Links and connection status','https','token','technical-user',['service-keys'],['chat-memory']),
     'Backend to AgentMail': link('agentmail','Mind inboxes and sends','https','token','technical-user',['chat-memory'],['chat-memory']),
     'Backend to Telegram': link('telegram','Bot API with the bot token of each Mind','https','token','technical-user',['chat-memory','stored-secrets'],['chat-memory']),
     'Backend to NEAR RPC': link('near-rpc','Access-key lookup at login, transaction checks','https','none','none',[],['payment-records'],ro=True)}, custom=True, size='application'),
 'Engine': ta('engine','Mastra engine, port 4100 (no firewall allow rule): agent runs, tools, Autopilot schedules','process','ai',False,'container','strictly-confidential','critical','critical',['chat-memory','stored-secrets','service-keys','ai-credit'],[],
    {'Engine to NEAR AI': link('near-ai-cloud','Model calls in a TEE, paid from the shared credit','https','token','technical-user',['chat-memory','ai-credit'],['chat-memory']),
     'Engine to Backend Internal': link('backend-api','/internal/v1/* on loopback: engine key plus a per-Mind wallet or mail token','http','token','technical-user',['payment-records'],['payment-records']),
     'Engine to Postgres': link('postgres','Mastra storage and vectors','jdbc','credentials','technical-user',['chat-memory'],['chat-memory']),
     'Engine to Composio': link('composio','Tool execution in a per-user session (Gmail, Calendar and others)','https','token','technical-user',['chat-memory'],['chat-memory'])}, custom=True, size='application'),
 'Postgres': ta('postgres','Postgres 17 + pgvector, loopback only, same container','datastore','database',False,'container','strictly-confidential','critical','critical',['chat-memory','stored-secrets','payment-records','session-cookie'],['chat-memory','stored-secrets','payment-records','session-cookie'], enc='data-with-symmetric-shared-key', size='component'),
 'Autodeploy Machine': ta('autodeploy-machine','LAN machine with the poller: after CI passes on main it builds and deploys over SSH','process','build-pipeline',False,'physical','strictly-confidential','critical','important',['source-code','service-keys'],[],
    {'Autodeploy to GitHub': link('github','gh CLI: read main, post the deploy comment','https','token','technical-user',[],['source-code'],usage='devops'),
     'Autodeploy to Container': link('backend-api','SSH through the Proxmox node, runs deploy.sh','ssh','client-certificate','technical-user',['source-code'],[],usage='devops')}, usage='devops'),
 'GitHub': ta('github','Public repository and Actions CI (no secrets in CI)','datastore','sourcecode-repository',True,'virtual','public','critical','important',['source-code'],['source-code'], out=True, usage='devops', formats=('file',)),
 'NEAR AI Cloud': ta('near-ai-cloud','Model inference in a TEE','process','ai',True,'virtual','confidential','important','critical',['chat-memory','ai-credit'],[], out=True),
 'OutLayer': ta('outlayer','Mind wallets; policy checked in a TEE before signing (testnet)','process','web-service-rest',True,'virtual','strictly-confidential','critical','important',['stored-secrets','payment-records'],['payment-records'], out=True),
 'Composio': ta('composio','OAuth connections and app tools','process','web-service-rest',True,'virtual','confidential','important','operational',['chat-memory'],['chat-memory'], out=True),
 'AgentMail': ta('agentmail','Mind email inboxes','process','web-service-rest',True,'virtual','confidential','important','operational',['chat-memory'],['chat-memory'], out=True),
 'Telegram': ta('telegram','Bot API; calls POST /v1/telegram/{mindId}/webhook through the edge with a secret-token header','process','web-service-rest',True,'virtual','confidential','important','operational',['chat-memory'],[],
    {'Telegram Webhook': link('cloudflare-edge','Webhook updates','https','token','technical-user',['chat-memory'],[])}, out=True),
 'NEAR RPC': ta('near-rpc','FastNear testnet RPC','process','web-service-rest',True,'virtual','public','important','operational',['payment-records'],[], out=True),
}
tb = lambda id, desc, typ, inside, nested=(): dict(id=id, description=desc, type=typ, tags=[], technical_assets_inside=inside, trust_boundaries_nested=list(nested))
trust_boundaries = {
 'Internet': tb('internet','Public internet and third-party services','network-dedicated-hoster',['cloudflare-edge','github','near-ai-cloud','outlayer','composio','agentmail','telegram','near-rpc']),
 'Home LAN': tb('home-lan','LAN behind the router: tunnel host and autodeploy machine','network-on-prem',['tunnel-host','autodeploy-machine'],['app-container']),
 'App Container': tb('app-container','Debian 13 LXC on Proxmox; firewall inbound DROP, ports 4000, 3000 and 3100 only from the tunnel host, SSH from the LAN','network-virtual-lan',['web-app','backend-api','engine','postgres']),
}
model = dict(
 threagile_version='1.0.0', title='HelloNear hosted demo', date='2026-11-14',
 author=dict(name='HelloNear team', homepage='https://hellonear.xyz'),
 management_summary_comment='Threat model of the hosted hackathon demo. Built from the repository (docs/openapi.json, deploy/README.md, apps/be/CLAUDE.md) and issue 327. Everything runs on NEAR testnet; no real money moves.',
 business_criticality='important',
 business_overview=dict(description='HelloNear gives each owner a Mind: an AI assistant that reads email, works in apps and pays from its own wallet. Limits sit outside the model: owner approval and an OutLayer policy checked in a TEE.', images=[]),
 technical_overview=dict(description='Browser to Cloudflare to a Cloudflare Tunnel on a LAN host to one LXC container (web app, backend, engine, Postgres). The backend relays runs to the engine on loopback; the engine calls NEAR AI Cloud.', images=[]),
 questions={'Is disk encryption on for the Proxmox node?': '', 'Who else on the LAN can reach SSH on the container?': '', 'Does the engine block private and loopback addresses in the http-request skill?': ''},
 abuse_cases={'Credit exhaustion': 'An attacker creates free testnet accounts and starts runs until the shared NEAR AI credit or the daily cap is used up.',
              'Injected payment': 'An email or web page read by a Mind tells it to pay an attacker.',
              'Key theft': 'An attacker reads be.env or the database and decrypts wallet keys.'},
 security_requirements={'Limits outside the model': 'Every payment needs the owner approval or an owner rule, and the OutLayer policy is checked in a TEE.',
                        'Internal routes on loopback only': 'cloudflared must not run inside the container.',
                        'Secrets only in env files': 'Never in code, logs, issues or prompts.'},
 tags_available=[], data_assets=data_assets, technical_assets=technical_assets, trust_boundaries=trust_boundaries,
 shared_runtimes={'App Container Runtime': dict(id='app-container-runtime', description='One LXC container runs the web app, backend, engine and Postgres', tags=[], technical_assets_running=['web-app','backend-api','engine','postgres'])},
 individual_risk_categories={}, risk_tracking={},
)
ids = {v['id'] for v in technical_assets.values()}; dids = {v['id'] for v in data_assets.values()}
for n, t in technical_assets.items():
    for d in t['data_assets_processed'] + t['data_assets_stored']: assert d in dids, (n, d)
    for ln, l in t['communication_links'].items():
        assert l['target'] in ids, (n, ln)
        for d in l['data_assets_sent'] + l['data_assets_received']: assert d in dids, (n, ln, d)
inside = [a for b in trust_boundaries.values() for a in b['technical_assets_inside']]
assert len(inside) == len(set(inside)) and set(inside) <= ids
out = subprocess.run(['ruby','-rjson','-ryaml','-e','puts JSON.parse(STDIN.read).to_yaml(line_width: -1)'], input=json.dumps(model), capture_output=True, text=True, check=True).stdout
open(sys.argv[1],'w').write(out.replace('---\n','',1).replace("date: '2026-11-14'",'date: 2026-11-14'))
print('ok:', len(ids), 'assets,', len(dids), 'data assets; outside any boundary:', sorted(ids - set(inside)))
