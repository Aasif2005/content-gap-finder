import { chatJSON } from './deepseek.js';
import { config } from '../config.js';

// Real bug this fixes: a plain .slice(0, n) cuts by UTF-16 code unit, not by
// character -- an emoji (a surrogate pair, 2 code units) landing exactly on
// the cut leaves one unpaired surrogate dangling at the end. JSON.stringify
// happily emits that as a literal `\ud83d`-style escape, which is not valid
// standalone Unicode -- a real "recetas de cocina" run hit this in a comment
// truncated at 240 chars and DeepSeek's own JSON parser rejected the request
// with "unexpected end of hex escape". [...s] iterates by code point instead,
// so a surrogate pair always stays whole.
export const truncate = (s, n) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length > n ? chars.slice(0, n).join('') : t;
};

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
        v.tagOnlyMatch
          ? `  TAG-ONLY: the niche appears only in this video's tags/hashtags, never in its title prose -- check whether it is genuinely about the niche`
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
- The niche subject must actually BE in the video. Creators farm views by
  stuffing a popular name into tags on content about someone else -- exclude
  those entirely, even at the top view count. Videos marked TAG-ONLY matched
  the niche only via tags, not title prose: before excluding one, check the
  OTHER videos in this set for corroboration (a family member, associate,
  party/brand name recurring elsewhere) -- do not exclude on the TAG-ONLY flag
  alone if the batch itself ties the video to the niche.
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

// Channel mode changes what the question IS, so it gets its own framing rather
// than the niche prompt with a different noun substituted in. The tag-hijack
// rules are dropped entirely: every video provably belongs to this channel, so
// "is this really about the subject" cannot arise, and leaving the rule in would
// invite the model to exclude legitimate videos for failing a test that no
// longer applies.
const CLUSTER_SYSTEM_CHANNEL = `You are a YouTube content strategist analysing ONE channel's own recent uploads.
You group its videos into meaningful sub-topics and judge which of its angles are working.
You only ever reply with a single valid json object. No prose, no markdown fences.

Rules:
- Cluster by CONTENT ANGLE, not by surface keyword.
- Every video here belongs to this channel. Do not question whether a video
  belongs to the subject -- it does. Judge only what each one is ABOUT.
- Every video_id you emit MUST come from the provided list. Never invent ids.
- video_ids are for the "video_ids" fields ONLY. In prose fields (why_hot, reason,
  counter_evidence, summary) refer to videos by title -- a raw id like
  "trvTFIDUtU8" means nothing to a creator reading the report.
- A topic needs at least 2 videos unless a single video is a clear standalone breakout.
- Labels are 3-6 words, specific enough that a creator knows what to film.
- why_hot must cite concrete evidence from the data (view counts, recency,
  engagement), not generic marketing language. Note that every video shares one
  channel, so channel size is constant and cannot explain a difference between them.
- For "avoid": prefer angles built around videos marked FLAG -- those are
  independently confirmed by our own engagement stats as high-reach but
  low-response. Quote the counter-evidence. If nothing qualifies, return [].`;

