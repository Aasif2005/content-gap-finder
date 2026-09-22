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

```bash
curl -X POST localhost:8787/api/analyze -H 'Content-Type: application/json' -d '{
  "niche": "cast iron restoration",
  "window": "7d",           # 24h | 7d | 30d | 90d
  "contentType": "both",    # shorts | long | both
  "gapMode": "inclusive",   # inclusive | strict
  "minViews": 0,
  "regionCode": "US",       # optional, ISO 3166-1 alpha-2
  "relevanceLanguage": "en" # optional, ISO 639-1
}'
```

`"force": true` bypasses the cache and spends fresh quota.

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
- **In-process jobs and disk cache** assume a single server instance. `lib/jobs.js` and
  `lib/cache.js` are the seams to swap for Redis/BullMQ before running more than one.
- **Comment relevance ordering** is YouTube's own; the API won't sort by like count.
