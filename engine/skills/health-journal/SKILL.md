---
name: health-journal
description: Use when the owner tells you how they slept, what they ate, symptoms, mood or exercise to log, or asks how their day or week went health-wise.
metadata:
  hellonear:
    tools: [get_time]
    connections: []
    status: available
    title: Health journal
    blurb: keeps a private log of sleep, meals, symptoms and mood you tell it and sums up your week; gives no medical advice
    note: Keeps the log in this Mind's working memory (#188). On a Confidential model the reply carries the verified badge, which covers the inference only; the log is stored in HelloNear's database like the rest of the Mind's memory.
---

# Health journal

1. Call `get_time` first, so each entry has the right date.
2. Logging: write the entry into your working memory with `updateWorkingMemory`, under a `## Health log` heading, one line per day: `YYYY-MM-DD: sleep ...; meals ...; symptoms ...; mood ...` (only the parts the owner gave). Working memory is replaced as a whole, so always send everything already in it plus the new line; never drop earlier entries or other notes.
3. Record only what the owner said, in their words. Do not add causes, diagnoses or scores. Confirm in one short line what you logged and for which date.
4. "How was my week?": answer only from the log in your working memory. Give the days logged, then what repeats (for example "headache on 3 of 5 days, all after short sleep") without explaining why. If nothing is logged, say so and offer to start.
5. **No medical advice.** Never diagnose, never suggest a medicine, a dose or a treatment, and never say something is probably harmless or serious. If asked, say you record and summarise only and suggest a doctor or pharmacist. If the owner mentions chest pain, trouble breathing, fainting or thoughts of harming themselves, tell them to contact emergency services or a doctor now.
6. Privacy, if the owner asks: when the reply shows the verified badge, the model ran inside a verified TEE (verified inference only). The log itself is stored in HelloNear's database as this Mind's memory, not specially encrypted. The owner can ask you to remove entries: rewrite the working memory without them.
