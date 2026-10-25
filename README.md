# Content Gap Finder

Enter a niche. Get three ranked lists for YouTube creators deciding what to film next:

- **Trending now** — the sub-topics working in that niche right now, and why
- **Content gaps** — what viewers keep asking for in comments that nobody has answered well
- **Avoid** — angles pulling views but no audience response, with the counter-evidence shown

Every claim is backed by visible evidence. Topics show their videos, gaps quote the actual
comments with like counts, and the avoid list separates "our stats confirm this" from
"the model thinks so" — so you can check the recommendation instead of trusting it.

---

## Quick start

```bash
cp .env.example .env     # then fill in YOUTUBE_API_KEY and DEEPSEEK_API_KEY
npm install
npm run dev              # API on :8787, UI on :5173
```

Open http://localhost:5173.

For a production-style run (API serves the built UI from one origin):

```bash
npm run build && npm start   # everything on :8787
```

Tests: `npm test --workspace server`

### Getting the keys

| Key | Where |
|---|---|
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — create an API key, then enable **YouTube Data API v3** for the project |
| `DEEPSEEK_API_KEY` | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |

---

## How it works

There are two ways in. **Niche mode** searches YouTube for a subject; **channel mode**
analyses one channel's own uploads and its own audience. These are two different
questions — "what's out there, and what's missing" vs. "what's working for *me*, and what
do *my* viewers want" — so in the UI they are two separate top-level pages (**Niche
Explorer** at `/`, **Channel Analyzer** at `/channel`, switched via the nav bar at the top),
not a toggle inside one shared form. Each page has its own search form (no unused
region/language/deep-scan fields to hide), its own run history, and its own saved watches —
scoped with `GET /api/runs?mode=niche|channel` and a client-side filter on watches' saved
query, so the two subjects never show up mixed together in one list.

```
niche + window + format                    channel URL / @handle / UC… id
   │                                          │
   ├─ 1. search.list      100 units × slices  ├─ 1. channels.list     1 unit  → resolve + uploads playlist
   │      (see lib/searchPlan.js)             └─ 1b. playlistItems    1 unit  → recent uploads, 50/page
   │                                          │
   ├─ 2. videos.list            1 unit    → stats + duration + audio language, batched 50/call
   ├─ 3. channels.list          1 unit    → subscriber counts, batched 50/call
   ├─ 4. commentThreads.list    1 unit ×N → top comments, one call per video
   │
   ├─ 5. score in code                    → heat, per video and per topic
   ├─ 6. DeepSeek pass A                  → cluster into topics + avoid list
   ├─ 7. DeepSeek pass B                  → unmet demand + complaints, from the same comments
   └─ 8. compare in code                  → which gaps are recurring, new, or closed
```

A full run takes **60-120 seconds** (measured 76s and 92s on a 50-video niche; DeepSeek
latency is the variable part), so `POST /api/analyze` returns a job id and the client polls
`GET /api/jobs/:id` for phase-by-phase progress rather than holding the request open.
Results are cached per query (3h default) and **persisted by run id indefinitely**, so a
report stays openable at `/r/<runId>` long after its cache entry expires. Cache hits and
stored reports both cost nothing.

### Channel mode: what *your* audience is asking for

Paste a channel instead of a niche and the pipeline reads that channel's recent uploads and
the comments on them. It is the cheaper and more accurate path, for two structural reasons:

- **Discovery is 1 unit per 50 videos, not 100.** `playlistItems.list` on the uploads
  playlist replaces `search.list`, which takes a run from ~127 units to **~29** — roughly
  310 analyses a day instead of 70.
- **There is no ambiguity about what the videos are about.** The entire relevance
  subsystem below — niche keyword matching, tag-hijack detection, the `⚠ check relevance`
  badges — exists to compensate for `search.list` pulling in adjacent content. In channel
  mode it is switched off, because applied here it would be actively wrong: a viewer asking
  *"how do you make the clone skits"* never mentions the channel's name, so keyword matching
  would flag nearly every genuine gap.

