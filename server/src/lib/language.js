// Script-based language detection, used to build a REAL filter where
// YouTube's own relevanceLanguage param on search.list cannot be trusted.
//
// relevanceLanguage is documented as a ranking hint, not a filter -- YouTube's
// own docs say results "in other languages will still be returned if they are
// highly relevant to the query term." Verified empirically: relevanceLanguage
// "ta" (Tamil) against "gym fitness" returned nearly the same channel set as
// no language param at all, and zero of them were actually in Tamil.
//
// For a language with its own distinctive Unicode script, we can check
// directly whether a video's own title/description use that script -- a real,
// deterministic filter instead of trusting YouTube's soft hint. This is
// deliberately not a full language-ID library: several languages share a
// script (Arabic script also covers Urdu and Persian; Cyrillic also covers
// Ukrainian, Bulgarian, Serbian; Han characters also appear in Japanese), so a
// match confirms "the right script family," not the exact language. For
// Latin-script languages (English, Spanish, French, German, Vietnamese,
// Indonesian...) script detection can't distinguish between them at all --
// those languages have no entry here, and the caller falls back to YouTube's
// soft hint with the UI saying so, rather than a filter that doesn't work.
const SCRIPTS = {
  ta: /[஀-௿]/,               // Tamil
  hi: /[ऀ-ॿ]/,               // Devanagari (Hindi, Marathi, Nepali, Sanskrit)
  mr: /[ऀ-ॿ]/,
  ne: /[ऀ-ॿ]/,
  te: /[ఀ-౿]/,               // Telugu
  kn: /[ಀ-೿]/,               // Kannada
  ml: /[ഀ-ൿ]/,               // Malayalam
  bn: /[ঀ-৿]/,               // Bengali
  gu: /[઀-૿]/,               // Gujarati
  pa: /[਀-੿]/,               // Gurmukhi (Punjabi)
  or: /[଀-୿]/,               // Odia
  si: /[඀-෿]/,               // Sinhala
  th: /[฀-๿]/,               // Thai
  lo: /[຀-໿]/,               // Lao
  my: /[က-႟]/,               // Myanmar
  km: /[ក-៿]/,               // Khmer
  ka: /[Ⴀ-ჿ]/,               // Georgian
  hy: /[԰-֏]/,               // Armenian
  am: /[ሀ-፿]/,               // Ethiopic (Amharic)
  he: /[֐-׿]/,               // Hebrew
  el: /[Ͱ-Ͽ]/,               // Greek
  ja: /[぀-ヿ]/,               // Hiragana + Katakana (Japanese-specific)
  ko: /[가-힯ᄀ-ᇿ]/,  // Hangul
  zh: /[一-鿿]/,               // Han -- also matches Japanese Kanji, see caveat above
  ar: /[؀-ۿ]/,               // Arabic script -- also Urdu, Persian
  ur: /[؀-ۿ]/,
  fa: /[؀-ۿ]/,
  ru: /[Ѐ-ӿ]/,               // Cyrillic -- also Ukrainian, Bulgarian, Serbian
  uk: /[Ѐ-ӿ]/,
  bg: /[Ѐ-ӿ]/,
  sr: /[Ѐ-ӿ]/,
};

/** Whether we can build a real script-based filter for this language code. */
export function hasScriptFilter(languageCode) {
  return Boolean(SCRIPTS[(languageCode ?? '').toLowerCase()]);
}

