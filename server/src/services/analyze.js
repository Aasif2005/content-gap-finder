import { chatJSON } from './deepseek.js';
import { config } from '../config.js';

const truncate = (s, n) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// YouTube descriptions are mostly links, timestamps, socials and affiliate spam.
// Stripping that keeps the prompt focused on what the video is actually about.
const stripNoise = (s) =>
  (s ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s.*$/gm, '')
    .replace(/[#@]\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

/** Heat tier drives the "covered, but only weakly" judgement in gap mining. */
export function heatTier(video, ranked) {
  const idx = ranked.findIndex((v) => v.videoId === video.videoId);
  const pct = ranked.length <= 1 ? 0 : idx / (ranked.length - 1);
  return pct <= 0.25 ? 'high' : pct <= 0.6 ? 'mid' : 'low';
}

function videoDigest(videos) {
  return videos
    .map((v) =>
      [
        `[${v.videoId}] tier=${v.tier} heat=${v.heat}`,
        `  title: ${truncate(v.title, 140)}`,
        `  channel: ${truncate(v.channelTitle, 40)} (${compact(v.signals.subscribers)} subs)`,
        `  format: ${v.isShort ? 'Short' : 'long-form'} ${Math.round(v.durationSeconds)}s`,
        `  stats: ${compact(v.views)} views, ${compact(v.likes)} likes, ${compact(v.comments)} comments, ${v.signals.ageDays.toFixed(1)}d old`,
        v.lowEngagementOutlier
          ? `  FLAG: high views but bottom-tier engagement (${(v.signals.engagementRate * 100).toFixed(2)}%) -- strong avoid candidate`
          : null,
        v.tags.length ? `  tags: ${truncate(v.tags.slice(0, 8).join(', '), 120)}` : null,
        v.description ? `  desc: ${truncate(stripNoise(v.description), 160)}` : null,
      ].filter(Boolean).join('\n')
    )
    .join('\n\n');
}

// --- Pass A: topic clustering + avoid list ---------------------------------

const CLUSTER_SYSTEM = `You are a YouTube content strategist analysing a set of videos from one niche.
You group videos into meaningful sub-topics and judge which angles are working.
You only ever reply with a single valid json object. No prose, no markdown fences.

Rules:
- Cluster by CONTENT ANGLE, not by surface keyword. "iPhone 17 camera test" and
  "Pixel 10 camera shootout" belong to one "flagship camera comparisons" topic.
- Every video_id you emit MUST come from the provided list. Never invent ids.
- video_ids are for the "video_ids" fields ONLY. In prose fields (why_hot, reason,
  counter_evidence, summary) refer to videos by channel name or title -- a raw id
  like "trvTFIDUtU8" means nothing to a creator reading the report.
- A topic needs at least 2 videos unless a single video is a clear standalone breakout.
- Labels are 3-6 words, specific enough that a creator knows what to film.
- why_hot must cite concrete evidence from the data (view counts, channel size,
  recency, engagement), not generic marketing language.
- For "avoid": prefer angles built around videos marked FLAG -- those are
  independently confirmed by our own engagement stats as high-reach but
  low-response. You may also flag angles where many videos all underperform.
  Quote the counter-evidence. If nothing qualifies, return [].`;

export async function clusterTopics({ niche, window, videos, onProgress }) {
  onProgress?.('clustering', `Clustering ${videos.length} videos into topics`, 55);

  const user = `Niche: "${niche}". Time window: last ${window}. ${videos.length} videos.

Each video is tagged with a heat tier (high/mid/low) computed from view velocity,
views-per-subscriber, and engagement rate. Heat is relative to this result set only.

${videoDigest(videos)}

Return json with exactly this shape:
{
  "topics": [
    {
      "label": "3-6 word topic name",
      "summary": "one sentence describing what these videos actually do",
      "video_ids": ["id", "id"],
      "why_hot": "one or two sentences citing specific numbers from the data",
      "suggested_angles": ["a specific video idea", "another specific video idea"]
    }
  ],
  "avoid": [
    {
      "label": "3-6 word angle name",
      "video_ids": ["id"],
      "reason": "why a creator should not make this right now",
      "counter_evidence": "the specific numbers that justify the warning"
    }
  ]
}

Order topics by how strongly the data supports them. Return at most 8 topics,
at most 3 suggested_angles each, and at most 4 avoid entries. Keep every string
under 300 characters.`;

  const { data, usage } = await chatJSON({ system: CLUSTER_SYSTEM, user });
  return { topics: data.topics ?? [], avoid: data.avoid ?? [], usage };
}

// --- Comment selection ------------------------------------------------------

// Comments that read like unmet demand. Cheap pre-filter: it cuts token spend a
// long way and raises signal, while a like-sorted sample of everything else is
// still included so the model can see general sentiment.
const DEMAND_RE = /\?|anyone (know|have|made)|how (do|does|can|to)\b|can (someone|anyone|you)|please (make|do|cover)|tutorial on|wish (someone|there)|no ?one (talks|covers|explains|mentions)|where (can|do) i|what about|need a (video|guide)|would love (a|to see)|missing|couldn'?t find|still confused|doesn'?t (work|explain)|part ?2/i;

/**
 * @param ownerByVideo  videoId -> channelId, so the uploader's own comments and
 *   replies can be excluded. A creator answering "recipe in the description!"
 *   is not audience demand, but it matches every demand pattern we look for.
 */
export function selectComments(commentsByVideo, { maxTotal = 500, perVideoSentiment = 5, ownerByVideo = {} } = {}) {
  const picked = [];

  for (const [videoId, allComments] of Object.entries(commentsByVideo)) {
    const owner = ownerByVideo[videoId];
    const comments = allComments.filter((c) => !owner || c.authorChannelId !== owner);
    const scored = comments.map((c) => ({
      videoId,
      text: c.text,
      likes: c.likes,
      replyCount: c.replyCount,
      isDemand: DEMAND_RE.test(c.text),
      // A heavily-replied comment is usually a discussion thread worth reading.
      weight: Math.log10(1 + c.likes) + 0.5 * Math.log10(1 + c.replyCount),
    }));

    const demand = scored.filter((c) => c.isDemand);
    const rest = scored.filter((c) => !c.isDemand).sort((a, b) => b.weight - a.weight).slice(0, perVideoSentiment);
    picked.push(...demand, ...rest);

    // Replies often contain the actual unanswered follow-up ("same question here").
    for (const c of comments) {
      for (const r of c.replies ?? []) {
        if (owner && r.authorChannelId === owner) continue; // creator's answer, not a request
        if (DEMAND_RE.test(r.text)) {
          picked.push({ videoId, text: r.text, likes: r.likes, replyCount: 0, isDemand: true, weight: Math.log10(1 + r.likes), isReply: true });
        }
      }
    }
  }

  // Demand-shaped comments win ties; within a class, more likes wins.
  return picked
    .sort((a, b) => (b.isDemand - a.isDemand) || (b.weight - a.weight))
    .slice(0, maxTotal)
    .map((c, i) => ({ ...c, index: i }));
}

// --- Pass B: gap mining -----------------------------------------------------

const GAP_SYSTEM = `You find UNMET AUDIENCE DEMAND in YouTube comments: things viewers
repeatedly ask for that the existing videos do not adequately deliver.
You only ever reply with a single valid json object. No prose, no markdown fences.

Rules:
- A gap must be supported by MULTIPLE distinct comments, ideally across videos.
  One person asking something is noise, not a gap.
- Ground every gap in real comments by citing their [cN] index numbers. Never
  invent a comment index and never paraphrase a quote into the index field.
- Judge coverage against the video list you are given:
    "none" = no video in the set addresses this at all
    "weak" = only mid/low-heat videos address it, so demand is not being met well
  Do NOT report a gap that a high-heat video already answers well.
- Reject generic filler ("more content please", "great video"). A gap must be a
  specific, filmable subject.
- demand_strength: "high" only when many independent comments converge on it.`;

export async function mineGaps({ niche, window, videos, comments, topics, gapMode, onProgress }) {
  onProgress?.('gaps', `Mining ${comments.length} comments for unmet demand`, 78);
  if (!comments.length) return { gaps: [], usage: null };

  const commentBlock = comments
    .map((c) => `[c${c.index}] (video ${c.videoId}, ${c.likes} likes${c.isReply ? ', reply' : ''}) ${truncate(c.text, 240)}`)
    .join('\n');

  const coverageRule =
    gapMode === 'strict'
      ? 'Only report gaps with coverage "none". Discard anything already covered, even weakly.'
      : 'Report gaps with coverage "none" or "weak".';

  const user = `Niche: "${niche}". Time window: last ${window}.

EXISTING VIDEOS (what the audience already has access to, with heat tier):
${videos.map((v) => `[${v.videoId}] tier=${v.tier} | ${truncate(v.title, 130)}`).join('\n')}

TOPICS ALREADY COVERED BY THESE VIDEOS:
${topics.map((t) => `- ${t.label}: ${t.summary ?? ''}`).join('\n') || '(none identified)'}

COMMENTS (${comments.length} of them, indexed):
${commentBlock}

${coverageRule}

Return json with exactly this shape:
{
  "gaps": [
    {
      "question": "the request phrased the way the audience actually asks it",
      "explanation": "what the audience wants and why the current videos miss it",
      "coverage": "none" | "weak",
      "covering_video_ids": ["ids that partly cover it, [] if none"],
      "demand_strength": "high" | "medium" | "low",
      "evidence_comment_indexes": [3, 17, 42],
      "suggested_title": "a video title a creator could film to fill this gap",
      "suggested_format": "Short" | "long-form"
    }
  ]
}

Order by strength of demand. Return at most 10 gaps. Quality over quantity --
an empty list is better than a list of vague filler.`;

  const { data, usage } = await chatJSON({ system: GAP_SYSTEM, user });
  return { gaps: data.gaps ?? [], usage };
}

/**
 * Resolves the model's comment indexes back to real comments and scores demand
 * from actual like counts. Anything the model cited that doesn't resolve is
 * dropped, so a fabricated citation can't reach the UI.
 */
/**
 * Models cite comments inconsistently: deepseek-flash returns 3, deepseek-v4-pro
 * returns "c3", and either may return "3". Normalize all three to a number so a
 * model swap can't silently empty the evidence (and therefore the gap list).
 */
export function parseCommentIndex(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const m = /^\s*c?(\d+)\s*$/i.exec(String(raw ?? ''));
  return m ? Number(m[1]) : null;
}

export function groundGaps(gaps, comments) {
  const byIndex = new Map(comments.map((c) => [c.index, c]));
  const strengthWeight = { high: 1.3, medium: 1.0, low: 0.75 };
  const coverageWeight = { none: 1.25, weak: 1.0 };

  return gaps
    .map((gap) => {
      const evidence = (gap.evidence_comment_indexes ?? [])
        .map(parseCommentIndex)
        .filter((i) => i !== null)
        .map((i) => byIndex.get(i))
        .filter(Boolean)
        .map((c) => ({ videoId: c.videoId, text: c.text, likes: c.likes, replyCount: c.replyCount }));

      const distinctVideos = new Set(evidence.map((e) => e.videoId)).size;
      const likeMass = evidence.reduce((a, e) => a + Math.log10(1 + e.likes), 0);

      // Demand = how many people asked, across how many audiences, how loudly.
      const raw =
        (evidence.length * 1.0 + distinctVideos * 1.5 + likeMass * 1.2) *
        (strengthWeight[gap.demand_strength] ?? 1) *
        (coverageWeight[gap.coverage] ?? 1);

      return {
        question: gap.question,
        explanation: gap.explanation ?? '',
        coverage: gap.coverage ?? 'weak',
        coveringVideoIds: gap.covering_video_ids ?? [],
        demandStrength: gap.demand_strength ?? 'medium',
        suggestedTitle: gap.suggested_title ?? '',
        suggestedFormat: gap.suggested_format ?? '',
        evidence,
        evidenceCount: evidence.length,
        distinctVideos,
        demandScore: Math.round(raw * 10) / 10,
      };
    })
    // A "gap" nobody actually voiced is the failure mode we most want to avoid
    // shipping to a creator, so require at least two resolvable comments.
    .filter((g) => g.evidenceCount >= 2)
    .sort((a, b) => b.demandScore - a.demandScore);
}
