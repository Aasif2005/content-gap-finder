import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One human-readable .log per run (so it can be opened and read directly) plus
// one line per run appended to an index.jsonl (so the API can list/filter runs
// without opening every file). This exists to answer one question at a glance:
// did the model actually extract information about the niche, or did it drift.
const LOG_DIR = path.resolve(fileURLToPath(new URL('../../logs', import.meta.url)));
const RUNS_DIR = path.join(LOG_DIR, 'runs');
const INDEX_FILE = path.join(LOG_DIR, 'index.jsonl');

function ensureDirs() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

/** Builds up one run's log across the pipeline's phases, then flushes it. */
export class RunLogger {
  constructor(runId, input) {
    this.runId = runId;
    this.input = input;
    this.startedAt = Date.now();
    this.sections = [];
    this.summary = null; // set by finish()
  }

  section(title, lines) {
    // Auto-numbered by call order, not by which phase title implies -- avoid is
    // computed after gaps in the pipeline, so a hardcoded "3."/"4." would print
    // out of order relative to the actual section that follows it.
    const n = this.sections.length + 1;
    this.sections.push({ title: `${n}. ${title}`, lines: Array.isArray(lines) ? lines : [lines] });
  }

  /**
   * Logs the search results. `videos` here is what SURVIVES every filter
   * (format/views/region/language) -- `resolvedCount` is the true, unfiltered
   * videos.list number, logged separately so the two are never conflated.
   * Real bug this fixes: this method used to log `videos.length` (the
   * post-filter count) under the label "videos.list resolved N of them to
   * full stats", which is what's actually reported by videos.list -- a run
   * that fetched and resolved 50 videos then had the region/language filter
   * cut it to 1 logged "videos.list resolved 1 of them", reading as if the
   * YouTube API call itself only found 1 video, when it found all 50.
   */
  logSearch(hits, resolvedCount, videos, warnings = [], slices = []) {
    const filterLine =
      resolvedCount !== videos.length
        ? [`format/min-views/region/language filters then narrowed that down to the ${videos.length} shown below:`, ...warnings.map((w) => `  ⚠ ${w}`)]
        : [];
    // Per-slice yield. A thin pool is usually one slice coming back nearly
    // empty, and without this the log shows only the merged total -- which
    // can't distinguish "the niche has little content" from "the long-form
    // bucket returned nothing".
    const sliceLines = slices.length > 1
      ? [
          `${slices.length} search.list slices (${slices.length * 100} units):`,
          ...slices.map((sl) => `  order=${sl.order} duration=${sl.videoDuration} -> ${sl.found} results, pool now ${sl.poolAfter}`),
        ]
      : [];
    this.section('SEARCH — raw candidates from YouTube', [
      `search.list matched ${hits.length} videos for "${this.input.niche}" (window: ${this.input.window}, type: ${this.input.contentType}, region: ${this.input.regionCode ?? 'any'}, language: ${this.input.relevanceLanguage ?? 'any'}${this.input.deepScan ? ', deep scan' : ''})`,
      ...sliceLines,
      `videos.list resolved ${resolvedCount} of them to full stats`,
      ...filterLine,
      '',
      ...videos.slice(0, 50).map((v, i) =>
        `  ${String(i + 1).padStart(2)}. [${v.videoId}] ${v.isShort ? 'Short' : 'long'} ${Math.round(v.durationSeconds)}s — "${truncate(v.title, 90)}" (${v.channelTitle})` +
        (v.tagOnlyMatch ? '\n       ⚠ TAG-ONLY: niche appears only in tags/hashtags, not in the title prose' : '')
      ),
      '',
      `${videos.filter((v) => v.tagOnlyMatch).length} of ${videos.length} candidates matched the niche only via tags/hashtags.`,
    ]);
  }

  /** Logs each topic the model produced, its evidence videos, and the relevance check. */
  logTopics(topics, relevanceResults) {
    const lines = [`DeepSeek clustered the videos into ${topics.length} topics:`, ''];
    topics.forEach((t, i) => {
      const rel = relevanceResults[i];
      const flag = !rel.relevant
        ? '  ⚠ NOT NICHE-RELEVANT — no niche keyword found anywhere in this topic'
        : rel.tagSuspect
          ? '  ⚠ TAG-SUSPECT — every video here matched the niche only via tags/hashtags'
          : '';
      lines.push(`  Topic ${i + 1}: "${t.label}"${flag}`);
      lines.push(`    summary: ${truncate(t.summary, 160)}`);
      lines.push(`    relevance: matched [${rel.matched.join(', ') || 'none'}] (${rel.matchedIn ?? 'n/a'}), score ${rel.score}`);
      lines.push(`    evidence videos (${t.videos.length}):`);
      t.videos.slice(0, 6).forEach((v) => lines.push(`      - "${truncate(v.title, 80)}" (${v.channelTitle}, ${v.views} views)`));
      lines.push('');
    });
    this.section('TOPIC CLUSTERING — what the model extracted', lines);
  }

