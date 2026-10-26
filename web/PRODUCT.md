# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Solo YouTube creators: small and mid-size channels deciding what to film next. This includes regional-language creators (Tamil and Hindi audiences show up in real runs). They usually work alone, between uploads, on a laptop, with YouTube Studio open in another tab, and they want a video idea they can trust before they spend a week making it.

## Product Purpose
Gapstronaut reads what a niche's viewers actually say in YouTube comments and turns it into decisions:
- **Trending now:** angles that are working right now.
- **Content gaps:** questions viewers keep asking that no video answers well.
- **Complaints:** what viewers dislike about the videos that already exist.
- **Avoid:** angles that get views but little audience response.
- **Make it:** a plan and a ready-to-film script for one gap, as long as the topic needs.

Success means a creator leaves with one video to make, and the comments that prove people want it.

## Positioning
Every claim traces to evidence the creator can check. A gap quotes the real comments, with their like counts, and links each one to the video it was written under. Scores are computed in code, not guessed by the model, and are labelled as Gapstronaut's own. Avoid advice says when our numbers disagree with the model. Recurring demand is tracked across runs over time. A generic "AI video ideas" tool invents ideas; this one shows its working.

## Operating Context
- **Niche Explorer:** many creators in one niche.
- **Channel Analyzer:** one channel's own uploads and its own viewers.
- A run takes 60–120 seconds and shows progress.
- Reports are shareable at `/r/<id>`.
- Saved watches re-run on a schedule.
- Exports to Markdown and CSV for content calendars and Notion.

## Capabilities and Constraints
- **Accounts:** Firebase Authentication with Google and email + password. Logged out, a visitor can see the marketing homepage, the legal pages and shared report links. Analyses, Make it, the dashboard, watches and the profile need an account.
- **Free during beta**, with a daily allowance per account (default 3 fresh analyses and 20 Make it drafts). Cached re-runs are free. No pricing page and no prices.
- **YouTube API Services policies are binding:**
  - YouTube data is stored for 30 days at most;
  - our own metrics are marked "Calculated by Gapstronaut. Not a YouTube metric.";
  - "Developed with YouTube" attribution, and every comment links to its video;
  - users agree to the YouTube Terms of Service;
  - "Gapstronaut" may never be combined with YouTube branding, and must not imply endorsement.
- **Site-wide quota:** about 95 standard analyses a day (YouTube's `search.list` bucket) until the quota extension is approved.
- **Stack:** React 19 + Vite 7 + Tailwind 4 (web), Express (server), a hand-rolled router, no UI library.
- **Contact email:** a placeholder, `sample@gmail.com`, until the domain is bought.

## Brand Commitments
- **Name:** Gapstronaut. There is no logo yet.
- **Voice:** plain, specific and evidence-first. It names what was measured and what wasn't. No hype, no growth-hacking vocabulary, no fake urgency.
- **Look and feel (pinned by the owner, 2026-10-27):** premium, elegant and trustworthy. It must not read as a generic AI-made website. Calm and clear, with minimal, purposeful animation. The loud yellow "thumbnail" style was tried and rejected.

## Evidence on Hand
- **Live reports:** real reports from the server (the homepage shows a recent one via `/api/featured`: real gaps, real comment quotes, real video links).
- **Real behaviour to show:** the progress rail, evidence chips and Make it scripts.
- **None of these exist:** testimonials, user counts, customer logos, press or benchmarks. They must not be invented.

## Product Principles
1. Show the evidence, not the conclusion: every recommendation sits next to the comments and numbers behind it.
2. Code decides, the model proposes: anything a number can settle is settled by a number, and the UI says which is which.
3. Respect the creator's time: one clear next video beats a long list of maybes.
4. Honest limits: say when evidence is thin, a report has expired or quota has run out, and offer the way forward.

## Accessibility & Inclusion
- Light and dark themes, following the OS.
- Non-Latin text (Tamil, Hindi) must render well in quotes and titles.
- Everything must work by keyboard.
- Tabular numbers in stats.
