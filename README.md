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

```
niche + window + format
   │
   ├─ 1. search.list          100 units   → up to 50 candidate video ids
   ├─ 2. videos.list            1 unit    → stats + duration, batched 50/call
   ├─ 3. channels.list          1 unit    → subscriber counts, batched 50/call
   ├─ 4. commentThreads.list    1 unit ×N → top comments, one call per video
   │
   ├─ 5. score in code                    → heat, per video and per topic
   ├─ 6. DeepSeek pass A                  → cluster into topics + avoid list
   └─ 7. DeepSeek pass B                  → mine comments for unmet demand
```

A full run takes **60-120 seconds** (measured 76s and 92s on a 50-video niche; DeepSeek
latency is the variable part), so `POST /api/analyze` returns a job id and the client polls
`GET /api/jobs/:id` for phase-by-phase progress rather than holding the request open.
Results are cached per niche+window (3h default), and cache hits cost nothing.

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
resets on YouTube's own midnight-Pacific boundary, not UTC. Cache hits bypass both.

---

## Quota, in practice

`search.list` costs 100 units against a default 10,000/day quota — everything else costs 1.
One analysis is **127 units** (1 search + 1 videos + 1 channels + 25 commentThreads),
so the default 9,000-unit budget allows **70 fresh analyses per day**. The UI shows remaining budget in the header.

This is why there is exactly one search call per run, why `videos.list` and `channels.list`
are batched 50 ids at a time, and why results are cached. `commentThreads.list` is the one
call that can't be batched — it takes a single `videoId` — so it runs per-video against the
top `MAX_COMMENT_VIDEOS` (default 25) and is capped for latency as much as for quota.

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
| `GET /api/quota` | Units used/remaining today, cache size, rate limit. |
| `GET /api/health` | Liveness plus the phase list. |
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
  "relevanceLanguage": "en" # optional, ISO 639-1 -- hard filter: script-based for languages
                             # with a distinct script, common-word matching for a handful of
                             # Latin-script ones (en/es/fr/de/pt/it/nl); soft hint otherwise (see below)
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

---

## Layout

```
server/
  src/
    config.js              env + tunable heat weights
    services/
      youtube.js           search/videos/channels/comments, quota-aware
      deepseek.js          JSON chat client, retry + model fallback
      analyze.js           prompts, comment selection, citation grounding
      pipeline.js          phase orchestration
    lib/
      heat.js              the scoring formula
      cache.js             disk cache (swap for Redis at this seam)
      jobs.js              in-process job registry (swap for BullMQ here)
      quota.js             daily unit ledger
      rateLimit.js         per-IP sliding window
      relevance.js         keyword-overlap niche relevance check
      auditLog.js          per-run human-readable log (server/logs/, gitignored)
  test/unit.test.js
web/
  src/
    App.jsx                tabs, polling, state
    components/            SearchForm, ProgressRail, Topic/Gap/Avoid cards
    lib/                   API client, formatters
```

## Known limits

- **Shorts detection** is duration-based (≤180s). `search.list` can only pre-filter to
  <4 minutes, so the exact cut happens after `videos.list` returns durations. A ≤180s
  video that wasn't published as a Short still counts as one.
- **Hidden stats.** Channels can hide like counts and subscriber counts, and comments can
  be disabled. Those videos score on the signals that remain rather than being dropped.
- **Single search page.** One `search.list` call caps a run at 50 videos. Paginating costs
  another 100 units per page.
- **Custom ranges reach back 365 days.** `search.list` will go further, but older windows
  make view-velocity scoring meaningless — everything looks slow.
- **In-process jobs and disk cache** assume a single server instance. `lib/jobs.js` and
  `lib/cache.js` are the seams to swap for Redis/BullMQ before running more than one.
- **Comment relevance ordering** is YouTube's own; the API won't sort by like count.
- **Search relevance can drift.** `search.list` decides what matches a niche, and it pulls
  in adjacent content — a "cast iron restoration" run surfaced a barn-find motorcycle
  cluster. Narrower niches drift less, and the topic's example videos make drift obvious
  at a glance.
- **Region and language filters both have real gaps.** Region relies on a self-reported
  `channels.list` field many creators never set (treated as "unknown", not excluded).
  Language hard-filters scripted languages by script and a modeled subset of Latin-script
  languages (`en`/`es`/`fr`/`de`/`pt`/`it`/`nl`) by common-word matching, which is coarser
  and needs real running text to say anything — any language outside both sets falls back
  to YouTube's own soft ranking hint. See
  [Region and language filters](#region-and-language-filters).
