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
