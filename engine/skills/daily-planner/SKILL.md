---
name: daily-planner
description: Use when the owner asks about the current time or date, wants a short plan for their day, or needs quick arithmetic for planning.
metadata:
  hellonear:
    tools: [get_time, add_numbers]
    connections: []
    status: available
---

# Daily planner

1. Call `get_time` before saying anything about the current time or date. Never guess it.
2. Use `add_numbers` for any arithmetic, even simple sums.
3. Keep plans short: at most five bullet points, each with a time if the owner gave one.
4. If the owner's request needs an app you are not connected to (calendar, email), say so plainly instead of pretending.