// English names for the languages this module can verify (SCRIPTS + the
// Latin-heuristic set below), used to strengthen the search.list QUERY
// itself, not just filter what comes back. Real case that motivated this:
// niche "ghost story", regionCode=IN, relevanceLanguage=ta returned 50
// candidates of which only 1 was verifiably Tamil -- because the query text
// was still just "ghost story" in English, and relevanceLanguage barely
// nudges search.list's ranking (see the module comment above). Appending
// "Tamil" to the query text moved that from 1/50 to 32/50 verified Tamil,
// confirmed live -- Tamil-audience creators overwhelmingly write "Tamil" into
// an otherwise-English/romanized title or tags for discoverability (the one
// video that DID match unaugmented was literally titled "...Experience in
// Tamil | ..."), so the query itself, not just the post-filter, was the
// bottleneck. Scoped to languages we can also verify afterward, matching the
// project's "don't add a capability without a real signal behind it" rule.
const LANGUAGE_NAMES = {
  ta: 'Tamil', hi: 'Hindi', mr: 'Marathi', ne: 'Nepali', te: 'Telugu', kn: 'Kannada',
  ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia', si: 'Sinhala',
  th: 'Thai', lo: 'Lao', my: 'Burmese', km: 'Khmer', ka: 'Georgian', hy: 'Armenian',
  am: 'Amharic', he: 'Hebrew', el: 'Greek', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', ur: 'Urdu', fa: 'Persian', ru: 'Russian', uk: 'Ukrainian', bg: 'Bulgarian',
  sr: 'Serbian',
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch',
};

/** English name to fold into the search query, or null if we don't model this language at all. */
export function languageQueryHint(languageCode) {
  return LANGUAGE_NAMES[(languageCode ?? '').toLowerCase()] ?? null;
}

/**
 * Does this text contain the target language's script?
 * Returns null (not false) for a language we have no script mapping for --
 * callers must treat that as "cannot judge," never as "does not match."
 */
export function matchesLanguageScript(languageCode, text) {
  const script = SCRIPTS[(languageCode ?? '').toLowerCase()];
  if (!script) return null;
  return script.test(text ?? '');
}

// Latin-script languages all share one alphabet, so script detection (above)
// can't tell them apart at all -- that's why they had no entry in SCRIPTS.
// This is a coarser fallback for the handful most likely to come up as a
// niche filter: common function words (articles, pronouns, conjunctions)
// that show up constantly in real sentences but rarely by accident. It is
// NOT a language-ID library -- some of these words overlap across Romance
// languages ("que" is common to es/fr/pt/it) -- so this only works
// comparatively: which modeled language does the text's word list match best,
// and by how much. A title with too few recognizable words to say anything
// (a Short's hashtag-only caption, the exact failure mode that broke the
// script filter for Tamil) is left undecided rather than guessed at.
const LATIN_STOPWORDS = {
  en: ['the', 'and', 'you', 'with', 'this', 'that', 'your', 'how', 'what', 'are', 'have', 'was', 'from', 'will'],
  es: ['el', 'los', 'las', 'un', 'una', 'es', 'para', 'pero', 'qué', 'cómo', 'más', 'también', 'porque', 'está', 'esto'],
  fr: ['le', 'les', 'des', 'un', 'une', 'est', 'pour', 'mais', 'avec', 'dans', 'qui', 'vous', 'très', 'être', 'comme'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'für', 'auf', 'sich', 'ein', 'wie', 'auch', 'sehr', 'wird'],
  pt: ['o', 'os', 'as', 'um', 'uma', 'para', 'mas', 'com', 'não', 'isso', 'muito', 'também', 'está', 'você'],
  it: ['il', 'lo', 'gli', 'un', 'una', 'per', 'ma', 'con', 'non', 'questo', 'molto', 'anche', 'sono', 'come'],
  nl: ['de', 'het', 'een', 'en', 'niet', 'met', 'voor', 'dat', 'ook', 'zeer', 'deze', 'wordt', 'zijn'],
};

// Below this many distinct stopword hits for the TARGET language, there is
// not enough signal to say anything -- treat as unknown, not as a mismatch.
const MIN_LATIN_HITS = 2;

/** Whether we can build a coarse common-word filter for this language code. */
export function hasLatinHeuristic(languageCode) {
  return Boolean(LATIN_STOPWORDS[(languageCode ?? '').toLowerCase()]);
}

