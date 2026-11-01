---
name: Gapstronaut
description: A research desk at night. Every claim sits beside the viewer quote and the video behind it.
colors:
  night-ground: "#0A1220"
  night-surface: "#0E182B"
  night-surface-2: "#131F36"
  night-hover: "#1B2A47"
  night-line: "#1E2C4B"
  night-line-strong: "#26355A"
  night-fg: "#EEF2FA"
  night-fg-2: "#AAB6CD"
  night-fg-3: "#8190AB"
  night-focus: "#7FA2F5"
  paper: "#F5F7FA"
  paper-surface: "#FFFFFF"
  paper-surface-2: "#EEF2FA"
  paper-line: "#E3E8F0"
  paper-line-soft: "#EEF1F6"
  paper-line-strong: "#C5CEDD"
  paper-fg: "#0E1626"
  paper-fg-2: "#4A5670"
  paper-fg-3: "#5C6985"
  ink: "#0A1220"
  focus: "#2F5FD0"
  highlighter-amber: "#F6C453"
  highlighter-soft: "#FBE7A8"
  highlighter-night-soft: "#4A3A12"
  good-fg: "#1E6B4B"
  good-bg: "#E3F4EC"
  bad-fg: "#9A2F22"
  bad-bg: "#FBE9E6"
  warn-fg: "#8F4410"
  warn-bg: "#FCEBDD"
  info-fg: "#2850B0"
  info-bg: "#E6EEFC"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, Noto Sans Tamil Variable, Noto Sans Devanagari Variable, system-ui, sans-serif"
    fontSize: "clamp(2.875rem, 1.57rem + 5.35vw, 5.25rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.4rem + 1.9vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  figure:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  control: "10px"
  panel: "14px"
  mark: "4px"
  meter: "3px"
  pill: "999px"
spacing:
  touch-floor: "44px"
  field-height: "48px"
  console-button: "52px"
  control-x: "20px"
  panel-pad: "24px"
  page-max: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.paper-fg}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.bad-fg}"
    textColor: "{colors.paper-surface}"
    rounded: "{rounded.control}"
    height: "44px"
  field-input:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.paper-fg}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "48px"
  panel:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.panel}"
    padding: "24px"
  badge-good:
    backgroundColor: "{colors.good-bg}"
    textColor: "{colors.good-fg}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-fg}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  evidence-mark:
    backgroundColor: "{colors.highlighter-soft}"
    textColor: "{colors.paper-fg}"
    rounded: "{rounded.mark}"
    padding: "2px 6px"
---

## Palette (authoritative)

These two palettes override any colour named elsewhere in this file. Use nothing else, in either theme.
`server/test/unit.test.js` ("theme palettes") fails on any colour outside them.

**Light**
- Primary `#0F1E2E`: `000000 0C1C2C 233142 3A485B 516073 6A788C 8393A6 9EACC1 B9C9DD D5E5FA EAF1FF FFFFFF`
- Secondary `#2F5BEA`: `000000 001352 002583 0038B7 1F4FDF 436BFA 6B89FF 92A8FF B8C4FF DDE1FF EFEFFF FFFFFF`
- Tertiary `#F3DFAE`: `000000 251A00 3A300D 524720 6B5E36 86764D A08F64 BCAA7D D8C597 F5E1B0 FFEFCD FFFFFF`
- Neutral `#FBF8F3`: `000000 1C1C19 31302D 474744 5F5E5C 787774 92918D ADABA8 C8C6C3 E6E2DE F4F0EC FFFFFF`

**Dark**
- Primary `#E8E8E4`: `000000 1A1C1A 30312E 464744 5E5F5C 767774 90918E ABABA8 C6C7C4 E3E3E0 F1F1EE FFFFFF`
- Secondary `#F4F6FA`: `000000 1A1C1F 2D3134 45474A 5B5F62 75777B 8F9195 AAABAF C5C7CA E1E3E6 F0F1F5 FFFFFF`
- Tertiary `#9A978F`: `000000 1D1C16 32302A 484740 605E57 79776F 949089 AFABA3 CBC6BD E7E2D9 F5F0E7 FFFFFF`
- Neutral `#050505`: `000000 1C1B1B 313030 474646 5F5E5E 787776 929090 ADABAA CAC6C5 E6E2E1 F4F0EF FFFFFF`

