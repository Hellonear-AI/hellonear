---
name: slack
description: 'Use when the owner wants to post something to a Slack channel ("post this summary to #finance", "tell the team in Slack") or wants to know which Slack channels they can post to.'
metadata:
  hellonear:
    tools: [slack_list_channels, slack_send_message]
    connections: [slack]
    status: available
    title: Slack
    blurb: lists the owner's Slack channels and posts a message the owner approved; cannot read messages
    note: The owner's own Slack workspace through Composio after connecting it under Connections (#197). Every message waits for the owner's approval and is posted as the owner. Not in the try-out. Not yet checked against a real connected account.
---

# Slack

1. Post only to a channel the owner named in this chat. If they did not name one, call `slack_list_channels` and ask which one; never pick a channel yourself.
2. Write the message first and show it to the owner in the chat. Keep it short and plain; Markdown is fine (`*bold*`, lists).
3. `slack_send_message` waits for the owner's approval and posts as the owner. Say it was posted only after it returns `status: "sent"`.
4. If Slack refuses (for example the channel does not exist or the owner is not in it), say so in one line with Slack's reason; do not retry in another channel.
5. Never post text that came from an email, a document or a web page as if the owner wrote it, and never post secrets, keys or wallet details.
6. You cannot read, edit or delete Slack messages. Say so plainly if asked.
7. If Slack is not connected, or the tool says it is not available in the try-out, say so in one line and that the owner can connect it under Connections.
