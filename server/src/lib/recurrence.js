import { STOPWORDS, stem } from './relevance.js';
import { config } from '../config.js';

/**
 * Whether a gap is new, recurring, or has gone away since last time.
 *
 * This is the difference between a snapshot and a trend line, and it is the one
 * judgement the tool could not make at all before: every run was amnesiac, so a
 * comment cluster that surfaced once because of which 25 videos happened to get
 * their comments scraped looked exactly as solid as demand that had been voiced
 * every week for a month. Those two deserve completely different decisions --
 * the second is worth a week of production, the first might be sampling noise.
 *
 * "Resolved" matters just as much in reverse: a gap that was live for three runs
 * and is now absent usually means somebody finally made the video, and the
 * window has closed.
 *
 * Matching has to be fuzzy. Gaps are natural-language questions written fresh by
 * the model each run, so the same underlying demand comes back phrased
 * differently every time ("why is my crumb gummy" / "how do I fix a dense,
 * gummy crumb"). Exact string matching would report every gap as new forever,
 * which is indistinguishable from the feature not working.
 */

/**
 * relevance.js's stem() with doubled final consonants collapsed on top.
 *
 * That stemmer is a crude suffix stripper, and it is deliberately left alone --
 * it backs niche keyword matching, which does substring matching against raw
 * text and is tuned and tested for that job. But its output is inconsistent
 * exactly where set-overlap matching is most sensitive: "spins" -> "spin" while
 * "spinning" -> "spinn", so two phrasings of one question lose a shared token to
 * a doubled letter. Collapsing the double makes both land on "spin".
 */
const normalize = (word) => stem(word).replace(/([a-z])\1$/, '$1');

/** Significant, stemmed tokens -- what two phrasings of one question share. */
export function gapTokens(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map(normalize)
  );
}

/**
 * Dice coefficient -- 2*shared / (|A| + |B|) -- plus a floor on shared tokens.
 *
 * Jaccard was the obvious first choice and it was wrong here, caught on live
 * data. These two gaps are the same question:
 *
 *   "Can you fix a warped cast iron pan, or one that spins and wobbles on a flat stove?"
 *   "Can you fix a warped or spinning cast iron skillet, and does it matter on a glass-top stove?"
 *
 * They share five substantive tokens (fix, warp, cast, iron, stove) but each
 * carries different incidental detail, so the union inflates to 16 and Jaccard
 * lands at 0.31 -- under threshold. The run then reported the same demand as
 * BOTH "new this run" and "closed since last run", which is worse than missing
 * it: it is two contradictory claims about one gap on the same screen.
 *
 * Jaccard penalises overlap for the length of whichever question is more
 * verbose. Dice halves that penalty while staying symmetric and bounded, and
 * scores this pair at 0.57. Pure containment (shared / min-size) would match
 * even more aggressively, but it rates a short question fully inside a long one
 * at 1.0, which is how unrelated-but-subsumed questions would start merging.
 *
 * The shared-token floor stays, and carries the weight Dice gives up: on short
 * questions a single coincidental word ("shorts", "beginner") can clear any
 * ratio threshold on its own.
 */
export function gapSimilarity(a, b) {
  const A = a instanceof Set ? a : gapTokens(a);
  const B = b instanceof Set ? b : gapTokens(b);
  if (!A.size || !B.size) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return { score: (2 * shared) / (A.size + B.size), shared };
}

const matches = (a, b) => {
  const { score, shared } = gapSimilarity(a, b);
  return shared >= config.recurrence.minSharedTokens && score >= config.recurrence.minSimilarity;
};

/**
 * Annotates each current gap with its own history, and returns the gaps that
 * were present before but are not any more.
 *
 * `history` is the flat per-niche gap log from lib/store.js (one row per gap per
 * past run), NOT whole past reports -- keeping it that small is what lets the
 * baseline go back months, which is the only thing that makes any of this
 * meaningful.
 */
