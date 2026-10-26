# YouTube API audit and quota extension: the submission packet

Everything you need to fill in Google's **YouTube API Services: Audit and Quota Extension Form**
(https://support.google.com/youtube/contact/yt_api_form) for Gapstronaut.

Text in `[brackets]` is for you to fill in. Everything else describes what the app does today.
Before submitting, re-check it against the current code, and keep it honest: auditors compare it
with the live site.

There is no paid plan. The audit is free, and approval is what raises the limits. Google gives no
timeline; reports range from a few weeks to a few months.

---

## Before you submit (checklist)

- [ ] The app is deployed at a public **https** URL, with `NODE_ENV=production` so HSTS is on.
- [ ] `CONTACT_EMAIL` is set in `.env`. `/privacy` and `/terms` show it, not the amber "not set" marker.
- [ ] You have read the Privacy Policy and Terms drafts (`web/src/pages/Legal.jsx`) and they match what you run. They are drafts, not legal advice.
- [ ] You have your **Google Cloud project number** (Cloud Console → Home → Project info). Use the number, not the id.
- [ ] The developer contact email in the Cloud Console is current, because YouTube sends audit mail there (Developer Policies III.D.5).
- [ ] The project has made API calls in the last 90 days. Inactive projects can lose quota (III.D.4).
- [ ] You use one Cloud project and one API key for this app. Never split traffic across projects to get more quota; it is prohibited (III.D.1.c) and gets keys cut off.
- [ ] Optional: you downloaded the official "developed with YouTube" artwork from https://brand.youtube into `web/public/brand/` and set `LOGO_SRC` in `web/src/components/Attribution.jsx`.
- [ ] Screenshots and the screencast below are captured from the deployed site.

---

## Section 1: Request type

**Complete a compliance audit to request additional quota.**

## Section 2: Organization and contact

| Field | Answer |
|---|---|
| Applying as | Individual (or your organisation, if you have one) |
| Full legal name | `[your legal name]` |
| Organization legal name | `self` (if individual) |
| Primary website | `[https://your-domain]` |
| Legal address | `[your address]` |
| Category | Creator tools / Other: "Analytics tool for YouTube creators" |
| Primary contact | `[name, email]` |

## Section 3: Business model

**Describe your organization's work as it relates to YouTube** (100 to 5,000 characters):

> Gapstronaut is a research tool for YouTube creators. A creator enters a niche (for example
> "cast iron restoration") or their own channel. The app reads public videos, statistics and comments
> through the YouTube Data API, and shows three things:
>
> 1. which angles are getting attention right now;
> 2. which questions viewers keep asking in the comments that no video answers well;
> 3. which angles get views but little audience response.
>
> Every claim links back to the YouTube videos and comments behind it, so creators can check it on
> YouTube. The app helps creators make videos their audience is asking for, which adds new content to
> YouTube. It does not replace any YouTube experience. It has no player, no uploads, no automated
> actions and no scraping, and it uses only public data, read with an API key. It is not affiliated
> with YouTube.

| Field | Answer |
|---|---|
| Target audience | Content creators |
| Monetization | `[None / Subscription / …]`. If you show ads, re-read Developer Policies III.G.1.d first. |
| Google or YouTube partner manager | No |

## Section 4: API client

| Field | Answer |
|---|---|
| API client name | Gapstronaut |
| Contains "YouTube"? | **No** |
| Primary access URL | `[https://your-domain/]` |
| Privacy Policy URL | `[https://your-domain/privacy]` |
| Terms of Service URL | `[https://your-domain/terms]` |
| Publicly accessible? | Yes |
| Demo account | Not applicable: the app has no login. Reviewers can use it directly. If accounts are added later, create a demo account and put it here. |
| Special instructions | "Open the URL, type a niche such as 'sourdough starter', press Find gaps and accept the terms dialog. A run takes about 60–120 seconds. A finished example report: `[https://your-domain/r/<runId>]`." |

## Section 5: Use case and quota

| Field | Answer |
|---|---|
| Use case categories | **Tools for Creators** and **Analytics & Reporting** |
| Requires Google sign-in (OAuth)? | **No**. Public data only, read with an API key. |
| Derived metrics and data storage | **Accept the amendment.** See below. |
| Expected volume | `[pick the bracket matching your target, e.g. "1,000–10,000 requests per day"]` |

### Why we accept the derived-metrics amendment

The app calculates figures from API data. Each is labelled in the UI with an ⓘ "Calculated by
Gapstronaut from YouTube data. Not a YouTube metric." mark, and in exports:

- **Heat score (0–100):** a ranking of videos and topics within one result set. It is built from
  views per subscriber, views per day and engagement rate, falls under the policy's custom
  scores and ratios category, and is shown next to the raw view counts.
- **Engagement rate:** (likes + weighted comments) ÷ views, a simple ratio.
- **Channel-median multiple:** a video's views ÷ the median views of its own channel's recent
  uploads, a simple ratio.
- **Demand score:** our ranking of viewer requests, from comment count, spread across videos and
  likes on those comments.
- **Avoid stats** (confirmed, partly or contradicted): compare a group's median engagement rate
  with the result set's median.
- **Title check (0–100):** a checklist score for our own suggested titles. It uses no YouTube
  statistics.

Raw YouTube figures (views, likes, comments, subscribers) are shown unchanged and unmarked, so the
two kinds are visibly different. The app infers no protected attributes, gives no revenue
estimates and makes no brand-safety claims. It does not frame comparisons as rivalries.

**Cross-channel comparison (III.E.2):** the niche explorer compares public videos from many
channels on one subject. That comparison is the analysis, and it is why this application
accepts the amendment under Analytics & Reporting. Results are never presented as YouTube data
or as statements about YouTube's business.

### Endpoints used

| Endpoint | Why | Cost per niche run |
|---|---|---|
| `youtube.search.list` | Find recent videos for the niche. One call per duration slice: one for "both" or "shorts", two for long-form, doubled by the optional deep scan. | 1–4 search calls |
| `youtube.videos.list` | Statistics, duration and language for candidates, batched 50 ids per call | ~2 units, plus about 20 for baselines |
| `youtube.channels.list` | Subscriber counts, and resolving a channel URL in channel mode | ~1–3 units |
| `youtube.commentThreads.list` | Top comments for the top 25 videos, one call each (it cannot be batched) | ~25 units |
| `youtube.playlistItems.list` | Recent uploads of the top channels, to compare each video with its own channel's median; in channel mode, the channel's uploads | ~20 units |

A typical niche run costs **1 search call and about 67 units**. Measured live: 1 search call and 65
units. Channel mode costs 0 search calls and about 39 units.

### Quota requested

Replace the target with your own estimate. The arithmetic is what reviewers want to see.

- **Target:** `[500]` fresh analyses a day, for `[N]` active creators at about 2–3 runs each.
- **search.list:** average 1.5 calls a run (a mix of standard and long-form runs), × 500 = 750 a
  day, plus 30% headroom. **Request 1,000 search.list calls a day.**
- **Other units:** 67 × 500 = 33,500 a day, plus headroom. **Request 40,000 units a day.**

**Detailed justification** (paste and adjust):

> Each analysis makes 1–2 search.list calls (more only when a user opts into a deep scan) and about
> 67 units of videos, channels, commentThreads and playlistItems calls. We minimise usage:
>
> - Identical queries are served from a cache, and an identical query already running is joined
>   instead of re-run, so cached views and repeat visits cost nothing.
> - videos.list and channels.list are batched 50 ids per call.
> - Comments are read for at most 25 videos a run.
> - Each user is rate-limited per hour, and scheduled re-runs are limited to one every 6 hours or
>   more.
> - The app tracks the search and unit buckets separately and stops before the daily limits.
>
> At the default 100 search calls a day, the service supports at most 95 analyses a day across all
> users. At our target of [500] analyses a day, we need about [750] search calls and [33,500] units,
> and we request [1,000] search calls and [40,000] units for headroom.

### Required evidence (capture from the deployed site)

1. **Privacy Policy screenshots:** the full `/privacy` page. Show the YouTube API Services
   paragraph, the Google Privacy Policy link, the storage and 30-day section, the DeepSeek sharing
   line and the contact address.
2. **Homepage screenshot showing the privacy link:** `/` with the footer visible ("Privacy Policy ·
   Terms of Service · YouTube Terms of Service · Developed with YouTube").
3. **Terms of Service:** save `/terms` as a PDF (browser → Print → Save as PDF). It must show "you
   also agree to be bound by the YouTube Terms of Service".
4. **Dashboard screenshots:**
   - a report with "YouTube data as of …" and the ⓘ legend;
   - a gap card with comment quotes showing "on '<video>' ↗" links;
   - the ⓘ tooltip open on a heat score;
   - the consent dialog.

### Screencast script (about 2 minutes, unlisted YouTube video or Drive link)

1. Open the homepage and point out the footer links.
2. Type a niche, press **Find gaps**, tick the terms box and agree. Wait through the progress steps.
3. On the report, show "YouTube data as of …" and the ⓘ legend. Hover a heat score to show the
   "not a YouTube metric" tooltip.
4. Open **Content gaps** and click a comment's "on '<video>' ↗" link. It opens the video on YouTube.
5. Click a video row. It opens on YouTube.
6. Open **Privacy Policy**, scroll through it, then do the same for **Terms of Service**.

---

## Compliance summary (Developer Policies)

| Policy | Status | Where |
|---|---|---|
| III.A.1: users agree to the YouTube ToS | ✅ Terms say so; consent dialog before first use | `web/src/pages/Legal.jsx`, `web/src/lib/consent.jsx` |
| III.A.2: privacy policy, always reachable, names YouTube API Services, links Google's policy, covers collection, sharing and storage | ✅ | `/privacy`, footer on every page |
| III.A.2.h–i: revocation link and contact for Authorized Data | Not applicable (no OAuth); a contact is given anyway | `CONTACT_EMAIL` |
| III.C.5: search results are not modified | ✅ Titles and thumbnails are shown as returned; ranking is ours and labelled | `VideoStrip.jsx` |
| III.D.1: one project, credentials kept private | ✅ The key lives only in `.env` and is never sent to the browser | `services/youtube.js` |
| III.D.3: stay within quota | ✅ Separate search and unit ledgers, stopping before the limits | `lib/quota.js` |
| III.E.1: no audiovisual content stored | ✅ None is stored | |
| III.E.4: Non-Authorized Data kept 30 days at most | ✅ A sweep on boot and every 6h; expired links return 410 | `services/retention.js`, `lib/store.js` |
| III.E.4.f: historical data shown with its time | ✅ "YouTube data as of …" | `Attribution.jsx`, exports |
| III.E.4.h: derived metrics labelled | ✅ ⓘ marks and the export note; amendment accepted | `components/ui/Derived.jsx` |
| III.E.5: transport security | ✅ HSTS in production; deploy behind TLS | `lib/security.js` |
| III.E.6, III.I.14: no scraping | ✅ The API only | |
| III.F.2: attribution and branding | ✅ "Developed with YouTube", per-comment video links, "not affiliated" | `Attribution.jsx`, `CommentQuote.jsx`, `Footer.jsx` |
| III.I.2: no automated actions | ✅ The app is read-only | |
| III.J: child-directed? | Not child-directed; the policy says so | `/privacy` |

## After approval

- Raise `YOUTUBE_SEARCH_DAILY_CALLS` and `YOUTUBE_DAILY_UNIT_BUDGET` in `.env` to slightly below
  the new limits, and restart.
- Use the extra quota only for the approved use case (III.D.3).
- Expect periodic re-audits. Keep this document and the live site in sync.
