// Cheap, deterministic check on whether the LLM's output actually relates to the
// niche it was asked about. Not a semantic judge -- just keyword overlap -- but
// that's exactly what makes it useful as an audit: it doesn't trust the model's
// own claim of relevance, and it catches the failure mode search.list itself can
// cause (pulling in adjacent content, e.g. a "cast iron restoration" search that
// also surfaces barn-find motorcycle restorations).

export const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'how',
  'what', 'why', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but',
  'all', 'any', 'can', 'will', 'just', 'about', 'into', 'out', 'over', 'a',
  'an', 'of', 'in', 'on', 'to', 'is', 'it', 'be', 'as', 'at', 'or',
]);

// Pure-letter short abbreviations that are meaningful even under 3 characters
// and never stopwords ("EV charging" without this kept only "charging"; "AR
// filters" only "filters"). Unlike the digit-rule below, these can't just be
// let through ordinary substring matching -- a bare "ev" keyword would
// "match" inside "every", "never", "level". matchKeywords() checks these with
// word boundaries instead.
const SHORT_ABBREVIATIONS = new Set(['ai', 'ar', 'vr', 'ev', 'pc', 'tv', 'ui', 'ux', 'os', 'io', 'hr', 'pr']);

/** Splits a niche string into the significant words worth matching on. */
export function nicheKeywords(niche) {
  return [...new Set(
    (niche ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      // Normally 3+ chars, but a short alphanumeric token like "3d", "4k" is
      // never a stopword and is often the niche's most distinctive word --
      // dropping it left "3D printing" with only "printing" as a keyword.
      .filter((w) => w.length > 0 && (w.length >= 3 || /\d/.test(w) || SHORT_ABBREVIATIONS.has(w)) && !STOPWORDS.has(w))
  )];
}

/**
 * Crude English suffix stripping, not a real stemmer -- just enough to stop
 * inflection mismatches from hiding a real match. Real case: niche keyword
 * "printing" (from "3D printing") never matched real audience comments, which
 * almost always said "print" / "prints" / "printed", because plain substring
 * matching only looks one direction (keyword found inside text), and "print"
 * is not a substring of "printing".
 */
export function stem(word) {
  const stripped = word.replace(/(ing|ers|er|ed|es|s)$/, '');
  return stripped.length >= 3 ? stripped : word;
}

/** Which of the niche keywords appear in a blob of text, word or stem. */
function matchKeywords(keywords, text) {
  const lower = (text ?? '').toLowerCase();
  return keywords.filter((k) => {
    // Short abbreviations need a word boundary, not raw substring inclusion --
    // everything else (including hashtag-concatenated forms like
    // "#thalapathyvijay", which have no boundary before "vijay") relies on
    // plain substring matching, so this can't be the default behavior.
    if (SHORT_ABBREVIATIONS.has(k)) return new RegExp(`\\b${k}\\b`).test(lower);
    return lower.includes(k) || lower.includes(stem(k));
  });
}

/** Strips #hashtags so what remains is the title's actual prose. */
export function stripHashtags(text) {
  return (text ?? '').replace(/#[\w\u00C0-\uFFFF]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tag hijacking: a video whose niche keyword appears ONLY in its hashtags or
 * tag list, never in the title's prose. Real example from a "thalapathy vijay"
 * run -- a Mamitha Baiju dance edit titled "Female Version Leaked😈 #mamithabaiju
 * #vijay #shorts #viral" that also stuffed "thalapathy"/"vijay metro" into its
 * tags, and pulled 12.4M views into the results.
 *
 * This is a signal to eyeball, NOT a verdict. Legitimate videos do this too
 * ("TN CM #vijaythalapathy Son #jasonsanjay Entry at Sigma" is genuinely about
 * Vijay, and its prose also omits the name), which is why nothing is dropped on
 * the strength of it -- the LLM makes the semantic call, this just flags it.
 */
export function checkTagHijack(niche, video) {
  const keywords = nicheKeywords(niche);
  if (!keywords.length) return { suspect: false, inProse: [], inTagsOnly: [] };

  const prose = `${stripHashtags(video.title)} ${video.channelTitle ?? ''} ${stripHashtags(video.description ?? '')}`;
  const tagText = `${video.title ?? ''} ${(video.tags ?? []).join(' ')}`;

  const inProse = matchKeywords(keywords, prose);
  const inTags = matchKeywords(keywords, tagText);
  const inTagsOnly = inTags.filter((k) => !inProse.includes(k));

  return {
    // Matched the niche, but only through tag/hashtag decoration.
    suspect: inProse.length === 0 && inTags.length > 0,
    inProse,
    inTagsOnly,
  };
}

/**
 * Checks a topic's own text (label/summary/why_hot) AND its member videos'
 * titles/tags against the niche. A topic can be legitimate even if its own
 * label doesn't repeat the niche word-for-word ("Electrolysis tank demos" for
 * niche "cast iron restoration"), so we also credit relevance found in the
 * videos backing it -- that is the actual evidence for the topic.
 */
export function checkTopicRelevance(niche, topic) {
  const keywords = nicheKeywords(niche);
  if (!keywords.length) return { relevant: true, matchedIn: 'label', matched: [], score: 1 };

  const ownText = `${topic.label} ${topic.summary ?? ''} ${topic.whyHot ?? ''}`;
  const videoText = (topic.videos ?? [])
    .map((v) => `${v.title} ${v.channelTitle}`)
    .join(' ');

  const inOwnText = matchKeywords(keywords, ownText);
  const inVideos = matchKeywords(keywords, videoText);
  const matched = [...new Set([...inOwnText, ...inVideos])];

  // A topic is tag-suspect when every video backing it only matched via tags.
  const videos = topic.videos ?? [];
  const hijacks = videos.map((v) => checkTagHijack(niche, v));
  const tagSuspect = videos.length > 0 && hijacks.every((h) => h.suspect);

  return {
    relevant: matched.length > 0,
    matchedIn: inOwnText.length ? 'label/summary' : inVideos.length ? 'videos only' : 'none',
    matched,
    score: Math.round((matched.length / keywords.length) * 100) / 100,
    tagSuspect,
    tagSuspectCount: hijacks.filter((h) => h.suspect).length,
  };
}

/** Same idea, applied to a gap's question/explanation/evidence quotes. */
export function checkGapRelevance(niche, gap) {
  const keywords = nicheKeywords(niche);
  if (!keywords.length) return { relevant: true, matched: [], score: 1 };

  // gap.explanation is deliberately excluded. It's the model's own framing
  // prose, not grounded audience demand, and it can name the niche while
  // describing which video the comments sit under even when the comments
  // themselves have nothing to do with it. Real case: 3 comments asking a
  // Vijay channel to stop covering Vijay and do geopolitics instead --
  // explanation said "the Vijay-VJS controversy video", which let a gap with
  // zero actual niche content pass as relevant. question and evidence are
  // what real viewers actually said; only those count as evidence here.
  const text = [gap.question, ...(gap.evidence ?? []).map((e) => e.text)].join(' ');

  const matched = matchKeywords(keywords, text);
  return {
    relevant: matched.length > 0,
    matched,
    score: Math.round((matched.length / keywords.length) * 100) / 100,
  };
}

/**
 * Videos worth distrusting for gap mining: tag-hijacked AND never confirmed
 * relevant by the clustering pass (i.e. not backing any topic or avoid entry).
 *
 * Real bug this fixes: a "SOORI AS HERO #thalapathyvijay" Short is about a
 * different actor entirely, tag-stuffed to farm two audiences. Clustering
 * correctly excluded it from every topic -- but gap mining pulled its
 * comments anyway (comment-fetching runs by heat score alone, upstream of any
 * relevance check) and turned "Garudan than first" / "Mandaadi vs Garudan"
 * into a "content gap" for a niche those comments have nothing to do with.
 *
 * Clustering already has full-batch context and corroboration reasoning this
 * function doesn't -- reuse its verdict rather than re-deciding relevance.
 */
export function untrustedVideoIds(rankedVideos, confirmedRelevantIds) {
  return new Set(
    rankedVideos.filter((v) => v.tagOnlyMatch && !confirmedRelevantIds.has(v.videoId)).map((v) => v.videoId)
  );
}

/** Rolls per-item checks into one summary line for the audit log / API. */
export function summarizeRelevance(items) {
  const total = items.length;
  const relevant = items.filter((i) => i.relevant).length;
  return { total, relevant, flagged: total - relevant, rate: total ? Math.round((relevant / total) * 100) : 100 };
}
