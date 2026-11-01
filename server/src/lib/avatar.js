// A profile picture is a small JPEG the browser made from the person's file
// (web/src/lib/avatarImage.js). Only that JPEG is stored or served, never the
// original upload, so a disguised file cannot be passed off as an image.
export const MAX_AVATAR_BYTES = 100 * 1024;
const PREFIX = 'data:image/jpeg;base64,';

const invalid = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION' });

/** The JPEG bytes inside a `data:image/jpeg;base64,...` URL, or a 400 saying what is wrong. */
export function parseAvatarDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) throw invalid('Choose a JPEG, PNG, WebP or GIF image.');
  const b64 = value.slice(PREFIX.length);
  if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw invalid('That image could not be read.');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > MAX_AVATAR_BYTES) throw invalid('That image is too large after resizing. Try a simpler picture.');
  // JPEG files start FF D8 FF and end FF D9.
  const jpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (!jpeg) throw invalid('That image could not be read.');
  return bytes;
}
