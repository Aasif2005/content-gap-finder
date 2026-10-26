/**
 * Turning a report into something a creator can actually work from.
 *
 * The step after reading a gap is putting it in a content calendar, a Notion
 * board, or a script doc -- and until this existed that meant retyping it out
 * of the browser. Markdown is the default because it pastes into every one of
 * those with its structure intact; CSV exists for spreadsheet planning.
 *
 * Evidence comments are included, not just the model's summary. A gap's
 * credibility lives in what viewers literally said, so an export that drops
 * the quotes exports the conclusion without the reason for it.
 */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote anything that could break a row, and double up embedded quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// YouTube's API policies follow the data out of the app: an export still says
// where the numbers came from, when, and which ones are ours, not YouTube's.
export const SOURCE_NOTE = 'Data from YouTube API Services. Gapstronaut is not affiliated with or endorsed by YouTube.';
export const DERIVED_EXPORT_NOTE = 'Heat, demand score, engagement rate, title score and channel-median multiples are calculated by Gapstronaut from YouTube data; they are not YouTube metrics.';
const dataDate = (result) => {
  const d = new Date(result?.generatedAt);
  return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
const asOf = (result) => (dataDate(result) ? `YouTube data as of ${dataDate(result)}` : 'YouTube data');
// CSV stays one record per row, so a spreadsheet import never trips on footer
// lines: the provenance rides along as two trailing columns instead.
const CSV_SOURCE = 'YouTube API Services; scores calculated by Gapstronaut, not YouTube metrics';
const withSource = (result, rows) => rows.map((r, i) => (i === 0 ? [...r, 'data_as_of', 'source'] : [...r, dataDate(result), CSV_SOURCE]));
const watchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
const quoteSource = (e) => (e.videoId ? ` ([video](${watchUrl(e.videoId)}))` : '');

export function gapsToCsv(result) {
  const rows = [[
    'question', 'demand_strength', 'coverage', 'demand_score', 'evidence_comments',
    'distinct_videos', 'suggested_title', 'title_score', 'thumbnail_text', 'suggested_format', 'recurrence', 'times_seen',
    'first_seen', 'niche_relevant', 'top_evidence',
  ]];
  for (const g of result.gaps ?? []) {
    rows.push([
      g.question,
      g.demandStrength,
      g.coverage,
      g.demandScore,
      g.evidenceCount,
      g.distinctVideos,
      g.suggestedTitle,
      g.titleLint?.score ?? '',
      g.thumbnailText ?? '',
      g.suggestedFormat,
      // "unknown" means there was nothing to compare against: say n/a, not blank.
      g.recurrence?.status ?? 'n/a',
      g.recurrence?.status && g.recurrence.status !== 'unknown' ? g.recurrence.timesSeen : 'n/a',
      g.recurrence?.firstSeen ?? 'n/a',
      g.nicheRelevant === false ? 'FLAGGED' : 'ok',
      (g.evidence ?? []).slice(0, 3).map((e) => e.text).join(' | '),
    ]);
  }
  return csv(withSource(result, rows));
}

export function topicsToCsv(result) {
  const rows = [['topic', 'heat_score', 'videos', 'channels', 'total_views', 'median_engagement_rate', 'summary', 'why_hot', 'suggested_angles', 'niche_relevant']];
  for (const t of result.topics ?? []) {
    rows.push([
      t.label, t.heatScore, t.videos.length, t.breadth, t.totalViews,
      t.medianEngagementRate, t.summary, t.whyHot,
      (t.suggestedAngles ?? []).join(' | '),
      t.nicheRelevant === false ? 'FLAGGED' : 'ok',
    ]);
  }
  return csv(withSource(result, rows));
}

// The labels the form shows, not the raw values ("format: long", "gaps: strict").
const FORMAT_LABEL = { both: 'Shorts + long-form', shorts: 'Shorts', long: 'Long-form' };
const GAP_MODE_LABEL = { inclusive: 'uncovered + weakly covered', strict: 'uncovered only' };
const AVOID_LABEL = { confirmed: 'stats confirm', partly: 'stats partly agree', 'model-only': 'model signal only', contradicted: 'our numbers disagree' };
const likes = (e) => (Number.isFinite(e.likes) ? ` — ♥ ${e.likes}` : '');

export function reportToMarkdown(result) {
  const q = result.query;
  const filters = [
    `window: ${q.window === 'custom' ? `since ${(q.customAfter ?? '').slice(0, 10)}` : q.window}`,
    `format: ${FORMAT_LABEL[q.contentType] ?? q.contentType ?? 'Shorts + long-form'}`,
    q.regionCode && `region: ${q.regionCode}`,
    q.relevanceLanguage && `language: ${q.relevanceLanguage}`,
    q.minViews > 0 && `min views: ${q.minViews.toLocaleString()}`,
    `gaps: ${GAP_MODE_LABEL[q.gapMode] ?? q.gapMode ?? GAP_MODE_LABEL.inclusive}`,
    q.deepScan && 'deep scan',
  ].filter(Boolean).join(' · ');

  const out = [
    `# Content gaps — ${q.channelId ? (result.channel?.title ?? 'channel') : q.niche}`,
    '',
    `${filters}`,
    `Analysed ${result.stats.videosAnalyzed} videos and ${result.stats.commentsAnalyzed} comments · ${asOf(result)}`,
  ];

  if (result.thinPool) {
    out.push('', `> **Weak evidence.** Only ${result.thinPool.videos} videos were scored, so the ranking below is close to view order restated.`);
  }

  // Where the videos went, in one line: a reader of an exported report cannot
  // open the funnel, and "7 scored" means something different after a filter
  // removed half of what was found.
  const ex = result.exclusions;
  if (ex?.funnel?.length) {
    const found = ex.funnel[0].count;
    const scored = ex.funnel.find((f) => f.key === 'scored')?.count ?? 0;
    const why = (ex.byReason ?? []).filter((r) => r.kind === 'excluded').map((r) => `${r.count} ${r.label.toLowerCase()}`);
    out.push('', `> ${found} found, ${scored} scored${why.length ? `; left out: ${why.join('; ')}` : ''}.`);
  }
  const lowEvidence = Object.entries(result.evidence ?? {}).filter(([, e]) => e.level === 'small' || e.level === 'thin');
  if (lowEvidence.length) {
    out.push(`> Evidence: ${lowEvidence.map(([k, e]) => `${k} ${e.level}`).join(', ')}.`);
  }

  if (result.warnings?.length) {
    out.push('', '**Notes from this run:**', '', ...result.warnings.map((w) => `- ${w}`));
  }

  if (result.gaps?.length) {
    out.push('', '## Content gaps', '');
    result.gaps.forEach((g, i) => {
      const flags = [
        `${g.demandStrength} demand`,
        g.coverage === 'none' ? 'nobody covers this' : 'weakly covered',
        `score ${g.demandScore}`,
        g.recurrence?.status === 'recurring' && `recurring — seen in ${g.recurrence.timesSeen} runs since ${(g.recurrence.firstSeen ?? '').slice(0, 10)}`,
        g.recurrence?.status === 'new' && 'new this run',
        g.nicheRelevant === false && '⚠ check relevance',
        g.relevance?.verdict === 'niche-videos' && 'asked under niche videos',
      ].filter(Boolean);
      out.push(`### ${i + 1}. ${g.question}`, '', `*${flags.join(' · ')}*`, '');
      if (g.explanation) out.push(g.explanation, '');
      if (g.suggestedTitle) out.push(`**Film this:** ${g.suggestedTitle}${g.suggestedFormat ? ` (${g.suggestedFormat})` : ''}`, '');
      if (g.thumbnailText) out.push(`**Thumbnail text:** ${g.thumbnailText}`, '');
      if (g.titleOptions?.length > 1) out.push('Other titles: ' + g.titleOptions.slice(1).map((o) => `"${o.title}"`).join(' · '), '');
      if (g.evidence?.length) {
        out.push('What viewers actually said:', '');
        g.evidence.slice(0, 4).forEach((e) => out.push(`> "${e.text}"${likes(e)}${quoteSource(e)}`, ''));
      }
    });
  }

  if (result.objections?.length) {
    out.push('', '## Complaints about existing videos', '');
    result.objections.forEach((o, i) => {
      out.push(`### ${i + 1}. ${o.label}`, '', `*${o.severity} severity · ${o.evidenceCount} comments*`, '');
      if (o.fix) out.push(`**Do instead:** ${o.fix}`, '');
      (o.evidence ?? []).slice(0, 3).forEach((e) => out.push(`> "${e.text}"${likes(e)}${quoteSource(e)}`, ''));
    });
  }

  if (result.resolvedGaps?.length) {
    out.push('', '## No longer being asked', '', 'Open in the previous comparable run, absent from this one:', '');
    result.resolvedGaps.forEach((g) => out.push(`- ${g.question} _(last seen ${(g.lastSeen ?? '').slice(0, 10)})_`));
  }

  if (result.topics?.length) {
    out.push('', '## Trending now', '');
    result.topics.forEach((t, i) => {
      out.push(`### ${i + 1}. ${t.label} — heat ${t.heatScore}/100`, '');
      if (t.summary) out.push(t.summary, '');
      if (t.whyHot) out.push(`*Why it's hot:* ${t.whyHot}`, '');
      if (t.suggestedAngles?.length) {
        out.push('Angles to try:', '');
        t.suggestedAngles.forEach((a) => out.push(`- ${a}`));
        out.push('');
      }
    });
  }

  if (result.avoid?.length) {
    out.push('', '## Avoid', '');
    result.avoid.forEach((a, i) => {
      const n = a.videos?.length ?? 0;
      const derived = a.flaggedCount > 0 && a.flaggedCount * 2 >= n ? 'confirmed' : a.flaggedCount > 0 ? 'partly' : 'model-only';
      const level = AVOID_LABEL[a.statsLevel ?? derived];
      out.push(`### ${i + 1}. ${a.label} (${level})`, '', a.reason, '');
      if (a.counterEvidence) out.push(`*The numbers:* ${a.counterEvidence}`, '');
    });
  }

  out.push('', '---', '', `_${asOf(result)}. ${DERIVED_EXPORT_NOTE} ${SOURCE_NOTE}_`);
  return out.join('\n');
}

/** Triggers a download without a server round trip. */
export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and permission; fall back to the
    // old selection trick so export still works over plain http on a LAN.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

/** A filename-safe stem for a report's exports. */
export const exportStem = (result) => {
  const label = result.query.channelId ? (result.channel?.title ?? 'channel') : result.query.niche;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
  return `${slug}-${result.generatedAt.slice(0, 10)}`;
};
