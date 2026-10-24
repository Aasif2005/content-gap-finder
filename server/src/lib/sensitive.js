// Detects a gap that is about a real, identifiable person or family caught up in
// a crime, disappearance or legal case. A "gap" built on the audience's suspicion
// of named people is exactly what this tool would otherwise hand a creator as a
// video to film, with a title that presents the suspicion as the product.
//
// This is deliberately a WARN-and-reframe signal, not a block: it errs towards
// flagging (a "murder mystery" board game will trip it) because the cost of a
// false positive is a banner and a more careful script, while the cost of a miss
// is a confident title accusing a missing child's parents.

const HARM = [
  /\b(murder(?:ed|er|ers)?|kill(?:ed|ing|er|ers)|suicide|rape[ds]?|assault(?:ed)?|molest\w*|abus(?:e|ed|ing)|traffick\w*)\b/i,
  /\b(kidnap\w*|abduct\w*)\b/i,
  /\bmissing\s+(?:child|girl|boy|person|woman|man|kid|daughter|son|teen\w*|student)\b/i,
  /\b(?:child|girl|boy|daughter|son|kid)\s+(?:is\s+|was\s+|went\s+)?missing\b/i,
  // Tamil: missing, kidnap, murder, suicide, sexual
  /காணாமல்|கடத்த|கொலை|தற்கொலை|பாலியல்/,
  // Hindi: missing, kidnap, murder, suicide
  /लापता|अपहरण|हत्या|आत्महत्या/,
];

const LEGAL_WORDS = [
  ['police', /\bpolice\b/i],
  ['custody', /\bcustody\b/i],
  ['arrest', /\barrest(?:ed|s)?\b/i],
  ['accused', /\baccused\b/i],
  ['suspect', /\bsuspect(?:s|ed)?\b/i],
  ['interrogation', /\binterrogat\w*|\bquestion(?:ed|ing)\s+(?:the\s+)?(?:parents|mother|father|family)\b/i],
  ['FIR/CBI', /\b(?:FIR|CBI|CB-?CID|NIA)\b/],
  ['court', /\b(?:high|supreme|district)\s+court\b|\bbail\b|\bcharge[- ]?sheet\b/i],
  ['culprit', /\bculprits?\b/i],
  // Tamil: arrest, police, custody/guard, culprit | Hindi: arrested, police
  ['கைது/போலீஸ்', /கைது|போலீஸ்|காவல்|குற்றவாளி/],
  ['गिरफ्तार/पुलिस', /गिरफ्तार|पुलिस/],
];

const MINOR = /\b(?:child|children|girls?|boys?|minors?|kids?|daughters?|toddler|infant|teen\w*|students?)\b|சிறுமி|குழந்தை|बच्ची|बच्चा/i;

/**
 * @returns {{level: 'high'|'none', reasons: string[]}}
 *   high = harm term together with a legal or minor cue, a minor together with a legal
 *   cue, or two distinct legal cues.
 */
export function detectSensitive(text) {
  const t = String(text ?? '');
  const harm = HARM.some((re) => re.test(t));
  const legal = LEGAL_WORDS.filter(([, re]) => re.test(t)).map(([name]) => name);
  const minor = MINOR.test(t);

  const flagged = (harm && (legal.length > 0 || minor)) || (minor && legal.length > 0) || legal.length >= 2;
  if (!flagged) return { level: 'none', reasons: [] };

  const reasons = [];
  if (harm) reasons.push('violence, disappearance or abuse is mentioned');
  if (legal.length) reasons.push(`legal process mentioned (${legal.slice(0, 4).join(', ')})`);
  if (minor) reasons.push('a child or minor is involved');
  return { level: 'high', reasons };
}

/** Combines the deterministic detector with the model's own flag on the gap. */
export function assessSensitivity(text, modelFlag = false) {
  const found = detectSensitive(text);
  if (modelFlag === true && found.level === 'none') {
    return { level: 'high', reasons: ['flagged by the analysis as a real, ongoing case involving identifiable people'] };
  }
  return found;
}