function tokenize(text) {
  // \p{L} (Unicode "any letter") keeps accented characters (é, ñ, ü) attached
  // to their word instead of splitting on them the way a plain \w class would.
  return (text ?? '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

function distinctStopwordHits(words, list) {
  const set = new Set(list);
  return new Set(words.filter((w) => set.has(w))).size;
}

/**
 * Does this text's word choice look like the target Latin-script language,
 * compared against every other Latin-script language modeled here?
 * Returns null when NO modeled language clears the minimum hit count -- there
 * just isn't enough recognizable text to judge anything (short titles,
 * hashtag-only captions) -- callers must treat that as "cannot judge," the
 * same as matchesLanguageScript's null.
 *
 * Deliberately gated on the BEST score across all modeled languages, not the
 * target's own score: confidently-Spanish text asked about "en" scores 0 for
 * English, and gating on the target alone would call that "too little
 * signal" and leave it undecided, when it is exactly the opposite -- a
 * confident mismatch. The target's own score only has to beat the field, not
 * clear the minimum by itself.
 */
export function matchesLatinLanguage(languageCode, text) {
  const code = (languageCode ?? '').toLowerCase();
  if (!LATIN_STOPWORDS[code]) return null;

  const words = tokenize(text);
  const scores = Object.fromEntries(
    Object.entries(LATIN_STOPWORDS).map(([c, list]) => [c, distinctStopwordHits(words, list)])
  );

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < MIN_LATIN_HITS) return null;

  return scores[code] === maxScore;
}

// --- Named-language text claims -------------------------------------------
//
// Real case that motivated this: several "GALAXY Full Movie Hindi Dubbed
// 2026 | Thalapathy Vijay..." videos had defaultAudioLanguage unset AND a
// pure-Latin title (no Tamil script to check against a "ta" request), so
// every signal above landed on null (undecided, kept) -- even though the
// title says outright, in English, that the audio is Hindi. Verified live:
// videos.list confirmed defaultAudioLanguage: null on the exact videos from
// a real "thalapathy vijay" / relevanceLanguage=ta run, and their Hindi
// comments then leaked into gap mining under a "language: ta" filter.
//
// Scoped narrowly on purpose: a language's English name also shows up
// constantly in phrases that say nothing about a video's own audio --
// "French toast", "Dutch oven", "Greek yogurt", "Chinese checkers", "Turkish
// delight". A bare name match would misfire on all of those. Real dubbing/
// subtitle labels put the language name next to a small, predictable set of
// context words instead ("Hindi Dubbed", "Tamil Dub", "English Subtitles",
// "Telugu Version", "Malayalam Audio") -- this only fires in that window.
const DUB_CONTEXT_RE = /\b(dub(?:bed|s)?|version|subtitle[sd]?|voice[- ]?over|audio|explained|translat(?:ed|ion))\b/i;

const LANGUAGE_NAME_TO_CODE = new Map(
  Object.entries(LANGUAGE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

/**
 * Language codes the title/description explicitly CLAIM the video is in, via
 * the language's own English name sitting within a few words of a dub/
 * version/subtitle/audio context word. A title can claim more than one code
 * ("Hindi & Telugu Dubbed"), so this returns an array, not a single verdict --
 * the caller decides what a claim that includes or excludes the requested
 * language means.
 */
export function namedLanguages(text) {
  const words = tokenize(text);
  const found = new Set();
  for (let i = 0; i < words.length; i++) {
    const code = LANGUAGE_NAME_TO_CODE.get(words[i]);
    if (!code) continue;
    const window = words.slice(Math.max(0, i - 3), i + 4).join(' ');
    if (DUB_CONTEXT_RE.test(window)) found.add(code);
  }
  return [...found];
}

// --- Audio-language field, and combining it with the text-based checks -----
//
// videos.list's snippet.defaultAudioLanguage (creator-set, or YouTube's own
// language detection) turned out to be a much stronger signal than either
// text check above, discovered while investigating a user report: niche
// "ghost story", regionCode=IN, relevanceLanguage=ta returned only 1 of 50
// candidates as Tamil by script. Checked defaultAudioLanguage on the same 50
// live: 38 had it set to "ta" -- including titles with zero Tamil script at
// all, like "GHOST STORIES IN TAMIL" and "...| Tamil Horror" written entirely
// in Latin letters. Script/word checks can only ever read the TEXT; this
// field reflects the actual AUDIO, which is what a viewer -- and this app --
// actually cares about. Coverage was ~100% across every niche tested, a sharp
// contrast to channels.list's sparsely-set `country` field.
//
// It is not infallible, though: one video in that same batch had visibly
// Tamil-script text in its title but defaultAudioLanguage="en-GB" -- likely a
// stale value from a channel's very first upload that nobody went back to
// correct, a known real-world quirk of this field. So it is treated as the
// PRIMARY signal, not the ONLY one: text evidence (script or the Latin
// word-heuristic) can still rescue a video the audio field disagrees with,
// since a video's title visibly using a language's own script is very hard to
// produce by accident.

/**
 * Does this video's declared/detected audio language match? BCP-47 values
 * like "en-GB" are compared on their primary subtag only ("en"). Returns
 * null, not false, when the field is absent -- rare, but callers must still
 * treat that as "cannot judge from audio," not as a mismatch.
 */
export function matchesAudioLanguage(languageCode, defaultAudioLanguage) {
  if (!defaultAudioLanguage) return null;
  const primary = defaultAudioLanguage.split('-')[0].toLowerCase();
  return primary === (languageCode ?? '').toLowerCase();
}

/**
 * The combined verdict this app actually filters on: audio language first,
 * text evidence (script, or the Latin common-word heuristic) as a second
 * opinion that can either confirm what audio couldn't, or rescue a video from
 * a wrong/stale audio-language value. Unlike the two text-only checks this
 * builds on, it works for ANY language code YouTube recognizes, not just the
 * ~38 with a script or word-list modeled here -- defaultAudioLanguage alone
 * still applies when nothing else does.
 *
 * Returns true if either signal positively confirms the language, false only
 * when audio explicitly disagrees and text evidence didn't rescue it, and
 * null when there simply isn't enough evidence either way -- callers must
 * treat null as "unknown," not "no" (matches the region filter's rule: only
 * a CONFIRMED mismatch gets excluded).
 */
export function matchesRequestedLanguage(languageCode, video) {
  const code = (languageCode ?? '').toLowerCase();
  const audio = matchesAudioLanguage(code, video.defaultAudioLanguage);
  const text = `${video.title ?? ''} ${video.description ?? ''}`;

  // The weakest signal, checked once up front: does the title/description
  // explicitly claim a DIFFERENT language via a dub/version/subtitle/audio
  // label (namedLanguages() above)? Excludes only when the requested
  // language's own name is absent from that same claim, so a bilingual label
  // ("Hindi & Tamil Dubbed") never gets excluded on this alone. Used strictly
  // as a last-resort tiebreaker below -- never overrides a positive audio,
  // script or Latin-heuristic confirmation, only converts a remaining
  // "undecided" into an excluded when nothing stronger settled it.
  const named = namedLanguages(text);
  const namesOtherLanguage = named.length > 0 && !named.includes(code);

  if (hasScriptFilter(code)) {
    const script = matchesLanguageScript(code, text);
    if (audio === true || script === true) return true;
    // A title with no matching script proves nothing on its own (see the
    // "GHOST STORIES IN TAMIL" case above) -- only an explicit audio
    // disagreement, unrescued by script, counts as a confirmed mismatch.
    if (audio === false) return false;
    return namesOtherLanguage ? false : null;
  }

  if (hasLatinHeuristic(code)) {
    const latin = matchesLatinLanguage(code, text);
    if (audio === true || latin === true) return true;
    // matchesLatinLanguage's false is already a comparative, fairly confident
    // signal (another modeled language scored strictly higher) -- unlike bare
    // script absence, it can stand on its own when audio is unavailable.
    if (audio === false || latin === false) return false;
    return namesOtherLanguage ? false : null;
  }

  // No text-based model for this language at all -- audio is the only strong
  // signal, but it now covers languages this app previously couldn't filter
  // at all. Named-language text still gets the last word when audio itself
  // has nothing to say.
  if (audio === true || audio === false) return audio;
  return namesOtherLanguage ? false : null;
}