  logAvoid(avoid, relevanceResults) {
    if (!avoid.length) {
      this.section('AVOID LIST', ['(none returned)']);
      return;
    }
    const lines = [];
    avoid.forEach((a, i) => {
      const rel = relevanceResults[i];
      const flag = rel.relevant ? '' : '  ⚠ NOT NICHE-RELEVANT';
      lines.push(`  ${i + 1}. "${a.label}"${flag} — stats confirm: ${a.confirmedByStats}`);
      lines.push(`     reason: ${truncate(a.reason, 160)}`);
      lines.push(`     relevance matched: [${rel.matched.join(', ') || 'none'}]`);
      lines.push('');
    });
    this.section('AVOID LIST — what the model flagged', lines);
  }

  /** Logs every gap with its resolved evidence quotes, so a fabricated one is visible. */
  logGaps(gaps, relevanceResults) {
    if (!gaps.length) {
      this.section('GAP MINING', ['(no gaps survived grounding)']);
      return;
    }
    const lines = [`${gaps.length} gaps survived citation grounding (fabricated citations are dropped before this point):`, ''];
    gaps.forEach((g, i) => {
      const rel = relevanceResults[i];
      const flag = rel.relevant ? '' : '  ⚠ NOT NICHE-RELEVANT — question/evidence never mentions the niche';
      lines.push(`  Gap ${i + 1} [score ${g.demandScore}, ${g.coverage}]: ${g.question}${flag}`);
      lines.push(`    relevance matched: [${rel.matched.join(', ') || 'none'}]`);
      lines.push(`    evidence (${g.evidenceCount} comments, ${g.distinctVideos} distinct videos):`);
      g.evidence.slice(0, 5).forEach((e) => lines.push(`      - (♥${e.likes}) "${truncate(e.text, 120)}"`));
      lines.push('');
    });
    this.section('GAP MINING — what the model extracted from comments', lines);
  }

  logError(err) {
    this.section('ERROR', [err.message, err.stack ?? '']);
  }

  /** Writes the .log file and appends the index line. Call exactly once. */
  finish({ status, topicRelevance, gapRelevance, avoidRelevance }) {
    ensureDirs();
    this.summary = {
      runId: this.runId,
      startedAt: new Date(this.startedAt).toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      niche: this.input.niche,
      window: this.input.window,
      contentType: this.input.contentType,
      status,
      topicRelevance,
      gapRelevance,
      avoidRelevance,
    };

    const header = [
      `Content Gap Finder — analysis audit log`,
      `run id     : ${this.runId}`,
      `niche      : "${this.input.niche}"`,
      `window     : ${this.input.window}  |  format: ${this.input.contentType}  |  gapMode: ${this.input.gapMode}`,
      `started    : ${new Date(this.startedAt).toISOString()}`,
      `elapsed    : ${(this.summary.elapsedMs / 1000).toFixed(1)}s`,
      `status     : ${status}`,
      '',
      '=== NICHE RELEVANCE SUMMARY ===',
      `topics: ${topicRelevance?.relevant ?? '-'}/${topicRelevance?.total ?? '-'} relevant (${topicRelevance?.rate ?? '-'}%)${flagNote(topicRelevance)}`,
      `gaps  : ${gapRelevance?.relevant ?? '-'}/${gapRelevance?.total ?? '-'} relevant (${gapRelevance?.rate ?? '-'}%)${flagNote(gapRelevance)}`,
      `avoid : ${avoidRelevance?.relevant ?? '-'}/${avoidRelevance?.total ?? '-'} relevant (${avoidRelevance?.rate ?? '-'}%)${flagNote(avoidRelevance)}`,
      'A low rate does not always mean the model hallucinated -- search.list itself',
      'can pull in adjacent content. Check the ⚠-flagged entries below by eye.',
      '',
      '='.repeat(78),
      '',
    ].join('\n');

    const body = this.sections
      .map((s) => `${'-'.repeat(78)}\n${s.title}\n${'-'.repeat(78)}\n${s.lines.join('\n')}`)
      .join('\n\n');

    fs.writeFileSync(path.join(RUNS_DIR, `${this.runId}.log`), header + body + '\n');
    fs.appendFileSync(INDEX_FILE, JSON.stringify(this.summary) + '\n');
    return this.summary;
  }
}

function flagNote(rel) {
  return rel?.flagged ? `  ⚠ ${rel.flagged} flagged` : '';
}

// Code-point-safe: a raw .slice(0, n) can cut a surrogate pair (an emoji) in
// half and leave an unpaired half in the log file. See analyze.js's truncate
// for the live case this was found from (same bug, different call site).
function truncate(s, n) {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length > n ? chars.slice(0, n).join('') + '…' : t;
}

/** Most recent runs, newest first, for the log-listing endpoint. */
export function listRuns(limit = 30) {
  try {
    const lines = fs.readFileSync(INDEX_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Raw text of one run's log, for opening directly or serving over the API. */
export function readRunLog(runId) {
  const file = path.join(RUNS_DIR, `${runId}.log`);
  if (!/^[a-zA-Z0-9_-]+$/.test(runId) || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

export function logDir() {
  return LOG_DIR;
}
