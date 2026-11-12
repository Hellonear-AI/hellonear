---
title: Skills and tools
description: How skills grant tools, why a Mind without a payment skill cannot pay, and where every skill and tool is listed.
---

A **skill** is a playbook plus a fixed list of tools. HelloNear has 33 equippable skills plus a built-in HelloNear guide. A **tool** is one action the model can call, such as `send_payment`, `gmail_list_emails` or `market_search`.

## Skills grant tools

A Mind has exactly the tools its equipped skills grant. The backend sends the engine skill **ids**, never tool names, and the engine resolves the tool list for each request from the skills (`toolsFor` in `engine/src/tools.ts`). A tool no equipped skill grants does not exist for that run, so a Mind without a payment skill cannot pay, whatever an email or a web page tells it.

You can see this in the Attack playground: *Use a skill it doesn't have* ends with `stoppedBy: no_tool`, because `send_payment` never appears.

## How a skill is written

Each skill is a `SKILL.md` in `engine/skills/<id>/` with frontmatter (title, blurb, tools, connections, status) and a playbook in plain words. A unit test checks that every `SKILL.md` parses and uses only registered tools. A skill with status `blocked` is accepted but not loaded.

## Tools that act ask first

Tools that change something (a payment, an email, a calendar event, a Sheets cell, a Notion row, a Doc, a Slack post, a Zoom meeting) pause the run for the owner's approval, with the old value shown next to the new one. Before the card is shown, the tool reads its target again, so an invented id or a stale value never gets a card. Every write also re-reads its target just before writing and refuses if it changed since the card was shown.

## Published skills on chain

The Mind registry contract lets anyone publish a skill with a fixed price (`publish_skill`), and an owner equip it on a Mind (`equip_skill`), paying the publisher. See [Receipts and smart contracts](/contracts).

## Every skill and tool

[The agent](/agent) lists all tools and all skills with the tools each one grants. Through the API: `GET /v1/skills` (the catalog) and `GET /v1/skills/{skillId}` (one skill with its `SKILL.md`).
