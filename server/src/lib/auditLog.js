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

  /**
   * Logs what recurrence comparison concluded. Worth its own section because
   * "this gap has been asked for four runs running" is a different kind of claim
   * from anything else in the log -- it depends on stored history rather than on
   * this run's data, so if it looks wrong this is where to check whether the
   * history was found at all.
   */
  logRecurrence(gaps, resolved, runsCompared) {
    if (!runsCompared) {
      this.section('RECURRENCE — comparison against earlier runs', [
        'No earlier runs of this subject are stored, so every gap is first-time-seen.',
        'Recurrence becomes meaningful from the second run of the same niche or channel onward.',
      ]);
      return;
    }

    const lines = [`Compared against ${runsCompared} earlier run(s) of this subject.`, ''];
    gaps.forEach((g, i) => {
      const r = g.recurrence ?? {};
      const label =
        r.status === 'recurring'
          ? `RECURRING — seen in ${r.timesSeen} runs, first on ${(r.firstSeen ?? '').slice(0, 10)}${r.trend ? `, demand ${r.trend}` : ''}`
          : 'NEW this run';
      lines.push(`  Gap ${i + 1}: ${label}`);
      lines.push(`    "${truncate(g.question, 110)}"`);
      if (r.previousDemandScore != null) {
        lines.push(`    demand score ${g.demandScore} now vs ${r.previousDemandScore} last time`);
      }
    });

    if (resolved.length) {
      lines.push('', `${resolved.length} gap(s) open in the previous run but absent now -- usually someone finally made the video:`);
      resolved.forEach((r) => lines.push(`  - "${truncate(r.question, 110)}" (last seen ${(r.lastSeen ?? '').slice(0, 10)}, score ${r.previousDemandScore})`));
    }

    this.section('RECURRENCE — comparison against earlier runs', lines);
  }

  /**
   * Objections that survived citation grounding. Logged separately from gaps
   * because they answer a different question -- "what is wrong with the videos
   * that exist" rather than "what is missing" -- and because an objection with
   * weak evidence is the one most likely to make a creator change something
   * that was never actually a problem.
   */
  /** Logs how much each output can be trusted, and why the set is the size it is. */
  logEvidence(evidence, shortfall) {
    const lines = Object.entries(evidence).map(([name, e]) => `  ${e.level.padEnd(6)} ${name.padEnd(10)} ${e.why}`);
    lines.push('', `Why the set is the size it is: ${shortfall.detail}`);
    this.section('EVIDENCE — how much each output can be trusted', lines);
  }

  /** Logs every video set aside and why -- the working behind the funnel on the report. */
  logExclusions(ex) {
    const lines = ['Funnel:'];
    ex.funnel.forEach((f) => lines.push(`  ${String(f.count).padStart(5)}  ${f.label}`));
    if (ex.language) {
      lines.push('', `Language "${ex.language.requested}": ${ex.language.confirmed} confirmed, ${ex.language.excluded} excluded as a different language, ${ex.language.undecided} undecided (kept: unknown is not no)${ex.language.applied ? '' : ' -- filter NOT applied, it would have removed every video'}.`);
    }
    if (!ex.integrity) lines.push('', '  ⚠ The counts above do not add up (found != scored + excluded). Treat this funnel with suspicion.');
    for (const r of ex.byReason) {
      lines.push('', `${r.kind === 'excluded' ? 'LEFT OUT' : 'NOT READ'} -- ${r.label}: ${r.count}`);
    }
    const listed = ex.items.filter((i) => i.code !== 'not-comment-read');
    if (listed.length) {
      lines.push('', 'Each video, with its reason:');
      listed.forEach((i) => lines.push(`  [${i.code}] ${i.views != null ? `${i.views.toLocaleString()} views  ` : ''}${truncate(i.channelTitle, 28)} -- ${truncate(i.title || i.videoId, 80)}${i.detail ? `  (${i.detail})` : ''}`));
    }
    const unread = ex.byReason.find((r) => r.code === 'not-comment-read');
    if (unread) lines.push('', `(${unread.count} further videos were scored but outside the top videos whose comments are read; not listed one by one.)`);
    this.section('EXCLUDED — why each video was left out', lines);
  }

  /** Logs the channel-median outlier pass: what was measured, what was too thin to, and the shared formulas. */
  logOutliers(summary, videos) {
    if (!summary) {
      this.section('OUTLIERS — views vs. each channel\'s own median', ['Not measured (disabled, channel mode, or the baseline fetch failed -- see warnings).']);
      return;
    }
    const lines = [
      `${summary.measured} videos across ${summary.channelsMeasured} channels had a usable baseline (>= 4 same-format uploads); ${summary.outliers} beat their channel median by ${summary.threshold}x or more.`,
      '',
    ];
    videos
      .filter((v) => v.outlier?.multiple >= summary.threshold)
      .sort((a, b) => b.outlier.multiple - a.outlier.multiple)
      .slice(0, 10)
      .forEach((v) => {
        lines.push(`  ${v.outlier.multiple}x  ${v.views.toLocaleString()} vs ${v.outlier.median.toLocaleString()} median  [${v.formula?.name ?? 'Unclassified'}]`);
        lines.push(`      ${v.channelTitle} -- ${truncate(v.title, 90)}`);
      });
    if (summary.topFormulas.length) {
      lines.push('', 'Title formulas among the outliers (a judgement about the wording, not why it worked):');
      summary.topFormulas.forEach((f) => lines.push(`  ${f.count}x  ${f.name}`));
    }
    if (summary.thinChannels.length) {
      lines.push('', `Skipped (fewer than 4 same-format uploads to take a median from): ${summary.thinChannels.slice(0, 8).join(', ')}`);
    }
    this.section('OUTLIERS — views vs. each channel\'s own median', lines);
  }

  logObjections(objections) {
    if (!objections.length) {
      this.section('OBJECTIONS — complaints about existing videos', [
        'No complaint was voiced by at least 2 distinct comments, so none are reported.',
      ]);
      return;
    }
    const lines = [`${objections.length} objection(s) survived citation grounding:`, ''];
    objections.forEach((o, i) => {
      lines.push(`  ${i + 1}. [${o.severity}] "${o.label}"`);
      lines.push(`     ${truncate(o.detail, 160)}`);
      if (o.fix) lines.push(`     fix: ${truncate(o.fix, 140)}`);
      lines.push(`     evidence (${o.evidenceCount} comments, ${o.distinctVideos} videos):`);
      o.evidence.slice(0, 3).forEach((e) => lines.push(`       - (♥${e.likes}) "${truncate(e.text, 120)}"`));
      lines.push('');
    });
    this.section('OBJECTIONS — complaints about existing videos', lines);
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
      `Gapstronaut — analysis audit log`,
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

/**
 * Deletes run logs older than `cutoffMs`, and their index lines. A log quotes
 * video titles and comments, so it falls under the same 30-day limit as a report.
 */
export function sweepLogs(cutoffMs) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(RUNS_DIR)) {
      const p = path.join(RUNS_DIR, f);
      try {
        if (fs.statSync(p).mtimeMs < cutoffMs) { fs.unlinkSync(p); n += 1; }
      } catch { /* raced with another delete */ }
    }
    const lines = fs.readFileSync(INDEX_FILE, 'utf8').split('\n').filter(Boolean);
    const keep = lines.filter((l) => {
      try { return !(new Date(JSON.parse(l).startedAt).getTime() < cutoffMs); } catch { return false; }
    });
    if (keep.length !== lines.length) fs.writeFileSync(INDEX_FILE, keep.map((l) => `${l}\n`).join(''));
  } catch { /* no logs yet */ }
  return n;
}

export function logDir() {
  return LOG_DIR;
}
