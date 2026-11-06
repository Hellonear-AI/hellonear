# HelloNear logo

The Mind's cloud head with its lime sprout and flat-lidded eyes. Owner: Nabil.

| File | Use |
|---|---|
| `hellonear-logo-dark.svg` | Logo + "HelloNEAR" wordmark, for light backgrounds |
| `hellonear-logo-light.svg` | Logo + wordmark, for dark backgrounds |
| `hellonear-mark-dark.svg` | Mark only, for light backgrounds |
| `hellonear-mark-light.svg` | Mark only, for dark backgrounds |
| `hellonear-mark-mono.svg` | One colour (`currentColor`), eyes are see-through |
| `hellonear-icon-on-stone.svg` | App icon / avatar, stone tile |
| `hellonear-icon-on-dark.svg` | App icon / avatar, dark tile |

## Rules

- Contrast: a dark head has white eyes and dark pupils; a light head has dark eyes and light pupils.
- Colours: head `#161614` or `#FFFFFF`, sprout `#D8F04A` (`$accent`), tiles `#F3F2EE` and `#161614`.
- Wordmark: "HelloNEAR" in Geist Regular, converted to paths. Its cap height is about 72% of the cloud head's height, and the middle of the capitals lines up with the middle of the head (not of the whole mark, which includes the sprout).
- Do not redraw, stretch, recolour or add effects. Do not tilt the eyelids: the look is flat and unimpressed, not sad.
- Below 32 px the eyes get too small; use the favicon files below instead.

## Favicon and app icons (`favicon/`)

| File | What |
|---|---|
| `favicon.svg` | Main favicon, drawn on a 32 px grid with bigger eyes. Switches to a light head in dark mode (`prefers-color-scheme`) |
| `favicon-16.svg` | 16 px cut: simpler cloud, white eyes without pupils (pupils turn into grey blur at 16 px) |
| `favicon.ico` | Fallback for old browsers: 16 (the 16 px cut), 32 and 48 |
| `apple-touch-icon.png` | 180 px, stone square (iOS rounds the corners) |
| `icon-192.png`, `icon-512.png` | Web app manifest icons, mark inside the maskable safe zone |

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

In a Next.js App Router app, putting `favicon.ico`, `icon.svg` and `apple-icon.png` in `app/` adds these tags automatically.