export function classifyRecurrence(currentGaps, history, {
  now = Date.now(),
  minHours = config.recurrence.minHours,
  filters = null,
  noComments = false,
} = {}) {
  // Rows recorded under different filters (another language, region or gap
  // mode) mined different comments; comparing against them would call every
  // gap new and every old one resolved. Rows from before these fields were
  // recorded carry none of them and still count.
  const sameFilters = (row) => !filters || Object.entries(filters).every(([k, v]) => row[k] === undefined || (row[k] ?? '') === (v ?? ''));

  // A re-run within `minHours` re-reads the same comments, so it is not a second
  // sighting of the demand: three runs ten minutes apart marked gaps "recurring
  // x3". Those runs are left out, and the rest are grouped into OCCASIONS at
  // least `minHours` apart, so timesSeen counts occasions rather than clicks.
  const cutoff = now - minHours * 3600 * 1000;
  const byRun = new Map();
  let recentSkipped = 0;
  const skippedRunIds = new Set();
  for (const row of history) {
    if (!sameFilters(row)) continue;
    const t = new Date(row.generatedAt).getTime();
    if (!(t <= cutoff)) {
      if (!skippedRunIds.has(row.runId)) { skippedRunIds.add(row.runId); recentSkipped++; }
      continue;
    }
    if (!byRun.has(row.runId)) byRun.set(row.runId, { runId: row.runId, generatedAt: row.generatedAt, t, gaps: [], comments: row.comments });
    // A marker row records that a run happened (and how many comments it mined) without a gap.
    if (!row.marker) byRun.get(row.runId).gaps.push(row);
  }
  // A run that mined no comments (an outage, comments switched off) says
  // nothing about demand, so it is not an occasion.
  const runsSorted = [...byRun.values()].filter((r) => r.comments !== 0).sort((a, b) => a.t - b.t);
  const pastRuns = [];
  for (const r of runsSorted) {
    const last = pastRuns[pastRuns.length - 1];
    if (last && r.t - last.t < minHours * 3600 * 1000) last.gaps.push(...r.gaps);
    else pastRuns.push({ runId: r.runId, generatedAt: r.generatedAt, t: r.t, gaps: [...r.gaps] });
  }

  const currentTokens = currentGaps.map((g) => gapTokens(g.question));
  const matchedHistoryRows = new Set();

  const annotated = currentGaps.map((gap, i) => {
    const tokens = currentTokens[i];
    const seenIn = [];

    for (const run of pastRuns) {
      const hit = run.gaps.find((h) => matches(tokens, gapTokens(h.question)));
      if (hit) {
        seenIn.push({ runId: run.runId, generatedAt: run.generatedAt, question: hit.question, demandScore: hit.demandScore, coverage: hit.coverage });
        matchedHistoryRows.add(`${run.runId}::${hit.question}`);
      }
    }

    // timesSeen counts this run too -- "seen in 4 runs" reads more naturally to
    // someone looking at the 4th than "seen 3 times before".
    const timesSeen = seenIn.length + 1;
    const first = seenIn[0];
    const previous = seenIn[seenIn.length - 1];

    return {
      ...gap,
      recurrence: {
        status: seenIn.length === 0 ? (pastRuns.length ? 'new' : 'unknown') : 'recurring',
        timesSeen,
        runsCompared: pastRuns.length,
        firstSeen: first?.generatedAt ?? null,
        previousSeen: previous?.generatedAt ?? null,
        // Direction of travel. Demand climbing across runs is a stronger buy
        // signal than a high score in isolation.
        previousDemandScore: previous?.demandScore ?? null,
        trend:
          previous?.demandScore == null
            ? null
            : gap.demandScore > previous.demandScore * 1.15
              ? 'rising'
              : gap.demandScore < previous.demandScore * 0.85
                ? 'falling'
                : 'steady',
      },
    };
  });

  // Gaps from the most recent previous run that nothing in this run matches.
  // Only the latest run is considered: something absent for several runs is
  // simply old news, and reporting it forever would bury the useful signal.
  const latest = pastRuns[pastRuns.length - 1];
  // With no comments mined this time, absence proves nothing.
  const resolved = !latest || noComments
    ? []
    : latest.gaps
        .filter((h) => !currentTokens.some((t) => matches(t, gapTokens(h.question))))
        // An occasion merges several runs, so the same question can appear more than once.
        .filter((h, i, all) => all.findIndex((x) => matches(gapTokens(x.question), gapTokens(h.question))) === i)
        .map((h) => ({
          question: h.question,
          lastSeen: h.generatedAt,
          previousDemandScore: h.demandScore,
          previousCoverage: h.coverage,
          runId: h.runId,
        }));

  return { gaps: annotated, resolved, runsCompared: pastRuns.length, recentSkipped };
}
