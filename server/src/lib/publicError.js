/**
 * What a visitor may read about a failure. Errors from YouTube, DeepSeek and the
 * database carry raw response bodies and internals; those belong in the server
 * log. Only errors this app wrote for people, marked by their code, pass through.
 */
const FOR_PEOPLE = new Set([
  'VALIDATION',
  'NO_RESULTS',
  'NO_RESULTS_AFTER_FILTER',
  'CHANNEL_NOT_FOUND',
  'CHANNEL_NO_UPLOADS',
  'GAP_NOT_FOUND',
  'QUOTA_BUSY',
]);

export const GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.';
export const RUN_FAILED = 'This run hit a problem on our side, so it did not use your allowance. Try again in a moment.';
// A quotaExceeded from YouTube carries the raw response body, so this is never passed through.
const QUOTA_MESSAGE = 'Gapstronaut has used its YouTube allowance for today. It resets at midnight Pacific.';

export function publicMessage(err, fallback = GENERIC_ERROR) {
  if (err?.code === 'QUOTA_EXHAUSTED') return QUOTA_MESSAGE;
  return FOR_PEOPLE.has(err?.code) ? err.message : fallback;
}

// body-parser marks its own failures with `type`; their messages quote the request.
const BODY_ERRORS = {
  'entity.parse.failed': ['BAD_JSON', 'That request was not valid JSON.'],
  'entity.too.large': ['TOO_LARGE', 'That request is too large.'],
};

/** The HTTP answer for anything that reached the central error handler. */
export function errorResponse(err) {
  const status = err?.status ?? 500;
  const known = BODY_ERRORS[err?.type];
  if (known) return { status, body: { error: known[1], code: known[0] } };
  if (status === 404 && !FOR_PEOPLE.has(err?.code)) return { status, body: { error: 'Not found.', code: 'NOT_FOUND' } };
  const message = publicMessage(err);
  return { status, body: { error: message, code: message === GENERIC_ERROR ? 'INTERNAL' : err.code } };
}
