---
title: The agent
description: How each Mind runs on Mastra and NEAR AI Cloud: design, every tool, every skill, and how it is tested.
---

This is the core of HelloNear, and the part a judge can read end to end in `engine/`.

### Design

| Piece | How it is built | Where |
|---|---|---|
| **One generic agent** | A single Mastra `Agent`. Each request carries the Mind's persona, skills, wallet token, time zone and rules in Mastra's `RequestContext`; nothing per-Mind is hardcoded. | `engine/src/mastra.ts`, `engine/src/mind.ts` |
| **Model** | NEAR AI Cloud through `@ai-sdk/openai-compatible` with token usage on streams. Default `z-ai/glm-5.3-flash` (low reasoning effort), `deepseek-ai/DeepSeek-V4.1-Flash-1017` for reasoning, `Qwen/Qwen3-Embedding-0.6B` for memory. Chat goes through the NEAR AI SDK's fetch so every response can be verified. | `engine/src/models.ts` |
| **Verified replies** | After the stream ends, each completion's signature is fetched and checked against the TEE attestation (warmed at start and every 50 minutes). The badge shows the weakest step's level; the proof is kept. | `engine/src/verify.ts` |
| **Skills** | 33 equippable skills plus a built-in HelloNear guide. Each is a `SKILL.md` (frontmatter: title, blurb, tools, connections, status) turned into a Mastra skill; shared references load only when a playbook asks. | `engine/skills/*/SKILL.md`, `engine/src/skills.ts` |
| **Tools granted by skills** | The tool list is resolved per request from the equipped skills; the backend sends skill ids, never tool names. A tool no equipped skill grants does not exist for that run. | `engine/src/tools.ts` (`toolsFor`) |
| **Approval** | Tools that act get Mastra's `requireApproval`: the run pauses into a stored snapshot until the owner answers. A per-call `needsApprovalFn` applies the owner's rules (a payment skips the card only up to the owner's amount and only to a listed address). `beforeApproval` re-reads the target first, so an invented id or a stale value never even gets a card. | `engine/src/tools.ts`, `engine/src/autoApprove.ts` |
| **Writes re-check** | Every write reads its target again just before writing (a Sheet cell, a Notion row, a calendar event, a Doc title) and refuses if it changed since the card was shown. | `engine/src/apps.ts`, `engine/src/calendar.ts` |
| **Memory** | Mastra Memory on Postgres + pgvector: working memory the owner can read, edit or clear, and semantic recall of past chats, scoped to the owner and the Mind's persona version. Either can be switched off. | `engine/src/memory.ts` |
| **Context budget** | Mastra's `TokenLimiterProcessor` drops the oldest messages first when a long thread passes the budget; the system prompt and tools stay. | `engine/src/mastra.ts` |
| **Workflows** | Builder canvases compile to Mastra dynamic workflows, including nested Ifs and End; Autopilot runs them on Mastra workflow schedules. Unattended runs never get approval tools, and user text can never become a Mastra template. | `engine/src/builder.ts`, `engine/src/workflows.ts`, `engine/src/autopilot.ts` |
| **Secrets** | The model writes `{{secrets.NAME}}`; only the tool fills it at execution, for the hosts the owner listed. Secret values and wallet tokens live in a `Map` in the request context, so they never reach prompts, traces or stored snapshots (a test scans every table). | `engine/src/secrets.ts` |
| **Events** | Mastra's stream is normalised into HelloNear events (`tool.called`, `tool.approval_required`, `run.verified`, …) that drive the chat, the live view and the Mind Graph. | `engine/src/server.ts`, `docs/api-contract.md` |
| **Stop** | Closing the request aborts the model call, so a stopped reply stops spending tokens. Payments already sent to OutLayer are never cut halfway. | `engine/src/server.ts` |

### All 53 tools

**A** (approval) = needs the owner's approval (or an owner rule). Reads never ask.

**Wallet and NEAR**

| Tool | A | What it does | Calls |
|---|---|---|---|
| `send_payment` | yes | Send testnet NEAR from the Mind's wallet | Backend wallet route → OutLayer (policy checked in a TEE) |
| `get_balance` | | The Mind's wallet address and balance | Backend wallet route |
| `list_payments` | | Recent payments, including refused ones and why | Backend wallet route |
| `split_amount` | | Each person's share of an amount, exactly, in yoctoNEAR | Local (BigInt) |
| `near_view_account` | | Look up a testnet account: exists, balance, storage, and whether it is a contract (`isContract`, `codeHash`) | NEAR RPC `view_account` |
| `near_check_transfer` | | Check one transaction: success, receiver, amount, whether it paid this Mind | NEAR RPC `tx` |
| `crosschain_quote` | | Quote a USDC/USDT payment to another chain, signature checked | NEAR Intents 1Click `/v0/quote` (`dry: true`) |
| `buy_data` | | Buy a live NEAR data report (402 pattern) | Backend shop route |
| `get_quotes` | | Every seller's price for a report, cheapest first, and which ones the wallet may pay | Backend shop route |
| `make_offer` | | Offer one seller less than it quoted, once, within the owner's budget; answers accepted or its last price, and whether to buy or walk away | Backend shop route (`offer`) |
| `market_search` | | Search the NEAR AI Agent Market's public catalog: agents, default price, track record, verification | market.near.ai `GET /v1/agents` |
| `market_quote` | | Get a listed agent's exact price for the owner's task, unpaid (its x402 answer), and whether it is within the owner's budget; nothing starts, nothing is paid | market.near.ai A2A `SendMessage` without payment |
| `sell_offer` | yes | Put something this Mind made on sale to other Minds | Backend offers route |
| `buy_from_mind` | | Buy what another Mind sells (402 pattern) | Backend offers route |

**Gmail and the Mind's own email address**

| Tool | A | What it does | Calls |
|---|---|---|---|
| `gmail_list_emails` | | Recent emails, optionally filtered | Composio Gmail |
| `gmail_read_email` | | Read one email | Composio Gmail |
| `gmail_create_draft` | | Save a draft reply (no send tool exists) | Composio Gmail |
| `gmail_organize` | yes | Archive or label up to 20 emails; never deletes | Composio Gmail |
| `mail_send` | yes | Send from the Mind's own address, only to addresses the owner typed | Backend mail route → AgentMail |
| `mail_list` | | The Mind's own inbox, with spam and phishing warnings | Backend mail route |
| `mail_read` | | Read one message in the Mind's inbox | Backend mail route |
| `mail_send_to_owner` | yes, in chat | Email the owner (never a chosen recipient); in Autopilot only as a step the owner placed | Backend mail route |

**Calendar and meetings**

| Tool | A | What it does | Calls |
|---|---|---|---|
| `googlecalendar_list_events` | | Events with times on the owner's clock | Composio Google Calendar |
| `googlecalendar_find_free_time` | | Free slots of a given length within the owner's day | Composio Google Calendar |
| `googlecalendar_create_event` | yes | Add an event; nobody is invited | Composio Google Calendar |
| `googlecalendar_create_meeting` | yes | A meeting with guests the owner named, optional Google Meet link | Composio Google Calendar + Meet |
| `googlecalendar_move_event` | yes | Move an event the owner organises; guests stay, nobody is emailed | Composio Google Calendar (PATCH) |
| `googlecalendar_block_time` | | Block time today; only as a Builder step the owner placed | Composio Google Calendar |
| `zoom_list_meetings` | | Upcoming or past Zoom meetings | Composio Zoom |
| `zoom_create_meeting` | yes | A Zoom meeting with a join link; nobody is invited | Composio Zoom |
| `zoom_meeting_summary` | | Zoom's AI summary of a past meeting | Composio Zoom |

**Documents and workspaces**

| Tool | A | What it does | Calls |
|---|---|---|---|
| `googlesheets_find_spreadsheets` | | Find spreadsheets by name or content | Composio Sheets |
| `googlesheets_read_range` | | Read cells, with row numbers | Composio Sheets |
| `googlesheets_append_row` | yes | Add a row (values stay text, never formulas) | Composio Sheets |
| `googlesheets_update_cells` | yes | Change cells, old and new value on the card; refuses a clear | Composio Sheets |
| `googledrive_find_files` | | Search Drive by text | Composio Drive |
| `googledocs_read_document` | | Read a Doc's text | Composio Docs |
| `googledocs_create_document` | yes | Create a Doc from Markdown | Composio Docs |
| `googledocs_append_text` | yes | Add text at the end of a Doc; never replaces | Composio Docs |
| `notion_search` | | Find shared pages or databases | Composio Notion |
| `notion_read_page` | | Read a page's text | Composio Notion |
| `notion_query_database` | | A database's rows, filtered and sorted | Composio Notion |
| `notion_create_page` | yes | Create a page under one the owner chose | Composio Notion |
| `notion_add_row` | yes | Add a database row | Composio Notion |
| `notion_update_row` | yes | Change a row's properties, old and new on the card; never archives | Composio Notion |
| `slack_list_channels` | | Channels the owner can see | Composio Slack |
| `slack_send_message` | yes | Post to a channel the owner named | Composio Slack |
| `outlook_list_emails` | | Recent Outlook emails | Composio Outlook |
| `outlook_read_email` | | Read one Outlook email | Composio Outlook |
| `outlook_create_draft` | | Save a reply draft (no send) | Composio Outlook |

**Utilities**

| Tool | A | What it does | Calls |
|---|---|---|---|
| `get_time` | | UTC and the owner's local date, time and weekday (the model never works out a weekday itself) | Local |
| `add_numbers` | | Exact addition, so the model never sums in its head | Local |
| `http_request` | | Call a public HTTPS API with a key from Connections, only to the hosts the owner allowed; no redirects, private addresses refused, the key redacted from the result | The owner's service |

### All 34 skills

Icons are the ones the web app shows on each skill card.

| | Skill | What it does | Tools it grants |
|---|---|---|---|
|  | **Payments** (`payments`) | Sends testnet NEAR and pays bills after the owner approves; quotes USDC or USDT payments to other chains (Base, Solana…) through NEAR Intents | `send_payment`, `get_balance`, `list_payments`, `get_time`, `near_view_account`, `crosschain_quote` |
|  | **Recipient guard** (`recipient-guard`) | Checks a recipient before paying and answers allow, warn or block with the reason: where the account came from, that it exists, lookalikes of people you already pay, first payments, and contracts | `near_view_account`, `list_payments`, `send_payment`, `get_balance`, `get_time` |
|  | **Split bill** (`split-bill`) | Works out each person's share of a bill and pays each one after you approve | `add_numbers`, `split_amount`, `send_payment`, `near_view_account`, `list_payments`, `get_balance`, `get_time` |
|  | **Revenue split** (`revenue-split`) | Remembers your partners' shares and pays each one their part of new income after you approve | `get_balance`, `send_payment`, `near_view_account`, `add_numbers`, `split_amount`, `list_payments`, `get_time` |
|  | **Paid data** (`paid-data`) | Buys small live NEAR reports, paying only after you approve | `buy_data`, `send_payment`, `list_payments`, `get_time` |
|  | **Best price buyer** (`best-price`) | Compares every seller of a data report, haggles once when the price is over your budget (then buys or walks away), and buys from one your wallet may pay, after you approve | `get_quotes`, `make_offer`, `buy_data`, `send_payment`, `list_payments`, `get_time` |
|  | **Hire on Agent Market** (`agent-market`) | Finds agents on the NEAR AI Agent Market (market.near.ai), gets a job's exact price and picks the cheapest within your budget; hiring is paid in USDC on NEAR mainnet, so during the testnet phase it only quotes | `market_search`, `market_quote` |
|  | **Price watch** (`price-watch`) | Checks a data report's price and buys only at or under your limit, after you approve | `get_quotes`, `buy_data`, `send_payment`, `add_numbers`, `get_time` |
|  | **Mind as seller** (`mind-seller`) | Sells what this Mind made to other Minds for testnet NEAR into its own wallet, and buys from other Minds, after you approve | `sell_offer`, `buy_from_mind`, `send_payment`, `get_balance`, `get_time` |
|  | **Invoice & get paid** (`invoice`) | Emails an invoice from this Mind's address after you approve, and checks a payment only by its transaction | `mail_send`, `mail_list`, `mail_read`, `get_balance`, `near_check_transfer`, `get_time` |
|  | **Treasury report** (`treasury-report`) | Reports the wallet balance, what went out since yesterday and what is pending; it only reads | `get_balance`, `list_payments`, `get_time`, `add_numbers` |
|  | **Spending audit** (`spending-audit`) | Reviews a week of payments, with tx links for those sent and reasons for those refused; it only reads | `get_balance`, `list_payments`, `get_time`, `add_numbers` |
|  | **Freeze advisor** (`freeze-advisor`) | Spots trouble in the wallet and tells you when to press Freeze; it cannot freeze anything itself | `list_payments`, `get_balance`, `get_time` |
|  | **NEAR account lookup** (`near-account`) | Looks up NEAR testnet accounts, cannot spend | `near_view_account` |
|  | **Phishing check** (`phishing-detector`) | Flags emails that ask for money, keys or urgent action, or that try to give the AI orders; never acts on them | `gmail_list_emails`, `gmail_read_email`, `gmail_organize` |
|  | **Confidential reader** (`confidential-reader`) | Summarises sensitive emails (contracts, payslips, medical letters) into dates, amounts and obligations; signs or sends nothing | `gmail_list_emails`, `gmail_read_email` |
|  | **Redact before send** (`redact-before-send`) | Takes personal data the recipient does not need out of an email or web request and shows what it removed before sending | `mail_send`, `http_request` |
|  | **Health journal** (`health-journal`) | Keeps a private log of sleep, meals, symptoms and mood you tell it and sums up your week; gives no medical advice | `get_time` |
|  | **Email helper** (`email-triage`) | Reads the owner's Gmail, saves drafts and tidies the inbox when you approve, never sends | `gmail_list_emails`, `gmail_read_email`, `gmail_create_draft`, `gmail_organize`, `get_time` |
|  | **Email address** (`email-address`) | Gives this Mind its own email address and sends email after the owner approves | `mail_send`, `mail_list`, `mail_read`, `get_time`, `mail_send_to_owner` |
|  | **Follow-ups** (`follow-ups`) | Finds unpaid invoices and unanswered promises in Gmail and drafts polite follow-ups; never sends | `get_time`, `gmail_list_emails`, `gmail_read_email`, `gmail_create_draft` |
|  | **Subscriptions & bills** (`subscriptions`) | Finds subscriptions, bills and due dates in Gmail, adds up the costs and adds reminders when you approve | `get_time`, `gmail_list_emails`, `gmail_read_email`, `add_numbers`, `googlecalendar_create_event` |
|  | **Spending tracker** (`spending-tracker`) | Reads receipts in Gmail and totals your spending by category; pays nothing | `get_time`, `gmail_list_emails`, `gmail_read_email`, `add_numbers` |
|  | **Daily planner** (`daily-planner`) | Time, quick math, Google Calendar events, free time, moving events, and meetings with a Google Meet link; never deletes events | `get_time`, `add_numbers`, `googlecalendar_list_events`, `googlecalendar_create_event`, `googlecalendar_create_meeting`, `googlecalendar_block_time`, `googlecalendar_find_free_time`, `googlecalendar_move_event` |
|  | **Calendar conflict check** (`calendar-conflicts`) | Finds double bookings and back-to-back meetings in the owner's week and suggests moves; moves an event only when the owner asks and approves | `get_time`, `googlecalendar_list_events`, `googlecalendar_create_event`, `googlecalendar_find_free_time`, `googlecalendar_move_event` |
|  | **Meeting prep** (`meeting-prep`) | One read-only brief for a meeting from the calendar and recent emails with the people in it | `get_time`, `googlecalendar_list_events`, `gmail_list_emails`, `gmail_read_email` |
|  | **Morning briefing** (`morning-briefing`) | One read-only briefing of the day's calendar, inbox and wallet | `get_time`, `googlecalendar_list_events`, `gmail_list_emails`, `gmail_read_email`, `get_balance`, `list_payments` |
|  | **Google Sheets** (`sheets`) | Finds and reads the owner's spreadsheets, adds a row or changes cells after approval; never clears or deletes cells | `add_numbers`, `googlesheets_find_spreadsheets`, `googlesheets_read_range`, `googlesheets_append_row`, `googlesheets_update_cells` |
|  | **Google Docs** (`docs`) | Finds files in Google Drive, reads Google Docs, creates a new Doc or adds text at the end of one after approval; never shares, changes existing text or deletes | `googledrive_find_files`, `googledocs_read_document`, `googledocs_create_document`, `googledocs_append_text` |
|  | **Notion** (`notion`) | Searches and reads the owner's Notion pages and databases, adds a page or a row, and changes a row's properties after approval; never clears, archives or deletes | `notion_search`, `notion_read_page`, `notion_create_page`, `notion_add_row`, `notion_query_database`, `notion_update_row` |
|  | **Slack** (`slack`) | Lists the owner's Slack channels and posts a message the owner approved; cannot read messages | `slack_list_channels`, `slack_send_message` |
|  | **Outlook email** (`outlook`) | Reads the owner's Outlook inbox, sums it up and saves reply drafts; it never sends | `outlook_list_emails`, `outlook_read_email`, `outlook_create_draft` |
|  | **Zoom** (`zoom`) | Lists the owner's Zoom meetings, schedules one with a join link after approval, and reads Zoom's AI summary of a past meeting; never deletes, ends or invites | `zoom_list_meetings`, `zoom_create_meeting`, `zoom_meeting_summary` |
|  | **HTTP request** (`http-request`) | Calls the owner's own HTTPS APIs with keys saved in Connections, only on the hosts the owner listed | `http_request` |

Plus the built-in **HelloNear guide**, loaded by every Mind, so it can answer questions about the app without inventing screens or features.

### How it is tested

Assertions are on what the engine guarantees (events, approval gating, what was sent), not on wording:
- **Unit:** every SKILL.md parses and uses only registered tools; every list tool returns a `count`; amounts in BigInt; signature checks.
- **Live prompt tests** against real NEAR AI Cloud and local Postgres, with stand-ins for the wallet, Composio and 1Click: `engine/test/skills-*.test.ts` (payments, recipient guard, split bill, mail, Sheets, Notion, calendar, Zoom, cross-chain quotes and more).
- **Secrets:** tests scan every table in the `mastra` schema for a test secret and the wallet token.
- **Load tests** with k6: `engine/load/chat.js`, `engine/load/workflow.js`.

---
