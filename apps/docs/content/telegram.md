---
title: Telegram
description: Chat with a Mind from Telegram, with streamed replies and Approve or Decline buttons, answered only in the owner's chat.
---

Each Mind can have its own Telegram bot. The owner makes the bot with @BotFather and gives its token to HelloNear in the Mind's settings.

## How it works

- **Linking:** HelloNear checks the token with Telegram, stores it encrypted, and answers with a one-time `t.me/<bot>?start=<code>` link. The private chat that sends that code becomes the owner. Every other chat is ignored without a reply.
- **Chat:** an owner message runs as a normal chat, in one thread per bot, with the same events and limits as the app. Times are in UTC, since Telegram sends no time zone.
- **Streaming:** the reply appears at once and the same message is edited as it grows, at most once every 1.5 s, with "typing…" while a tool runs.
- **Rich text:** the Mind's Markdown is converted to Telegram's HTML by HelloNear's own small converter. Only http and https links become links, and a labelled link shows its host after it, so a stranger cannot hide where a link goes.

## Approvals in Telegram

Each approval the Mind asks for comes as its own message with the same checks as the app's card, and buttons **Approve**, **Decline** and **Open in app**. Only a press from the owner's chat counts; anyone else gets "Only the owner can approve". The first press uses up both buttons. There is no Approve button when the wallet policy would refuse the payment or the wallet holds less than the payment.

Approval cards never read their words as Markdown: their text comes from tool arguments (an email subject, an event title someone else wrote), so nobody can inject a link into a message that asks the owner to approve.

The app and Telegram cannot resume one run twice: a run is claimed in one database update before it continues.

## Through the API

`PUT /v1/minds/{id}/telegram { token }` links a bot; `DELETE` unlinks it. See the [API reference](/api-reference).
