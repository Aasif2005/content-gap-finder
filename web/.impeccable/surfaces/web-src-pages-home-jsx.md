---
version: 1
slug: "web-src-pages-home-jsx"
primary_target: "web/src/pages/Home.jsx"
related_targets: []
---

# Surface brief: Gapstronaut website

Scope: homepage (Persuade), login/signup (Persuade-lite), dashboard, report pages and profile (Operate). One identity across the site.

Audience, job: solo YouTube creators deciding what to film next; they leave with one video and the comments that prove demand.
Proof: live sample report from /api/featured; real quotes linked to YouTube; "YouTube data as of". No testimonials or user counts.
Constraints: YouTube API policies (30-day data, derived figures marked, attribution, per-comment video links); free beta; Firebase auth.
Visual authority: approved canvas boards (https://claude.ai/artifact/R9iBr8deabHcUJL2NMXmQn) and their source files saved at the scratchpad canvas folder; user-pinned premium/elegant/trustworthy/not-AI, so the direction roll was skipped.

## Direction contract

THESIS: A research desk at night. The page shows its working: every claim sits beside the quote and the video behind it. It refuses the loud creator-tool look (thumbnail yellow, neon, gradients) and the generic SaaS split hero.

OWN-WORLD: Night navy ground #0A1220 with panels #131F36/#0E182B and hairlines #26355A on the homepage and dark theme; cool paper #F5F7FA with white #FFFFFF panels and #E3E8F0 hairlines in the light app. One signature: amber highlighter #F6C453 (soft #FBE7A8 behind ink text on light), used only to mark real viewer evidence. Buttons are ink #0A1220 on light, white on dark. Focus #2F5FD0 (#7FA2F5 on dark). Muted status greens and reds, never neon. Schibsted Grotesk for display/UI (display 600 weight, tracking -0.035em, max 84px), Geist Mono for counts and dates, Noto fallback for Tamil/Hindi. 14px panel radius, 10px controls, 1px soft shadow, drawn icons from one library, no emoji. Marks: info glyph on every Gapstronaut-calculated figure.

STORY: A creator learns in seconds that Gapstronaut turns what viewers wrote into one decision, believes it because the quote and its video are right there, and signs up free.

FIRST VIEWPORT: Left-aligned 84px headline "Film the video your audience is already asking for." over a one-line subhead; below it a wide search console with the niche field and a white "Find gaps" button; a quiet beta line. The real evidence panel (report excerpt with an amber-highlighted quote) rises beneath, cropped by the fold to invite scroll. Top bar: wordmark, three anchors, Log in, white Sign up pill.

FORM: Product-first page with a working evidence panel instead of a split hero; rows with hairlines instead of card grids; seed: none (user-pinned direction, roll skipped). Motion: one authored moment (the highlighter sweeps under a quote once on view), 150-200ms fades elsewhere, nothing moves inside app screens beyond state, prefers-reduced-motion honoured.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