export async function clusterTopics({ niche, window, videos, channelMode = false, onProgress }) {
  onProgress?.('clustering', `Clustering ${videos.length} videos into topics`, 55);

  const heading = channelMode
    ? `Channel: "${niche}" -- these are the channel's OWN uploads. Time window: ${window}. ${videos.length} videos.`
    : `Niche: "${niche}". Time window: ${window}. ${videos.length} videos.`;

  const user = `${heading}

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

  const { data, usage } = await chatJSON({ system: channelMode ? CLUSTER_SYSTEM_CHANNEL : CLUSTER_SYSTEM, user });
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
- A question can be a real gap, but tell apart WHICH question. ACCEPT a question
  about the REAL-WORLD subject the niche is about, when no existing video
  actually explains it ("why did he cry at that event", "why was he hospitalized",
  "what actually happened there") -- that is a filmable explainer, exactly the
  kind of gap this task exists to find. REJECT a question that is only about a
  specific EXISTING video's own footage or dialogue ("which movie did he mean in
  that speech", "who was that line directed at", "was that ever answered in the
  video") -- satisfying it means re-explaining a video that already exists, not
  filming something new. Also REJECT rhetorical political or personal debate
  between commenters with no informational question at all ("what has this
  politician actually done", "whose fault is this") -- that is commenters arguing
  with each other, not the audience asking the creator for anything.
- A gap is demand for MORE content about the niche, not a request to abandon
  it. Comments telling the channel to stop covering the niche and cover an
  unrelated subject instead (world news, a different person, an unrelated
  topic) are audience fatigue, not a content gap -- reject them.
- explanation and suggested_title must follow ONLY from what the cited
  comments actually say. Never invent a premise or connect two separate
  comments into a claim neither one makes.
- demand_strength: "high" only when many independent comments converge on it.
- Separately from gaps, collect OBJECTIONS: recurring complaints about the
  EXISTING videos themselves rather than requests for new subjects. Pacing,
  length, audio, sponsor segments, clickbait titles that the video does not
  deliver on, missing timestamps, unexplained jargon, a thumbnail that
  oversold it. Same evidence discipline as gaps: multiple distinct comments,
  real [cN] citations, nothing generic. An objection is an execution note a
  creator can act on next time, not a subject to film.
- "fix" on an objection must be a concrete thing to do differently, drawn only
  from what the cited comments complain about.`;

// In channel mode the "abandon the niche" rule inverts. On a niche search, a
// comment asking the channel to cover something unrelated is audience fatigue
// and not a content gap. On a creator's OWN channel, that exact comment is the
// single most valuable thing in the dataset -- it is their own subscribers
// telling them what to make next. Keeping the niche rule here would throw away
// the best signal channel mode exists to find.
const GAP_SYSTEM_CHANNEL = `You find UNMET AUDIENCE DEMAND in the comments on ONE channel's videos:
things that channel's own viewers repeatedly ask for and have not been given.
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
- A question can be a real gap, but tell apart WHICH question. ACCEPT a question
  about the channel's REAL-WORLD subject matter, when no existing video actually
  covers it ("why did this happen", "what's the story behind X") -- that is a
  filmable explainer, exactly the kind of gap this task exists to find. REJECT a
  question that is only about a specific EXISTING video's own footage or
  dialogue ("which one did you mean", "was that ever answered in the video") --
  satisfying it means re-explaining a video that already exists, not filming
  something new. Also REJECT rhetorical debate between commenters with no
  informational question at all -- that is commenters arguing with each other,
  not the audience asking the creator for anything.
- These are the channel's OWN subscribers. A request for a subject the channel
  has not covered before is a genuine, valuable gap -- NOT audience fatigue and
  NOT off-topic. Report it. Only reject requests that no creator could act on
  (abuse, spam, demands about other channels' behaviour).
- explanation and suggested_title must follow ONLY from what the cited
  comments actually say. Never invent a premise or connect two separate
  comments into a claim neither one makes.
- demand_strength: "high" only when many independent comments converge on it.
- Separately from gaps, collect OBJECTIONS: recurring complaints about the
  EXISTING videos themselves rather than requests for new subjects. Pacing,
  length, audio, sponsor segments, clickbait titles that the video does not
  deliver on, missing timestamps, unexplained jargon, a thumbnail that
  oversold it. Same evidence discipline as gaps: multiple distinct comments,
  real [cN] citations, nothing generic. An objection is an execution note a
  creator can act on next time, not a subject to film.
- "fix" on an objection must be a concrete thing to do differently, drawn only
  from what the cited comments complain about.`;

export async function mineGaps({ niche, window, videos, comments, topics, gapMode, channelMode = false, onProgress }) {
  onProgress?.('gaps', `Mining ${comments.length} comments for unmet demand`, 78);
  if (!comments.length) return { gaps: [], objections: [], usage: null };

  const commentBlock = comments
    .map((c) => `[c${c.index}] (video ${c.videoId}, ${c.likes} likes${c.isReply ? ', reply' : ''}) ${truncate(c.text, 240)}`)
    .join('\n');

  const coverageRule =
    gapMode === 'strict'
      ? 'Only report gaps with coverage "none". Discard anything already covered, even weakly.'
      : 'Report gaps with coverage "none" or "weak".';

  const user = `${channelMode ? `Channel: "${niche}" -- its own uploads and its own viewers' comments.` : `Niche: "${niche}".`} Time window: ${window}.

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
  ],
  "objections": [
    {
      "label": "3-6 words naming the complaint",
      "detail": "what viewers are actually objecting to",
      "severity": "high" | "medium" | "low",
      "evidence_comment_indexes": [8, 21],
      "fix": "the concrete thing to do differently next time"
    }
  ]
}

Order gaps by strength of demand and objections by severity. Return at most 10
gaps and at most 6 objections. Quality over quantity -- an empty list is better
than a list of vague filler.`;

  const { data, usage } = await chatJSON({ system: channelMode ? GAP_SYSTEM_CHANNEL : GAP_SYSTEM, user });
  return { gaps: data.gaps ?? [], objections: data.objections ?? [], usage };
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

/**
 * Same citation grounding as groundGaps, for objections.
 *
 * Objections come from the same LLM call and the same comment payload as gaps --
 * which is why they cost almost nothing to add -- but they need the identical
 * discipline applied to them: an ungrounded complaint is exactly as misleading
 * as an ungrounded gap, and a creator changing how they edit on the strength of
 * a complaint nobody actually made is a worse outcome than showing no objections
 * at all.
 */
export function groundObjections(objections, comments) {
  const byIndex = new Map(comments.map((c) => [c.index, c]));
  const severityRank = { high: 3, medium: 2, low: 1 };

  return (objections ?? [])
    .map((o) => {
      const evidence = (o.evidence_comment_indexes ?? [])
        .map(parseCommentIndex)
        .filter((i) => i !== null)
        .map((i) => byIndex.get(i))
        .filter(Boolean)
        .map((c) => ({ videoId: c.videoId, text: c.text, likes: c.likes, replyCount: c.replyCount }));

      return {
        label: o.label ?? '',
        detail: o.detail ?? '',
        severity: o.severity ?? 'medium',
        fix: o.fix ?? '',
        evidence,
        evidenceCount: evidence.length,
        distinctVideos: new Set(evidence.map((e) => e.videoId)).size,
      };
    })
    // Two independent complaints is the floor for calling something a pattern
    // rather than one viewer's opinion -- the same bar groundGaps applies.
    .filter((o) => o.label && o.evidenceCount >= 2)
    .sort((a, b) => (severityRank[b.severity] ?? 2) - (severityRank[a.severity] ?? 2) || b.evidenceCount - a.evidenceCount);
}
