# Mind character prompts (v0.3, v0.4)

The prompts used to generate the v0.3 Mind images in pen.dev (Google generative AI, see `design/CLAUDE.md`). Reuse them in any image generator to keep new images on-model.

## Base prompt (all images)

```
3D render of an original designer vinyl figure character, matte soft-touch vinyl finish, a big oversized head shaped like a puffy cumulus cloud with soft rounded lumps all around its outline, attached to a small simple body with short stubby arms and short thick legs, the head about twice the size of the body, flat half-moon eyes: white eye shapes with a slanted heavy top lid and small black pupils glancing sideways, a deadpan unimpressed but cute look, a small rounded lime green beak in the center of the face, soft pink oval blush on both cheeks, one small lime green sprout with two leaves on top of the head, dark charcoal gray colored head and body, clean studio product photo, soft diffuse lighting, soft contact shadow, plain warm light gray background, centered full body, minimal, no text, no logo, no packaging, no base
```

## Append to the base prompt

| Image | Suffix | File |
|---|---|---|
| Base | `, standing still with arms down` | `design/generated-10.png` |
| General Assistant | `, wearing a bright lime green hoodie, raising one hand to wave hello` | `design/generated-12.png` |
| Payments Mind | `, wearing a mustard yellow quilted vest with a small brown leather pouch on a strap and a tiny lime green padlock pin, arms crossed confidently` | `design/generated-11.png` |
| Email Manager | `, wearing an orange mail carrier cap and an orange messenger bag full of white envelopes, holding up one envelope` | `design/generated-13.png` |
| 3/4 view | `, standing still with arms down, three-quarter view, body turned about 40 degrees to the right so the side and depth of the head are visible` | `design/generated.png` |

## Consistency tips

- Text-only prompts drift a little every time. Upload `design/generated-10.png` as a reference and write: *"Same character as the reference image. Keep the head shape, eyes, beak, blush, sprout, colors and proportions exactly the same. Only change: [outfit / pose / expression]."*
- One change per image.
- Keep the plain warm light gray background.

## For image-to-3D (Hunyuan) and rigging

- Pose: `arms slightly away from the body, A-pose`. Crossed or touching arms are hard to rig.
- Make front, side (`, side view, facing right`) and back (`, back view`) images with the same pose and upload them together with **Multiple Images**.

## Expressions (emotes)

Use the reference-image method and change only the expression, for example:

- `Only change the expression: happy, eyes closed in upward arcs, beak slightly open`
- `Only change the expression: surprised, eyes wide open, round pupils, beak open`
- `Only change the expression: sad, droopy lids, pupils looking down`

## v0.4 outfits (8 Nov): `characters/minds/`

Upload `design/generated-10.png` as the face reference for every image; for a hover pose also upload the finished rest pose, so the outfit stays the same. Files: `<template-id>.webp` (rest) and `<template-id>-hover.webp`.

Prefix for every v0.4 image:

```
Same character as the reference image: keep the big puffy charcoal cloud head, the flat half-moon eyes with heavy lids, the small rounded lime beak, the pink oval blush, the lime sprout on top, the short stubby arms with chubby three-finger hands, the short thick legs and the matte soft-touch vinyl finish exactly the same. 3D render of a designer vinyl figure, full body, centered, soft diffuse studio light from the upper left, soft contact shadow, transparent background, PNG. No text, no letters, no numbers, no logos, no currency symbols anywhere.
```

Add this to every rest pose (without it the generator may close or hide the eyes):

```
Face exactly like the reference: large white half-moon eyes with a heavy charcoal upper lid covering the top third, a small black pupil just under the lid glancing to the side, the lime beak closed with a thin split line, pink oval blush. Deadpan look, do not close or hide the eyes.
```

| Mind | Rest pose | Hover pose |
|---|---|---|
| General Assistant | a sharp tailored lime green blazer with rolled-up sleeves over a crisp white shirt, a tiny charcoal bow tie, a pencil tucked behind where an ear would be, round thin gold glasses resting low on the beak, a leather satchel strap across the chest, two pens and a highlighter in the breast pocket, holding a thick open planner full of colourful sticky tabs, the other hand giving a confident thumbs up, a few sticky notes stuck on the blazer; standing straight, proud, deadpan but confident | same outfit; jumping a little off the ground, the planner thrown open with sticky notes flying out, one hand pointing up like "got it!", eyes closed in happy upward arcs, beak open in a big cheerful smile |
| Payments Mind | a mustard yellow quilted puffer vest over a cream turtleneck, a small brown leather crossbody pouch overflowing with plain gold coins, a lime green padlock pin, a tiny green visor cap, a chunky gold chain bracelet, holding a fan of plain mint green paper notes (no prints, no numbers) and a small calculator, a few plain gold coins at the feet; arms crossed, standing firm, deadpan and in control | same outfit; tossing a shower of plain gold coins and plain mint green notes into the air, one foot lifted in a little victory dance, eyes closed in happy upward arcs, beak open in a big grin |
| Email Manager | an orange mail carrier uniform jacket with brass buttons and lime green piping, an orange postal cap with a small lime feather, a big orange messenger bag stuffed with white envelopes, envelopes tucked under the cap and in the pockets, a small paper airplane clipped to the strap, a lime green rubber stamp on the belt, holding up one sealed white envelope with a lime wax seal; standing tall, deadpan and focused | same outfit; juggling three white envelopes while a paper airplane flies past the head, one leg kicked up mid-step, eyes closed in happy upward arcs, beak open in a big laugh, a few letters fluttering around |