One prompt rule inverts, and it matters. In niche mode, a comment asking the channel to
cover something unrelated is audience fatigue and explicitly **not** a gap (see
[Off-niche demand](#off-niche-demand-and-fabricated-suggestions)). On a creator's *own*
channel that same comment is the most valuable thing in the dataset — it is their own
subscribers saying what to make next. Verified on a live `@mkbhd`/90d run: the top gaps were
*"make a longer video dedicated to the Beni robot"* and *"a video that is just the clone
skits, and how are those shots made"* — both of which the niche prompt would have discarded.

### Gaps are marked recurring, new, or closed

Every run used to be amnesiac. A comment cluster that surfaced once because of which 25
videos happened to get scraped looked exactly as solid as demand voiced every week for a
month — and those deserve opposite decisions. [`lib/recurrence.js`](server/src/lib/recurrence.js)
compares each run's gaps against every earlier run of the same subject:

- **recurring ×N** — asked for across N runs. Proven, durable demand.
- **new** — absent from earlier runs. Either emerging, or this run's sampling noise.
- **↑ rising / ↓ cooling** — demand score against last run's, so direction of travel is visible.
- **closed** — open last run, gone now. Usually someone finally made the video.

What counts as an earlier run was tightened after an audit of the saved reports. Three
*cast iron restoration* runs made within ten minutes had marked gaps "recurring ×3": the same
comments read three times, not demand voiced three times. Now:

- runs from the last `RECURRENCE_MIN_HOURS` (default 24) are not compared at all, and the
  report says how many were skipped;
- older runs are grouped into **occasions** at least that far apart, and *recurring ×N* counts
  occasions;
- history is only compared within the same filters (language, region, gap mode, window,
  format). A 24h run compared against 90d runs had "closed" 10 gaps that were simply outside
  its window. Rows recorded before the filters were stored still count as sightings, but are
  never used to call a gap closed;
- a run that mined no comments (an outage, comments switched off) leaves a marker row, is not
  an occasion, and closes nothing.

Matching has to be fuzzy: the model rewrites every gap from scratch each run, so the same
demand returns phrased differently ("why is my crumb gummy" / "how do I fix a dense, gummy
crumb"). It uses stemmed-token Jaccard overlap with a floor on shared tokens, because on
short questions a single coincidental word can clear a ratio threshold on its own. Exact
string matching would report everything as new forever — indistinguishable from the feature
being broken.

Recurrence needs a baseline, which means something has to re-run the analysis. That is what
**watches** are for: save a query, pick daily/weekly/fortnightly, and
[`services/scheduler.js`](server/src/services/scheduler.js) re-runs it. The scheduler never
starts a run it cannot afford (a deferred watch is better than burning quota someone was
saving), runs one at a time, and always forces a fresh run — serving a watch from cache
would append a duplicate of the previous run to the gap history and inflate every streak
with the same run counted twice.

### Complaints, not just gaps

A gap is a production decision ("film this"). A **complaint** is an execution note ("stop
doing this") — pacing, audio, sponsor length, a title the video doesn't deliver on, missing
timestamps. Both come out of the same comments and the same DeepSeek call, so the second
output costs almost nothing, and it gets the identical citation grounding: at least two
distinct real comments, or it is dropped. A creator changing how they edit because of a
complaint nobody actually made is a worse outcome than showing no complaints at all.

### Heat is computed in code, not by the LLM

LLMs are unreliable at arithmetic, so the model never scores anything. It clusters and
explains; `server/src/lib/heat.js` does the maths. Three signals, each log-compressed
(view counts are heavy-tailed — one 10M-view video would otherwise flatten everything
else to zero) and then min-max normalized **within the result set**:

| Signal | What it captures | Weight |
|---|---|---|
| View velocity (views/day) | trending *now*, not all-time | 0.45 |
| Views per subscriber | channel-size normalization | 0.35 |
| Engagement rate `(likes + 5×comments)/views` | audience intensity | 0.20 |

Weights live in `config.heat` and are meant to be tuned against your own niche.

Because scores are relative to the set, a 9K-sub channel's 50K-view breakout outranks a
9M-sub channel's 400K-view video — which is the ranking a creator actually needs.

### Where every video went

A report used to say "7 of 14 videos dropped by the format/view filters" and nothing more. Every
run now keeps a ledger ([`lib/exclusions.js`](server/src/lib/exclusions.js)) of each video the
pipeline set aside and the reason, shown above the tabs as a funnel — found → returned by YouTube
→ after format and view filters → scored → comments read → comments used — with each reason
expandable to the videos themselves (title, channel, views, and the specifics: "61s", "audio track
is `hi`", "channel country is US, wanted IN").

Two kinds of entry, kept apart because they are different facts. **Left out of scoring**: YouTube
did not return it (deleted/private), a Short with long-form selected (or the reverse), under the
minimum views, a different language, or a different country. For language the *signal* is
recorded — an audio-track mismatch, wording that reads as another language, or a "Hindi Dubbed"
title are different grounds, and which one it was tells you whether dropping the filter would
help. **Scored but not used for gaps**: outside the top videos whose comments are read, comments
disabled, or comments set aside because the niche appears only in the video's tags.

Where a reason comes from a filter you set, the panel offers a button to re-run without it. The
funnel carries its own check: everything found is either scored or has a reason, and if the
arithmetic ever fails the panel says so. The audit log lists every video with its reason.

### How much to trust each output

A single "under 12 videos is weak" rule was the same number whether the thing being computed was
a ranking, a gap list or a recurrence streak, and it flagged a channel's complete 7-video week as
weak evidence when 7 of 7 is the whole population, not a sample. Each output is now judged by what
it actually computes ([`lib/confidence.js`](server/src/lib/confidence.js)), as `solid`, `small`
(real but coarse: say so, don't alarm), `thin`, or `n/a`:

| Output | What it needs, and why |
|---|---|
| Heat ranking | Heat is a rank within the set, so one video moves a score by 100/(n-1) points: 14 at 8 videos, 25 at 5, 50 at 3. **Solid at ≥8 videos from ≥4 channels** (`EVIDENCE_HEAT_MIN_VIDEOS`), thin under 5. A channel's own uploads are the whole population: *complete but small* is `small`, not thin, unless the walk was cut short or there are under 3. |
| Content gaps | Driven by **comments**, not video count: ≥5 videos with comments read and ≥100 comments used for solid; under 3 videos or 40 comments is thin. |
| Topics | Per card: one video is a single-video topic, one channel is a one-channel topic. |
| Outliers | ≥5 channels with enough history for a median. `n/a` in channel mode. |
| Recurrence | ≥2 earlier runs; the first run is `n/a`, not a weakness. |

These are judgement defaults with a stated reason, not statistical laws, and they are tunable
(`EVIDENCE_*`). **They are deliberately not relaxed for short windows**: a 7-video ranking is
coarse however good the excuse, and lowering the bar would hide that. What a short window changes
is the explanation. Only a *thin* ranking earns the orange banner, and the funnel's own
arithmetic says why: if your filters removed a third or more of what was found, they are blamed
and dropping them is offered first; otherwise it is the niche and window ("only 3 videos matched
this niche in 24h": widen it) or the channel's cadence (dropping filters would do nothing).

### Outliers: a video against its own channel's median

Views per subscriber is a proxy. A cleaner version of the same question is *how far did this
video beat what its own channel normally gets?* — a 400K video on a channel whose median is
30K is worth studying, the same video on a 2M-sub channel is a normal Tuesday. This is the
`yt-viral` idea from [youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill)
(MIT; see [`server/src/data/NOTICE`](server/src/data/NOTICE)), ported to JS in
[`lib/outlier.js`](server/src/lib/outlier.js).

A niche search returns one or two videos per channel, which can't give a median, so the top
`OUTLIER_CHANNELS` (default 20) channels' latest 50 uploads are read as a baseline — about
40 extra units a run. Rules, all deterministic:

- A median needs **≥4 same-format uploads**; below that the video is left unmeasured rather
  than ranked on noise (those channels are listed in the audit log).
- Shorts and long-form are never mixed into one median.
- Uploads under 3 days old are excluded from the baseline — they haven't finished
  accumulating views and would inflate every multiple.
- It ships as a **separate signal** (badge, banner, audit-log section), not blended into
  heat: the weights stay as documented above until the two have been compared on real niches.

Each title is also tagged with the closest of 21 hook formulas (`lib/hookFormulas.js`), and
the formulas shared by the outliers are summarised. That tag judges the *wording of the
title*; it is not a claim about why the video worked.

### Gaps are grounded, not generated

The failure mode that matters here is a plausible-sounding gap nobody actually asked for.
Three things guard against it:

1. Comments are indexed (`[c0]`, `[c1]`, …) and the model must cite index numbers.
2. The server resolves those citations back to real comments. **Anything that doesn't
   resolve is dropped**, so a fabricated quote cannot reach the UI.
3. A gap needs at least two resolvable comments to survive.

Demand score is then computed from the resolved comments — how many people asked, across
how many different videos, and how many likes those comments drew.

**Uploader comments are excluded.** A creator replying "recipe's in the description!" in
their own thread matches every demand pattern we look for but is not audience demand.

### A gap is a video to film, not a question to answer

Two things can both look like "repeated demand in the comments," and only one of them
belongs on this tab. **Repeated content requests** ("make a UK/Europe geopolitics video",
"reupload the lift comedy scene") are gaps — a creator can film them. **Genuine curiosity
about a real-world event nobody has explained** ("why did he cry at that event", "why was
he hospitalized") is *also* a gap — that's a filmable explainer, not just a question.

What is deliberately excluded: a question that's only about a specific *existing* video's
own footage or dialogue ("which movie did he mean in that speech", "who was that line
directed at") — answering it means re-explaining a video that already exists, not filming
something new — and rhetorical debate between commenters with no informational question at
all ("what has this politician actually done"). A live run against a real, noisy
political-figure niche caught both of these leaking through as "gaps" before this rule
existed; the prompt now tells the two apart explicitly, verified live against a rerun of the
same niche after the fix.

### Titles are linted in code, and may not invent numbers

Each gap comes back with three candidate titles and a ≤3-word thumbnail text. The model
does not pick or score them: [`lib/titleLint.js`](server/src/lib/titleLint.js) (a port of
`title.py` from youtube-agent-skill — checks the 60-character desktop and 40-character
mobile cuts, all-caps shouting, vague words, a missing figure, subject up front, and the
thumbnail repeating the title) scores every candidate and the best one becomes "Film this".
The lint is a checklist, not a click prediction, and the UI says so.

The lint *rewards* numbers, so a model chasing it would invent them. One check was added on
top of the port: a number counts as grounded only if it appears in the cited comments, the
question, or the niche. Existing video titles are deliberately not part of that corpus — across
100 titles almost every small number appears somewhere, which let an invented "3 fixes" pass
as evidence on the first live run. A candidate with an ungrounded number can only win if every
candidate has one.

### "Make it": from a gap to something you can film

Each gap has a **Make it** button. It spends nothing until pressed, then makes one DeepSeek
call (about 6-22k tokens, 30-90s) using the prompts of `yt-script` and `yt-seo` from
youtube-agent-skill, and returns a brief in three sections:

1. **Content opportunity: why make it.** Built from the gap in code, not by the model: how
   many comments, videos and likes are behind the request, how well it is covered, and the
   model's `angle` (labelled as inferred from the covering videos' *titles*, since that is all it
   saw). A gap with at most `BRIEF_THIN_COMMENTS` comments and `BRIEF_THIN_LIKES` likes is
   marked an **early signal**.
2. **Creator research: before you film.** What to **verify** (facts the draft relies on that the
   evidence lacks) and what to **prepare** (recordings, screens, examples), the covering videos
   to watch first, the sensitive-case notice, and a one-line roll-up of what the checks found.
3. **Ready-to-film script.** The length verdict, the essentials, five hooks, the beats, and the
   title, description and tags.

A language picker sits beside it ("the audience's language" by default, or any of a dozen);
each language is its own saved brief. Long-form is written as a **full script** by default, so
its runtime is measured from its words; **Switch to talking points** redrafts the body as notes
(budgeted, not measured). The default changed after a live test: the model's own time estimates
for the footprint brief summed to 4:59, and the full script it then wrote was 2:40 of speech. A
measured script is therefore never called "rushed" against the model's estimate, and the banner
notes that demonstrations add screen time beyond the spoken words. Optional essentials (one
low-liked comment, not the request itself) give a **core cut** with its own redraft button.

The model's only inputs are a handful of viewer comments and some video titles, so it cannot
know the facts a payoff needs. The brief is built around that, and everything decidable in code
is decided in code — the model never grades its own writing:

- **It says what it is assuming.** The draft lists `needs` (facts the script relies on that the
  evidence lacks) and writes `[NEEDS SOURCE: ...]` into the script instead of asserting them.
  The UI lists them under Creator research, split into verify and prepare. Evidence is labelled by source
  (`[comment]`, `[video title]`, `[channel's own title]`) and a phrase quoted in a video title is
  never treated as an official statement. The first version of this called a title quote "the one
  family statement we have on record".
- **As long as the topic needs, not as long as the model wants.** Told "about 8 minutes", the
  model filled 8 minutes: a real footprint-chart brief ran 7:24 with a troubleshooting beat from
  one comment and a practice-routine beat from none. Now it lists the **essentials** first (the
  fewest things a viewer must leave with, each citing the comments it answers, with a teaching
  time) and every body beat names the essential it teaches. `assessLength` then checks the
  structure in code: a beat that teaches no essential is *not asked for*, a beat over 1.5x its
  essential's time is *stretched*, an essential no comment is behind is *nobody asked*, and the
  draft is judged against what the essentials need (+/-25% and a minute of slack): **fits**,
  **padded** (with a *Redraft at ~5:00* button), **rushed**, or **wrong format** (long-form whose
  essentials fit in a minute could be a Short; a Short that needs more says which essentials it
  can hold). A 7:24 draft is kept when every section is earned. The per-essential times are the
  model's estimate and the UI says so; what code catches is padding by structure.
  `BRIEF_MAX_MINUTES` (default 15) is only a ceiling: past it the request is too broad for one
  video. The runtime says "budgeted" when it is an outline, and times prose by its words in
  any script.
- **Invented figures and names are flagged** in hooks, beats, the description and tags: digits
  *and spelled-out numbers* ("Nine days" once slipped past a digits-only check), and capitalised
  names the evidence, the covering videos and the channel's own titles never contained. A hook
  with either can only be a "best hook" if every hook has one. These checks cover Latin text; for
  other scripts the UI says so (digits are still checked).
- **Five hooks**, scored by [`lib/hookScore.js`](server/src/lib/hookScore.js) (a port of
  `hookscore.py`: specificity, address, stakes, curiosity, brevity; verdict = 60% mean + 40%
  weakest) and labelled with the closest of the 21 formulas by wording (or, when the English
  wording match finds nothing, the formula the model says it used, validated against the list and
  marked as the model's label). The scorer is written for English, so hooks in another script get
  a language-neutral *partial check* instead (one breath, a question left open, the viewer
  addressed early, no announcement opener) rather than being called weak. A hook that opens by
  announcing the video ("In this video...", "இந்த வீடியோவில்...", "इस वीडियो में...") is demoted in
  any language: in the footprint brief it had been ranked best because nothing could score Tamil. The
  original author measured that it separates deliberately bad hooks from real ones but barely
  separates a creator's own hits from misses, so the UI calls it a checklist, not a prediction.
- **Each beat serves the request**, and an `angle` says what this video adds that the covering
  videos don't. In channel mode the channel's recent titles are passed as a style and vocabulary
  reference (titles only; it never claims to be the creator's voice).
- **The query test** reports, for each of the three searches a person would type, whether the
  title has its words, how much of it the title plus description opening cover, and which words
  are missing. The description opening is asked to contain the words of at least two queries.
  A "query" that reads like a request to a creator ("orderflow parthi video", "please make a
  video") was copied from a comment, not imagined as a search, and is marked as such. When the
  searches' words are mostly missing from the title, the brief may suggest a `title_fix`; it is
  shown only if it carries more of those words than the current title and passes the same
  invented-number and accusation checks. The gap's title is never replaced silently.
- **A redraft keeps its plan.** Every redraft (restyle, retarget, core cut, *Redraft*) sends
  the saved brief's essentials back as a fixed plan, read from disk, never from the request, so
  it changes the wording, not the scope. The core cut is that plan minus the optional essentials,
  decided in code. **New plan** is the only way to re-plan. Measured on the footprint gap: three
  plan-kept drafts kept the same 3 essentials and ran 3:00-3:51 of speech; re-planning each time
  had produced 3 or 4 essentials and, as outlines, 7:56 and 10:02.
- **Why not just lower the temperature?** DeepSeek models think by default, and in thinking
  mode `temperature` is accepted but ignored (api-docs.deepseek.com, "Thinking mode"), so the
  0.3 we sent never did anything. Four drafts with thinking disabled at 0.2 against four
  default ones, same prompt: the spread was no smaller (84-126s vs 137-176s of speech), 2 of 4
  invented figures ("50, 150, 100") and none wrote a `[NEEDS SOURCE]` marker. So briefs keep
  the model default; `BRIEF_THINKING=disabled` (with `BRIEF_TEMPERATURE`) exists to rerun that
  comparison, and `chatJSON` now sends `thinking` explicitly when a caller sets it.
- **The chosen language holds field by field.** The language rule now opens and closes the
  prompt and each JSON field says "(in Tamil)"; before, essentials and research notes came back
  in English in about half the drafts. `languageMismatch` (lib/language.js) then checks each
  field: under 10% of its *words* in the language's script means it drifted (by letters, normal
  code-mixed Tamil like "ஒரு live footprint bar-ஐ zoom செய்து" failed). Drifted fields get one
  small translation call (fast model, thinking off, temperature 0), kept only if the result
  passes the same check; anything left is shown as "N fields still not in Tamil". Latin-script
  languages are not checked, since their script cannot tell them apart.
- **Number words are figures only when they count.** "Nine days" and "three ways" are flagged;
  "the two sides", "two-sided", "which of the two" and "one or two" are references, not figures,
  and are not. Digits are always checked.
- `[NEEDS SOURCE]` markers are counted with or without a colon (the model writes a bare one
  about half the time, and a colon-only pattern counted those as zero).
- Saved by (report, gap, language) so re-opening costs nothing, and limited separately from
  analyses (`BRIEF_RATE_LIMIT_PER_HOUR`, default 30) since it costs no YouTube quota.

#### Real, ongoing cases involving named people

A gap built on the audience's suspicion of identifiable people in a real case (a missing child,
an arrest, a death) is flagged by [`lib/sensitive.js`](server/src/lib/sensitive.js) — deterministic
terms in English, Tamil and Hindi plus the model's own flag — and the flag is *warn and reframe*,
not a block. The gap card and brief show a banner; the brief is written as **confirmed versus not
confirmed**, attributes everything to official sources, and never states suspicion as a finding;
and a title or thumbnail text that implies guilt ("why the family is suspected") gets an
`accusation` chip and a lower score, so a non-accusing title wins the ranking. The detector errs
towards flagging (a "murder mystery" party game can trip it): a false positive costs a banner, a
miss costs a confident title accusing a missing child's parents.

---

## Open design decisions, and how they were settled

The spec left four open. Current answers, all reversible:

**Heat formula** — the three-signal blend above. Tune `config.heat` weights.

**Channel-size normalization** — views-per-subscriber, at 0.35 weight, with a floor of 500
subs so tiny channels don't divide-by-zero into absurd scores. Channels that hide their
subscriber count fall back to the floor rather than getting a free boost.

**Definition of "unanswered"** — both readings are implemented, switchable per request:
- `inclusive` (default) — no video covers it, *or* only mid/low-heat videos do
- `strict` — only report topics nothing in the set covers at all

Inclusive is the default because "covered, but badly" is usually the more actionable gap
for a creator: demand is proven and the bar is low.

**Rate limiting** — 10 analyses per IP per hour, plus a hard daily YouTube unit budget
(9,000 of the 10,000 default quota) tracked in `server/.state/quota.json`. The ledger
resets on YouTube's own midnight-Pacific boundary, not UTC. Cache hits bypass both, and so
does an identical request while one is running: it joins that job instead of paying for a
second run (a double-click used to spend the quota twice and write the gap history twice).

**Behind a proxy, and from other sites.** `X-Forwarded-For` is only trusted when
`TRUST_PROXY` says how many proxies sit in front (it used to be trusted always, so a forged
header gave every request a new IP and walked past the limiter). The API sends no CORS
headers unless `CORS_ORIGINS` lists an origin: the built app and the Vite dev proxy are
same-origin, and an open `cors()` let any website make a visitor's browser start analyses or
delete watches. `x-powered-by` is off, with `nosniff`, `X-Frame-Options: DENY` and a
same-origin referrer policy.

**Avoid entries are checked against our own numbers.** Each entry is *confirmed* (at least
half its videos have high views and bottom-tier engagement), *partly* (some do), *model signal
only* (none do), or **our numbers disagree**: its median engagement is above the run's median
on at least 500 views (in the saved reports, "Daily Nifty crash predictions" had 54% against
3.65%). An entry resting on one video our numbers do not flag is dropped. Hidden like counts
are not low engagement, and the model is told when likes are hidden.

**Gap relevance looks at where the comment was written.** Viewers under a cast-iron video
ask "how often do I re-season my pan?" without typing "cast iron", so a check on the words
alone flagged 34 saved gaps, most of them core questions. A gap whose comments all sit under
videos about the niche now reads *asked under niche videos* instead of `⚠ check relevance`.

---

## Quota, in practice

`search.list` costs 100 units against a default 10,000/day quota — everything else costs 1.
A run's cost therefore depends on how many search slices it needs
([`lib/searchPlan.js`](server/src/lib/searchPlan.js)), which is why `unitsPerAnalysis()`
takes the run shape instead of returning a constant:

| Run shape | Units | Analyses/day on a 9,000 budget |
|---|---|---|
| Channel mode | **29** | ~310 |
| Niche, both/shorts | 167 | 53 |
| Niche, long-form | 267 | 33 |
| Niche + deep scan | 267 | 33 |
| Niche, long-form + deep scan | 467 | 19 |

(Niche runs include ~40 units for the outlier baselines; `OUTLIER_CHANNELS=0` removes them
and gives back the old 127/227/427.)

`GET /api/quota` returns that whole table, so the UI can price a toggle *before* someone
flips it rather than halving their day's budget by surprise.

This is why a run spends as few search calls as the request allows, why `videos.list` and
`channels.list` are batched 50 ids at a time, and why results are both cached and persisted.
`commentThreads.list` is the one call that can't be batched — it takes a single `videoId` —
so it runs per-video against the top `MAX_COMMENT_VIDEOS` (default 25) and is capped for
latency as much as for quota.

The daily ledger (`server/.state/quota.json`) is written under a cross-process lock
([`lib/fileLock.js`](server/src/lib/fileLock.js)) with a tmp+rename swap. Within one process
the read-check-write was always atomic — there is no `await` between the read and the write,
and Node doesn't interleave JS across synchronous statements — so the real exposure was two
server processes losing each other's increments. The more dangerous half was the write
itself: a torn ledger parsed as `used: 0`, which would have the app believe it had a full
budget and keep hammering YouTube until YouTube started returning `quotaExceeded`. That path
now logs loudly instead of failing silently.

---

## Model choice

Defaults to **`deepseek-flash`**. Benchmarked against `deepseek-v4-pro` on real payloads:

| | clustering (50 videos) | gap mining (500 comments) |
|---|---|---|
| `deepseek-flash` | 10.6s | 18.2s |
| `deepseek-v4-pro` | 40.4s | 65.2s |

Output quality was comparable on both passes, and `deepseek-v4-pro` exceeded a 180s timeout
on messy real-world clustering payloads. Set `DEEPSEEK_MODEL_ANALYSIS=deepseek-v4-pro` if
you want the reasoning model and can tolerate the latency — if it times out, the client
automatically falls back to the fast model rather than burning another full timeout.

Two wrinkles worth knowing:

- The models cite comments differently (`3` vs `"c3"`). Both forms are parsed, because a
  model swap silently emptying every gap's evidence is exactly the kind of bug that looks
  like "the niche has no gaps".
- Reasoning tokens share the output budget, so a payload that fits one day can overflow the
  next — a real clustering run needed 10k completion tokens. `max_tokens` starts at 16k and
  **doubles on each truncated retry** rather than repeating the same failure.

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/analyze` | Start a run. Returns a cached result (`200`) or a job id (`202`). |
| `GET /api/jobs/:id` | Poll phase, detail, progress, and the final result. |
| `GET /api/runs` | Report history, newest first. Free. `?niche=` narrows to one subject. |
| `GET /api/runs/:runId` | A persisted report. What makes `/r/<runId>` shareable. Free. |
| `POST /api/runs/:runId/gaps/:i/brief` | "Make it": hooks, script beats and search text for one gap. One DeepSeek call, polled as a job; a saved brief is returned free, and a second click joins the running job. `{"force":true}` redrafts. |
| `GET /api/runs/:runId/gaps/:i/brief` | A saved brief, or `brief: null`. Free. |
| `GET /api/watches` | Saved watches, plus the interval floor and limit. |
| `POST /api/watches` | Save a query to re-run on a schedule (`intervalHours`). |
| `PATCH /api/watches/:id` | Pause, resume, relabel, or re-interval a watch. |
| `DELETE /api/watches/:id` | Remove a watch. |
| `GET /api/watches/:id/digest` | What the newest run found that the previous one didn't. Free. |
| `GET /api/quota` | Units used/remaining today plus the per-shape cost table. |
| `GET /api/health` | Liveness, quota, cache and store sizes, phase list. |
| `GET /api/logs` | Recent runs with their niche-relevance summary. |
| `GET /api/logs/:runId` | The full audit log for one run, as plain text. |

```bash
curl -X POST localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{
  "niche": "cast iron restoration",
  "window": "7d",           # 24h | 7d | 30d | 90d | custom
  "customAfter": null,      # required when window is "custom": ISO 8601, max 365d back
  "contentType": "both",    # shorts | long | both
  "gapMode": "inclusive",   # inclusive | strict
  "minViews": 0,
  "regionCode": "US",       # optional, ISO 3166-1 alpha-2 -- hard filter on channel country
  "relevanceLanguage": "en",# optional, ISO 639-1 -- hard filter, primarily by each video's own
                            #   declared/detected audio language, corroborated by script/common-word
                            #   text matching for a modeled subset of languages (see below)
  "deepScan": false         # optional -- doubles the search slices to widen the candidate pool
}'
```

Channel mode takes a channel reference in place of a niche — a URL, an `@handle`, or a
`UC…` id:

```bash
curl -X POST localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{
  "channelId": "https://www.youtube.com/@mkbhd",
  "window": "90d"
}'
```

`"force": true` bypasses the cache and spends fresh quota.

---

## Audit log — verifying the model stayed on the niche

Every run writes a human-readable log to `server/logs/runs/<runId>.log`. Open it directly,
`tail -f` it, or fetch it from the app itself — every report's footer has a **"view full
audit log"** link, and `GET /api/logs` lists recent runs.

The log has four sections, in the order the pipeline actually produced them:

1. **Every candidate video** `search.list` returned, before any filtering — so you can see
   whether the *search itself* stayed on-topic before the LLM ever touches it.
2. **Every topic the model extracted**, with its evidence videos.
3. **Every gap mined from comments**, with the resolved evidence quotes.
4. **The avoid list**, with the same evidence.

Each topic, gap and avoid entry is run through a keyword-overlap check against the niche
(`server/src/lib/relevance.js`) and marked `⚠ NOT NICHE-RELEVANT` when no niche keyword
appears anywhere in it — including in its evidence videos, since a topic labelled generically
("Electrolysis tank demos") can still be genuinely on-niche through what it's evidenced by.
The log's header prints a relevance summary (`topics: 8/8`, `gaps: 8/8`, `avoid: 2/4`) so you
don't have to read the whole file to know something's worth checking.

This is a cheap heuristic, not a semantic judge, and it does not replace reading the flagged
entries — see it flag correctly in practice:

```
1. "Regional roastery top-10 rankings"  ⚠ NOT NICHE-RELEVANT — stats confirm: true
   reason: TV-style ranking content pulls a big regional audience...
```

That was a real run: the avoid entry's evidence videos were non-English titles (Japanese
local-shop content) that never used the English words "home", "coffee" or "roasting" — a
correct flag surfacing content a human should glance at, not a false alarm to ignore. The
header says as much: *"A low rate does not always mean the model hallucinated — search.list
itself can pull in adjacent content."*

### Tag hijacking

The failure this was built to catch: a "thalapathy vijay" run returned a Mamitha Baiju
dance edit as its **#1 trending topic**, at 12.4M views. The video was titled
`Female Version Leaked😈 #mamithabaiju #vijay #shorts #viral` and stuffed `thalapathy`,
`vijay metro scene` and `vijay songs` into its tags — deliberate keyword stuffing to farm
two audiences at once.

Nothing was hallucinated. `search.list` legitimately matched it, and the keyword relevance
check passed it, because the word "vijay" genuinely *is* there — a spammer puts it there on
purpose, so no pure keyword test can catch this.

Two defences, neither of which drops a video on keyword evidence alone:

- **`checkTagHijack()`** ([relevance.js](server/src/lib/relevance.js)) strips hashtags from
  the title and asks whether the niche survives in the prose. If it only appears in
  tags/hashtags, the video is marked `TAG-ONLY` in the audit log and in the digest sent to
  the model, and a topic whose every video is tag-only is marked `TAG-SUSPECT`.
- **The clustering prompt** instructs the model to judge what a video is *about* rather than
  what words its metadata contains, and to exclude hijacked videos even when their view
  count leads the set.

The heuristic alone is deliberately not trusted, because it produces false positives:
`TN CM #vijaythalapathy Son #jasonsanjay Entry at Sigma` is genuinely about Vijay and its
prose also omits the name. So the flag informs the model and the reader; the model makes the
semantic call. After the fix the same niche returned 8 topics, all genuinely about Vijay,
with the 12.4M-view video correctly excluded.

**The same hole existed one step later, in gap mining.** Comment-fetching runs by heat
score alone, upstream of any relevance check — so a `SOORI AS HERO #thalapathyvijay` Short
(a *different* Tamil actor, tag-stuffed to farm the same audience) was correctly kept out of
every topic, but its comments still reached gap mining and surfaced as a "content gap" about
an unrelated film rivalry that has nothing to do with the niche.

The fix reuses clustering's own verdict rather than re-deciding relevance a second time:
`untrustedVideoIds()` drops comments from any `TAG-ONLY` video that clustering never used as
evidence for a topic or an avoid entry, before gap mining ever sees them. Every returned gap
also carries a `nicheRelevant` flag (the app shows a `⚠ check relevance` badge if anything
still slips through) — this used to only be visible in the audit log, which is what let the
Soori gap reach the UI unnoticed in the first place.

**The same flag existed for gaps only, not topics or avoid entries, until a later bug pass
caught the inconsistency.** `checkTopicRelevance()` runs against every topic and avoid entry
too and was already writing `⚠ NOT NICHE-RELEVANT` / `⚠ TAG-SUSPECT` into the audit log for
them — but the verdict was never attached to the topic/avoid objects the API actually returns,
so the UI had nothing to render. A tag-hijacked topic or an off-niche avoid entry looked just
as trustworthy on screen as a clean one; only opening the audit log would have caught it. Same
root cause one layer up from the `gap.explanation` bug above: a check computed server-side but
never wired to what the reader actually sees. Fixed by attaching `nicheRelevant`/`tagSuspect`
to topics and `nicheRelevant` to avoid entries in `pipeline.js`, and rendering the same
`⚠ check relevance` / `⚠ tag-suspect` badges on `TopicCard`/`AvoidCard` that gaps already had.
`VideoStrip` (the video list under every topic, avoid entry, and gap) now also shows a
`⚠ tag-only` badge per video from the `tagOnlyMatch` flag that was already being sent to the
client and simply never rendered.

Logs aren't committed (`server/logs/` is gitignored) since they contain full comment text.

### Off-niche demand and fabricated suggestions

A third-order version of the same problem: three comments on a legitimately on-niche
"thalapathy vijay" video (a Bigg Boss/VJS controversy clip) asked the channel to **stop**
covering Vijay and cover unrelated geopolitics instead — "Anna Geopolitics cheyyandi, e
bigboss gurinchi vadhuu time waste", "UK and Europe video cheyandi". None of the three
comments, or the gap's own `question`, mentioned Vijay at all. The relevance check still
passed it, because `gap.explanation` — the model's own framing prose ("the Vijay-VJS
controversy video") — happened to name the niche while describing which video the comments
sat under. With no relevance guardrail catching it, the model then had to invent a
`suggested_title` to bridge two unrelated requests, producing a premise no comment
states: *"CM Vijay's UK trip vs the Europe-Russia War"*.

Two fixes:

- **`checkGapRelevance()` no longer reads `gap.explanation`.** Only `question` and the
  actual evidence comments count — what real viewers said, not the model's summary of them.
- **The gap-mining prompt** now explicitly rejects "stop covering the niche, cover something
  unrelated instead" comments as audience fatigue rather than a content gap, and requires
  `explanation`/`suggested_title` to follow only from what the cited comments say — never a
  connection between two separate comments that neither one makes.

Verified on the same run: the geopolitics gap no longer appears at all (the model now
declines to generate it, rather than the relevance check catching it after the fact).

### Region and language filters

A "gym fitness" run with `regionCode=IN` and `relevanceLanguage=ta` (Tamil) still returned
videos from other countries and in other languages. Root cause: both params are documented
by YouTube as ranking *hints* to `search.list`, not filters — "results in other languages
will still be returned if they are highly relevant to the query term." Verified empirically:
`relevanceLanguage=ta` against "gym fitness" returned nearly the same channel set as no
language param at all, and none of them were actually in Tamil.

Two different fixes, because the two params have different amounts of real signal behind them:

- **Region now hard-filters for real**, on `channels.list`'s self-reported `country` field
  (free — `part=snippet` was already being fetched). A video is kept only if its channel's
  country is unset (unknown, not excluded) or matches. On the reported run this correctly
  cut 50 videos to 25.
- **Language hard-filters using Unicode script detection**
  ([`lib/language.js`](server/src/lib/language.js)), not YouTube's hint: for a language
  with its own script (Tamil, Hindi, Arabic, Korean, Japanese, Russian, ...), a video is
  kept only if its title/description actually contain that script. This can't distinguish
  languages that share a script (Urdu/Persian both use Arabic script; Ukrainian/Bulgarian
  both use Cyrillic).
- **Latin-script languages get a coarser second fallback**: script detection can't tell
  English from Spanish from French — they share an alphabet — so for a modeled subset
  (`en`, `es`, `fr`, `de`, `pt`, `it`, `nl`) the filter instead compares a video's own words
  against a short, hand-picked list of common function words per language (articles,
  pronouns, conjunctions — the words that show up in nearly every sentence but rarely by
  accident) and keeps whichever language scores highest. It follows the same "unknown is
  not no" rule as the region filter: a video is only *excluded* when another modeled
  language scored clearly higher (a confident mismatch), never just because the requested
  language didn't hit the minimum word count — a hashtag-only Short title, the exact case
  that broke the script filter for Tamil, has too little text to say anything and is left
  in rather than guessed at. Any language outside this set still falls back to YouTube's
  soft hint, and the UI says so.

**Both filters degrade instead of zeroing out a run.** The first live test of the script
filter — the exact reported scenario, re-run — hit `NO_RESULTS_AFTER_FILTER`: 0 of 50 Shorts
verified as Tamil by script, because Shorts titles overwhelmingly use English/Latin hashtags
for algorithmic reach even when the creator and spoken content are genuinely Tamil — written
metadata doesn't reflect spoken language. A filter that can turn a real analysis into a hard
error on its own uncertainty is worse than one that's occasionally too soft, so each filter
only takes effect if it leaves at least one video; otherwise it's skipped with a warning
explaining why, and the run proceeds on YouTube's own ranking instead. Re-verified on the
same scenario: the run now completes (region cut 50→25, language filter skipped itself with
`Could not verify any of 50 videos as "ta" by script...`, tag-hijack and gap-mining filters
still ran on top), rather than erroring out. A positive-control run (a Tamil-script niche
query with `relevanceLanguage=ta`) confirms the filter does hard-cut when script evidence is
actually present, so this isn't a filter that's silently given up entirely.

**Latin-script languages get a coarser second filter** for a modeled subset (`en`, `es`,
`fr`, `de`, `pt`, `it`, `nl`): common-word matching instead of script — see
[`matchesLatinLanguage()`](server/src/lib/language.js) — compares a video's own words
against a short list of common function words per language and keeps whichever language
scores highest, excluding a video only when another modeled language scored strictly
higher (a confirmed mismatch), never merely because the requested language didn't clear a
minimum word count. That distinction matters: gating on the target language's own score
alone would have called confidently-Spanish text asked about `en` "too little signal" (0
English words) and left it in, when it is actually the opposite — a confident mismatch. The
minimum instead gates on the *best* score across the whole modeled set, so a hashtag-only
Short (no recognizable words in *any* modeled language) is the only thing left undecided.
Verified live on `niche="recetas de cocina"`, `relevanceLanguage=es`: 23 of 50 videos
confirmed Spanish, 2 confirmed as a different Latin language and excluded, the rest left
undecided and kept rather than guessed at.

That same live run also surfaced an unrelated bug: gap mining failed with a DeepSeek 400
("unexpected end of hex escape") on a comment whose truncation happened to land inside an
emoji. `truncate()`'s `.slice(0, n)` cuts by UTF-16 code unit, and an emoji is two code
units (a surrogate pair) — cutting between them leaves one unpaired surrogate, which
`JSON.stringify` emits as a literal escape that isn't valid standalone Unicode. Fixed by
slicing on `[...s]` (Unicode code points) instead in both places `truncate()` was defined
(`services/analyze.js`, used in every LLM prompt, and `lib/auditLog.js`, used in the audit
log). Re-ran the exact same scenario after the fix: it now completes end to end.

**A user report on `niche="ghost story"`, `regionCode=IN`, `relevanceLanguage=ta` surfaced a
deeper problem with the language filter than just its accuracy: the audit log said
`videos.list resolved 1 of them to full stats`, reading as if YouTube itself had only found
1 Tamil video for the niche.** Two separate things were actually true, and the log was
conflating them:

- **The audit log had a labeling bug.** `logSearch()` was called with the region/language
  filter's *output* (`ranked`, already narrowed) but its own text described that number as
  what `videos.list` resolved. Verified live: `videos.list` actually resolved all 50 — the
  region/language filter is what cut it to 1, and the log never said so. Fixed by passing
  the true pre-filter count separately from the post-filter list, and printing the filter's
  own warnings inline in the log section instead of leaving them only in the API's JSON
  response.
- **The filter's small yield was also a real, separate problem**, and the log bug had been
  hiding it. `search.list`'s query TEXT was still just "ghost story" in English —
  `relevanceLanguage=ta` on its own barely moves YouTube's ranking (established earlier in
  this section) — so of the 50 candidates fetched, only 1 was genuinely Tamil; the filter
  correctly rejected the other 49, but 49 rejections out of a pool that should never have
  been 98% off-language in the first place is a fetch problem, not a filter problem. The fix
  the user found manually — typing "ghost story tamil" into YouTube's own search box — is
  now applied automatically: `searchVideos()` folds the target language's English name into
  the query text itself (`languageQueryHint()` in `lib/language.js`) for any language this
  module can verify, on top of (not instead of) the existing `relevanceLanguage` parameter
  and the post-fetch hard filter. Verified live, same niche and region: 1/50 verified-Tamil
  candidates without the query hint, **32/50 with it** — most Tamil-audience creators
  write "Tamil" into an otherwise English/romanized title or tags for reach, the same
  pattern already visible in the one video that matched even before this fix (titled
  `"...Experience in Tamil | ..."`). Re-ran the exact reported scenario end to end after
  both fixes: 32 of 50 videos survived the filter (down from 1), and the audit log now
  correctly attributes the drop to the filter, not to `videos.list`.

**The user then asked directly whether `videos.list`'s `snippet.defaultAudioLanguage` field
was worth checking before relying further on script/word-based text matching — it wasn't
something either fix above had used.** Checked it live, immediately, across the same "ghost
story" query plus three unrelated niches: coverage was 49–50 of 50 videos in every sample,
in sharp contrast to `channels.list`'s sparsely-set `country` field. Cross-checked against
the script detector on the original query: of 38 videos YouTube tagged `defaultAudioLanguage:
ta`, 7 had titles with **zero Tamil script at all** — but every one of those 7 said things
like *"GHOST STORIES IN TAMIL"* or *"...| Tamil Horror"*, written entirely in Latin letters.
That's not noise; it's YouTube correctly identifying Tamil audio in a video whose title
happens to be in English — exactly the case script/word-text matching can never catch, since
it can only read text, not audio. One clear disagreement did turn up too: a video with
unambiguous Tamil-script text in its title was tagged `defaultAudioLanguage: en-GB`, most
likely a stale value from a channel's first-ever upload nobody corrected — a known real-world
quirk of this field.

That evidence shaped the design in `matchesRequestedLanguage()` ([`lib/language.js`](server/src/lib/language.js)),
which replaced the separate script/Latin-heuristic branches in the pipeline with one combined
check per video:

- **Audio language is the primary signal** — it reflects what's actually spoken, not what
  script a title happens to use, and via `videos.list` it covers *any* language YouTube
  recognizes, not just the ~38 with a script or word-list modeled in this app.
- **Script/word-text evidence is a second opinion that can rescue a video from a wrong or
  stale audio-language value** (the `en-GB`-but-visibly-Tamil case) — a title genuinely using
  a language's own script is very hard to produce by accident, so a positive text match wins
  even when audio disagrees.
- **A video is excluded only when audio explicitly disagrees and text evidence didn't rescue
  it** — the same "unknown is not no" rule as the region filter. A video with no audio-language
  field and no text evidence either stays in, undecided, rather than guessed at.

Verified live on the exact reported scenario one more time: **39 of 50 videos confirmed
Tamil by audio language, 38 survived to analysis** after the region filter ran on top — up
from 32/50 with the query-hint fix alone, and 1/50 in the original report. The audit log
confirms the same numbers and correctly names the audio-language check as the reason.

**A fourth signal: does the title itself name a *different* language?** A user-reported
"thalapathy vijay" / `relevanceLanguage=ta` run still surfaced Hindi-language comments under a
Tamil filter. The evidence videos — titles like *"GALAXY Full Movie Hindi Dubbed 2026 |
Thalapathy Vijay..."* — had `defaultAudioLanguage: null` (verified live: uploaders on these
channels never set it) and a pure-Latin title (no Tamil script to check), so every signal above
landed on "undecided, kept" even though the title says outright, in English, that the audio is
Hindi. Comment fetching has no language awareness of its own — it just reads whatever survives
the filter — so those Hindi comments leaked straight into gap mining.

`namedLanguages()` closes that gap: it looks for a language's English name sitting within a few
words of a dub/version/subtitle/audio label ("Hindi Dubbed", "Tamil Dub", "English Subtitles").
Scoped narrowly on purpose — a language's name shows up constantly in phrases that say nothing
about a video's own audio ("French toast", "Dutch oven", "Greek yogurt", "Chinese checkers"),
and a bare name match would misfire on all of those; requiring the dub/version/subtitle context
word nearby avoids it (verified against exactly those phrases). It is the *weakest* signal in
the combinator — checked last, and only converts a remaining "undecided" into "excluded" when
audio and script/word evidence had nothing to say; it never overrides a positive confirmation,
and a bilingual claim that also names the *requested* language ("Hindi & Tamil Dubbed") is left
undecided rather than excluded. Verified live on all seven Hindi-dubbed videos from the
reported run: `matchesRequestedLanguage('ta', video)` went from `null` (kept) to `false`
(excluded), while the genuinely Tamil-script videos in the same batch were unaffected.

---

## Layout

```
server/
  src/
    config.js              env + tunable heat weights
    services/
      youtube.js           search/videos/channels/comments/uploads, quota-aware
      deepseek.js          JSON chat client, retry + model fallback
      analyze.js           prompts (niche + channel), comment selection, citation grounding
      pipeline.js          phase orchestration
      runner.js            shared run orchestration for the route and the scheduler
      scheduler.js         re-runs saved watches, conservatively
      brief.js             "Make it": hooks + script + SEO for one gap (one DeepSeek call)
    lib/
      heat.js              the scoring formula
      outlier.js           views vs. each channel's own median (from youtube-agent-skill)
      exclusions.js        ledger of every video set aside and why (the funnel on the report)
      confidence.js        how much to trust each output, by what it computes (replaces the flat 12)
      titleLint.js         deterministic title/thumbnail lint + invented-number check
      hookScore.js         five-property hook scorer (port of hookscore.py)
      hookFormulas.js      21 title/hook formulas (data/hooks.json) -> label a title
      searchPlan.js        which search.list slices a request needs = the cost model
      cache.js             disk cache, keyed by query hash (swap for Redis at this seam)
      store.js             persisted reports + per-niche gap history (the recurrence baseline)
      recurrence.js        fuzzy gap matching across runs: recurring / new / closed
      watches.js           saved-watch list
      jobs.js              in-process job registry (swap for BullMQ here)
      quota.js             daily unit ledger, locked
      fileLock.js          cross-process mutex for the state files
      rateLimit.js         per-IP sliding window
      relevance.js         keyword-overlap niche relevance check (off in channel mode)
      auditLog.js          per-run human-readable log (server/logs/, gitignored)
  test/unit.test.js
web/
  src/
    App.jsx                page router (/ = Niche Explorer, /channel = Channel Analyzer),
                           nav switcher, tabs, polling, URL state
    components/            SearchForm (mode fixed by the page, no toggle), ProgressRail,
                           Topic/Gap/Objection/Avoid cards, ThinPoolNotice,
                           HistoryPanel, WatchPanel (both mode-filtered), ExportMenu
    lib/                   API client, formatters, URL state (mode ↔ path), export serializers
```

## Known limits

- **Shorts detection** is duration-based (≤180s). `search.list` can only pre-filter to
  <4 minutes, so the exact cut happens after `videos.list` returns durations. A ≤180s
  video that wasn't published as a Short still counts as one.
- **Hidden stats.** Channels can hide like counts and subscriber counts, and comments can
  be disabled. Those videos score on the signals that remain rather than being dropped.
- **Pool size is bounded by slices.** Each `search.list` slice returns 50 videos for 100
  units, so a niche run sees 50 (or 100 with deep scan or long-form, 200 with both). Channel
  mode pages the uploads playlist at 1 unit per 50 instead, capped at 6 pages for latency.
- **Thin pools are reported, not fixed.** Heat is a rank within the result set, so with very
  few videos it mostly restates view order. The run says so, says *why* the set is that
  size (your filters, the niche and window, or the channel's own cadence) and offers the
  matching one-click remedy, but it cannot manufacture videos that don't exist in the window.
  How much each output is trusted is judged by what it computes, below.
- **Recurrence needs a baseline.** Nothing can be marked recurring on a subject's first
  stored run — the signal only appears from the second run onward, which is what watches
  exist to produce. Fuzzy question matching is stemmed-token overlap, not semantic: a gap
  re-worded with entirely different vocabulary will read as new.
- **The scheduler is single-instance**, like `lib/jobs.js`. Two servers sharing a state
  directory would fire every watch twice. Set `SCHEDULER_ENABLED=false` on replicas.
- **Custom ranges reach back 365 days.** `search.list` will go further, but older windows
  make view-velocity scoring meaningless — everything looks slow.
- **In-process jobs and disk cache** assume a single server instance. `lib/jobs.js` and
  `lib/cache.js` are the seams to swap for Redis/BullMQ before running more than one.
- **Comment relevance ordering** is YouTube's own; the API won't sort by like count.
- **Search relevance can drift.** `search.list` decides what matches a niche, and it pulls
  in adjacent content — a "cast iron restoration" run surfaced a barn-find motorcycle
  cluster. Narrower niches drift less, and the topic's example videos make drift obvious
  at a glance.
- **Long-form used to stop at 20 minutes.** `search.list`'s `videoDuration` buckets are
  `short` (<4m), `medium` (4-20m) and `long` (>20m), and one call takes exactly one of them —
  but "long-form" here means "not a Short", i.e. everything over 180s, which spans *two*
  buckets. The code asked for `medium` alone, so the >20min bucket was never requested at
  all. Verified live on `"home lab server tutorial"`/90d: `contentType=long` returned **0**
  videos over 20 minutes (longest: exactly 20:00) while the same query under `any` surfaced
  11, up to 45 minutes. For tutorial, podcast and review niches that silently removed the
  deepest half of the corpus. Requesting `any` instead would restore the range but dilute the
  pool with Shorts the post-filter then discards — and since Shorts carry outsized view
  counts, an `order=viewCount` pool could come back almost entirely Shorts. So long-form now
  spends two slices: re-verified on the same query, **100 candidates, all non-Short, 50 of
  them over 20 minutes, longest 208 minutes**.
- **The candidate pool was biased against exactly what the scoring rewards.**
  `order=viewCount` makes the pool the top N by *absolute* views, while
  `config.heat.wOutperformance` (0.35, a third of the score) exists to surface a small
  channel breaking out. A channel doing 8k views in a niche whose ceiling is 2M was never in
  the pool to be scored. **Deep scan** adds a second `order=date` pass over the same buckets
  so those videos can enter at all. Opt-in, because it costs another 100 units per format.
- **The region filter still has a real gap.** It relies on a self-reported `channels.list`
  field many creators never set (treated as "unknown", not excluded) — there's no equivalent
  of the language filter's `defaultAudioLanguage` for a channel's country. The language
  filter itself now works for any language YouTube recognizes (via each video's own declared
  or detected audio language), with script/word-text matching as a secondary check for a
  modeled subset. See [Region and language filters](#region-and-language-filters).
