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
