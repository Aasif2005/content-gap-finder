/**
 * What may be quoted on the public homepage. Honest opinions stay, however harsh
 * or wrong: this only catches abuse, slurs and subjects that start a fight. It is
 * a plain word list, so it costs no model call and a report reads the same every
 * time. Whole words only, so "class" and "assess" are never caught.
 *
 * Reports inside the app are not filtered: this is for the marketing page.
 */
const GROUPS = {
  swearing: 'fuck\\w*|f[*]+ck\\w*|motherfuck\\w*|bullshit|shit(?:s|ty|head|hole|post)?|sh[*]+t|bitch\\w*|b[*]+tch\\w*|bastards?|ass|assholes?|a[*]+hole|dickheads?|dick|cunts?|wankers?',
  // Romanised Hindi and Tamil, which the comments under Indian channels are full of.
  hindi: 'madarchod|maderchod|bhenchod|behenchod|bhosdi\\w*|chutiya\\w*|chutiye|gandu|gaand\\w*|randi\\w*|harami\\w*|kamina|kamine|kutta|kutte|saala|bsdk|bkl|lund|lauda|lawda',
  tamil: 'punda\\w*|thevdiya\\w*|thevidiya\\w*|otha|oombu|koothi\\w*|baadu',
  // Personal insults, including using a disability as one.
  insults: 'idiots?|morons?|dumbass\\w*|scumbags?|retard\\w*|autistic|spastic',
  slurs: 'nigg\\w*|fag(?:s|got\\w*)?|tranny|chink\\w*',
  sexual: 'porn\\w*|nudes?|horny|sexy?|sluts?|whores?',
  violence: 'kill yourself|kys|i will kill|rape\\w*|murder\\w*',
  // Subjects that start arguments that have nothing to do with the video.
  controversy: 'politics?|political|election\\w*|modi|bjp|congress|rahul gandhi|trump|biden|hindu\\w*|muslims?|islam\\w*|christians?|sunni|jihad\\w*|caste\\w*|dalits?|brahmin\\w*|pakistan\\w*|kashmir\\w*|israel\\w*|palestin\\w*|gaza',
};

const BLOCKED = new RegExp(`\\b(?:${Object.values(GROUPS).join('|')})\\b`, 'i');

/** Undoes the usual disguises: s0mething, @ss, sh!t. */
const plain = (text) => String(text ?? '').replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/\$/g, 's').replace(/[!1]/g, 'i');

/** True when `text` may appear on the homepage. Empty text is fine. */
export function isPublicSafe(text) {
  return !BLOCKED.test(plain(text));
}
