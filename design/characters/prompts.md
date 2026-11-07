# Mind character prompts (v0.3)

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