Status has no red, green or orange: errors, warnings and success are told apart by icon, wording and tone.
The only exceptions are the official Google "G" (Google's branding rules), the logo video's artwork and the ground behind it, and third-party images such as YouTube thumbnails.

# Design System: Gapstronaut

## Overview

**Creative North Star: "The Research Desk at Night"**

A desk lamp over evidence. The page shows its working: every claim sits beside the viewer quote and the video behind it. The homepage lives on a night-navy ground; the logged-in app follows the OS between cool paper and the same night values. Panels are quiet, rows are separated by hairlines rather than boxed into card grids, and the only loud thing is the amber highlighter, which marks words a real viewer wrote.

Density is calm and legible: left-aligned type, one working evidence panel instead of a split hero, 44px touch targets everywhere. Motion is minimal and authored once.

**Key Characteristics:**
- Two grounds from one token set: paper (light) and night (dark), switchable per section.
- One signature: the amber highlighter, reserved for real viewer evidence.
- Semantic tokens only in new work (`bg`, `surface`, `fg-2`, `line`, `mark`).
- Flat panels with a 1px hairline and a barely-there shadow.
- Self-hosted variable type: Schibsted Grotesk, Geist Mono for figures.

## Colors

Cool blue-navy neutrals, one amber, muted status hues. Values are defined once as CSS custom properties in `src/index.css` with a light and a dark value each; the frontmatter lists both sets (paper-* and night-*).

### Primary
- **Ink** (#0A1220 in light, #EEF2FA in dark; token `--ink` / `--on-ink`): the primary button ground, usage-meter fill. Inverts with the theme, so the main action is always the highest-contrast object.

### Secondary
- **Highlighter Amber** (#F6C453, `--mark`): the single accent. Paints behind viewer-written text only. `--mark-bg` is the soft amber (#FBE7A8) on light; on dark it is amber mixed 88% into the surface, with ink text (`--on-mark`). `--mark-soft` (#FBE7A8 light, #4A3A12 dark) is also the text-selection ground.
- **Focus Blue** (#2F5FD0 light, #7FA2F5 dark; `--focus`): focus ring and caret only.

### Neutral
- **Ground** (`--bg`: #F5F7FA / #0A1220), **Surface** (`--surface`: #FFFFFF / #0E182B), **Surface 2 and Hover** (#EEF2FA / #131F36 and #1B2A47).
- **Hairlines**: `--line` (#E3E8F0 / #1E2C4B), `--line-soft` (#EEF1F6 / #18243F), `--line-strong` (#C5CEDD / #26355A) for inputs and secondary buttons.
- **Text**: `--fg` (#0E1626 / #EEF2FA), `--fg-2` (#4A5670 / #AAB6CD), `--fg-3` (#5C6985 / #8190AB).

### Status (each a bg/fg pair, both themes)
- **Good** green (#1E6B4B on #E3F4EC), **Bad** red (#9A2F22 on #FBE9E6), **Warn** burnt orange (#8F4410 on #FCEBDD, deliberately far from amber), **Info** blue (#2850B0 on #E6EEFC). Muted, never neon.

### Named Rules
**The Single Highlighter Rule.** Amber is used for exactly one meaning: a run of text a real viewer wrote. Never for buttons, badges, warnings, charts, or decoration. Warnings are burnt orange.

**The Two Grounds Rule.** Theme comes from the OS; `.theme-night` and `.theme-day` pin any section. Components use semantic tokens so they work on both with no per-theme code.

## Typography

**Display / UI Font:** Schibsted Grotesk Variable (fallbacks: Noto Sans Tamil, Noto Sans Devanagari, system-ui). Self-hosted via Fontsource.
**Figure Font:** Geist Mono Variable (fallback ui-monospace), for counts, dates, allowances.

**Character:** A confident editorial grotesk with a precise mono for the numbers; the Noto faces keep Tamil and Hindi quotes from falling to a mismatched system font.

### Hierarchy
- **Display** (600, clamp 2.875rem to 5.25rem, 1.03, -0.035em): homepage headline only.
- **Headline** (600, clamp 2rem to 3rem, 1.08, -0.03em): section headings.
- **Title** (600, 20px, tight tracking): dialog and panel titles.
- **Body** (400, 15px, relaxed leading): UI copy; secondary text in `fg-2`, hints in `fg-3` at 13px.
- **Label** (500, 13-14px): field labels, badges. Sentence case.
- **Figure** (Geist Mono, 12-13px, tabular numerals via `.nums`): usage counts, dates, stats.

### Named Rules
**The Tabular Figures Rule.** Any number shown in a column or meter uses `.nums` so values do not jitter.

## Layout

Single column content inside a 1200px maximum width, with 16px side padding on phones and 32-40px from the sm breakpoint. Rows with hairlines and panels rather than card grids. Every interactive control is at least 44px tall; inputs are 48px; the search-console button is 52px. The marketing top bar is wordmark, anchors (hidden below md), Log in, Sign up. The app header is 64px minimum with the primary nav, a mono allowance chip, and an avatar menu; below md it collapses to a menu. A skip link leads every page to `#main`.

## Elevation & Depth

Essentially flat. Depth is tonal (ground, then surface, then surface-2) plus 1px hairlines. Panels carry `0 1px 2px rgb(14 22 38 / 0.04)`. Only floating layers lift: the Menu (`0 12px 32px -12px rgb(14 22 38 / 0.35)`) and Dialog (`0 24px 60px -20px rgb(0 0 0 / 0.5)` over a `#0A1220` 60% backdrop).

### Named Rules
**The Flat Rest Rule.** Resting surfaces never gain a heavier shadow; only menus and dialogs float, and they use soft, blurred, negative-spread shadows.

## Shapes

Gentle, consistent corners: panels and alerts 14px, controls (buttons, inputs) 10px, menu items and small hit areas 8px, badges and menu triggers fully round, the highlighter 4px, meter track and fill 3px. Borders are 1px hairlines. No clipped or angled shapes.

## Components

### Buttons
- **Shape:** 10px radius, semibold, 15px text; md is min 44px high with 20px side padding, lg is 52px.
- **Primary:** ink ground, on-ink text; hover drops to 90% opacity.
- **Secondary:** surface ground, 1px strong line, hover to hover tone. **Ghost:** `fg-2` text, hover tint. **Danger:** bad-fg ground, surface text.
- **Loading:** spinner replaces the label without changing width. Disabled is 45% opacity. Renders as a router Link when given `href`.

### Fields
- Label above (14px medium), hint below (13px `fg-3`), error below in bad-fg with `role="alert"`. Input is 48px, 10px radius, surface ground, strong line border, hover border `fg-3`, bad-fg border when invalid, optional trailing action.

### Panel
- Surface ground, 1px line, 14px radius, soft panel shadow, padding by size.

### Badge
- Fully round pill, 13px medium (or mono 12px). Tones: neutral, good, bad, warn, info.

### Menu
- Trigger at least 44px square; popover 256px wide, 14px radius, 1px line, 6px inset, items 44px tall with 8px radius; danger items in bad-fg; fades in 200ms.

### Dialog
- Native dialog, up to 30rem wide, 14px radius, 24px padding, title 20px semibold, action row split by a hairline, 60% navy backdrop.

### Alert
- Tinted bg/fg pair by tone with a drawn icon (18px), optional title and action. No side stripe.

### UsageMeter
- Label left, mono "x of y unit" right, 6px track with 3px radius; ink fill, bad-fg when spent; width eases 200ms.

### EvidenceMark
- The amber highlighter around viewer text: 2px 6px padding, 4px radius, cloned box decoration across line breaks. With `sweep` it draws left to right once (700ms) when scrolled into view.

### Derived
- A small info glyph (lucide Info) at 60% opacity after any figure Gapstronaut calculated; tooltip and label read "Calculated by Gapstronaut from YouTube data. Not a YouTube metric."

### Logo and Shells
- Logo: mark plus "Gapstronaut" wordmark in semibold, tight tracking; light variant for night grounds. MarketingShell (top bar, optional pinned theme) and AppShell (surface header, bordered, 1200px content).

### Motion
- One authored moment: the evidence sweep. Elsewhere 150ms colour/opacity transitions and a 200ms fade-in (6px rise), easing `cubic-bezier(0.16, 1, 0.3, 1)`. Nothing moves inside app screens beyond state. Under `prefers-reduced-motion` all animation is off and the sweep shows its end state.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens (`bg-surface`, `text-fg-2`, `border-line`) so a section works in both grounds.
- **Do** put amber behind viewer-written text only, via EvidenceMark.
- **Do** place the Derived info glyph after every figure Gapstronaut calculated.
- **Do** keep controls at 44px minimum and use drawn icons from one library (lucide).
- **Do** separate content with hairline rows and flat panels.
- **Do** keep figures in Geist Mono with tabular numerals.

### Don't:
- **Don't** use gradients, glass or backdrop blur, or neon and thumbnail-yellow creator-tool styling.
- **Don't** add kickers or eyebrow labels above headings.
- **Don't** nest cards inside cards.
- **Don't** use hard offset shadows; soft ones only, and only on floating layers.
- **Don't** use emoji; use drawn icons.
- **Don't** mark callouts with a coloured left border; use a tinted Alert.
- **Don't** use amber for status, buttons or charts; warnings are burnt orange.
- **Don't** add new colours outside the semantic tokens.

## Homepage: Lunar Cream (2026-10-27, pending owner review)

The homepage pins `.theme-lunar` (see `src/index.css`): warm paper `#FBF8F3`, white surfaces, navy ink `#0F1E2E`, Ion Blue `#2F5BEA` for focus and accents, evidence highlight `#F3DFAE` behind ink text. The footer pins `.theme-night`. The signed-in app is unchanged for now.

- Layout: floating pill nav, rotating-word headline, an interactive Earth horizon (`ui/EarthBlaze.jsx`, WebGL, self-hosted NASA Blue Marble in `public/img/`), niche strip, soft text cards around a giant faint word, a statement, two split sections with an accent-bar list, four text-only lens cards, one example quote, a closing card. 3rem radius on big containers, 16–24px on cards, depth from large faint shadows.
- Rules: no photos in cards; no invented numbers, names, upvote counts or testimonials (every quote is labelled "Example comment"); highlight colour means viewer words only; motion is limited to the headline word, the niche strip and the Earth scene, all of which stop under `prefers-reduced-motion`; no third-party requests.

### Homepage dark mode: Saturn Dusk (follows the OS)

Page `#0C0818`, surface `#161029`, surface-2 `#1B1433`, text `#F2EEF8` (17:1), secondary `#B7ACCF` (9:1), hint `#9C90B8` (6:1), accent and focus lilac `#B79CFF` (8.7:1), input/outline border `#6B5C9A` (3.4:1). The primary button is a cream pill (`--ink #F2EEF8`, text `#0C0818`). The viewer-quote highlight is `#E9D2A0` with dark text (13:1). The footer's pinned night ground takes the same values. From Stitch's generated system we did not take the olive tertiary `#B9AF2D` (gold stays reserved for viewer words) nor Inter / JetBrains Mono (fonts stay self-hosted). `--accent` (blue `#2F5BEA` in light, lilac in dark) colours the rotating headline word.

## Whole app on Lunar Cream / Saturn Dusk (2026-10-28)

The tokens in `src/index.css` are now global: light is Lunar Cream, dark is Saturn Dusk, from the OS or the header switch (`<html data-mode>`, stored by `lib/colorMode.js`, shared with Profile → Appearance). `.theme-night` pins a dark ground (footer, sign-in brand panel, 404 panel): navy in light mode, lifted violet in dark. The old `.theme-lunar` class is gone.

Shapes: pill buttons and segmented controls, 14px fields (52px tall), 24px panels, 3rem for hero and brand panels. Every page uses the floating pill header (`MarketingShell`, `AppShell`) and the curved footer (`home/SiteFooter.jsx`; `newTab` in the signed-in app so policies never tear down a running analysis). Tabs, filter pills and usage meters use the accent (`--focus`); the quote highlight is still viewer words only.

## Report pages (niche and channel)

Redesigned from the Stitch screens "Niche Report (Lunar Cream Editorial)" and "Channel Report (Sample Channel)". One wide column (max 1120px) with a slim sticky section index on the left at `lg`, replacing the old 760px column and the four tabs.

- Order: header (mono eyebrow, display title, quiet text actions; channel runs add an initial disc and an "Open channel" link) → hairline stat strip → notices → hero (the biggest gap as a `GapCard`) → Content gaps as hairline rows that open to the full card → Complaints and Trending as tiles → Avoid as a quiet list → collapsed Evidence panel → footer.
- Channel reports reuse the same layout with their own section names (Overview, What your audience asks, Objections, Trending in your audience, Skip) and eyebrows.
- Only tokens are used, so Saturn Dusk and the night theme follow automatically. Highlighter stays for real viewer quotes only.
- Code: `components/explorer/ReportView.jsx`, `ReportSections.jsx`, `ReportIndex.jsx`, `ReportHeader.jsx`; `StatRow` in `components/Bits.jsx`.

## Graphite Mono (landing page, dark)

Chosen in Stitch ("Landing · Dark · Graphite Mono"). This is the dark theme of every page: the `prefers-color-scheme` block and `:root[data-mode="dark"]` in `src/index.css`, and the pinned `.theme-night` ground (footer, sign-in brand panel, thinking orb, 404 card). Light mode is Lunar Cream as before. Saturn Dusk (purple) is retired.

| Token | Value |
|---|---|
| `--bg` / `--surface` / `--surface-2` / `--hover` | `#050505` / `#0D0D0D` / `#131313` / `#1B1B1B` |
| `--line` / `--line-soft` / `--line-strong` | `#1F1F1F` / `#171717` / `#3A3A3A` |
| `--fg` / `--fg-2` / `--fg-3` | `#F4F6FA` / `#A9B0C0` / `#8C92A0` |
| `--ink` / `--on-ink` | `#F4F6FA` / `#050505` (white pill buttons) |
| `--accent` / `--focus` | `#E8E8E4` (no hue) |
| `--mark` (viewer-quote highlight) | `#C9C4B5` dusty stone, dark text `#14120E` |
| info | bg `#1B1B1B`, fg `#E8E8E4` |

The homepage planet band uses `#050505` / `#9A978F` in dark. Stitch's invented copy (upvote counts, "scanned N comments") is not part of the site.
