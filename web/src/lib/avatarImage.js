/**
 * Turns whatever photo someone picks into a small square JPEG for their
 * profile. Done in the browser so a 12 MB phone photo never travels, and
 * because redrawing on a canvas drops EXIF data such as where it was taken.
 *
 * The crop maths below is pure (no DOM) so it can be tested. A "view" is
 * `{ scale, offset }`: the photo drawn `scale` times its size with its top-left
 * corner at `offset` from the top-left of a square frame of side `box` pixels.
 * The frame is what ends up in the picture.
 */
export const AVATAR_SIZE = 256;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** The centred square of a width x height picture: where to start and how long a side. */
export function squareCrop(width, height) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

export const MAX_ZOOM = 4; // times the "just covers the frame" size

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Smallest scale at which the photo still covers the whole frame. */
export const fitImage = ({ width, height, box }) => box / Math.min(width, height);

/** Keeps the photo covering the frame: its edges can reach the frame's, never pass them. */
export function clampOffset({ scale, offset, imageSize, box }) {
  return {
    x: clamp(offset.x, box - imageSize.width * scale, 0),
    y: clamp(offset.y, box - imageSize.height * scale, 0),
  };
}

/** The starting view: photo as small as allowed, centred. */
export function initialView({ imageSize, box }) {
  const scale = fitImage({ ...imageSize, box });
  return { scale, offset: clampOffset({ scale, offset: { x: (box - imageSize.width * scale) / 2, y: (box - imageSize.height * scale) / 2 }, imageSize, box }) };
}

/** Changes the scale (within limits) keeping the point `anchor`, in frame pixels, where it is. */
export function zoomAt({ view, scale, anchor, imageSize, box }) {
  const min = fitImage({ ...imageSize, box });
  const next = clamp(scale, min, min * MAX_ZOOM);
  const k = next / view.scale;
  const offset = { x: anchor.x - (anchor.x - view.offset.x) * k, y: anchor.y - (anchor.y - view.offset.y) * k };
  return { scale: next, offset: clampOffset({ scale: next, offset, imageSize, box }) };
}

/** How zoomed in a view is: 1 (smallest) to MAX_ZOOM. */
export const zoomOf = ({ view, imageSize, box }) => view.scale / fitImage({ ...imageSize, box });

/** The square of the original photo that the frame shows, in the photo's own pixels. */
export function cropRect({ view, imageSize, box }) {
  const side = Math.min(box / view.scale, imageSize.width, imageSize.height);
  return {
    sx: clamp(-view.offset.x / view.scale, 0, imageSize.width - side),
    sy: clamp(-view.offset.y / view.scale, 0, imageSize.height - side),
    side,
  };
}

const fail = (message) => Object.assign(new Error(message), { code: 'BAD_IMAGE' });

/** Throws a plain-words error unless this looks like an image we accept; returns the file. */
export function checkFile(file) {
  if (!file) throw fail('Choose an image first.');
  if (!ACCEPTED_TYPES.includes(file.type)) throw fail('Choose a JPEG, PNG, WebP or GIF image.');
  if (file.size > MAX_FILE_BYTES) throw fail('That image is over 5 MB. Choose a smaller one.');
  return file;
}

/** Decodes a chosen file (applying the photo's own rotation). */
export async function decodeImage(file) {
  checkFile(file);
  try {
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) throw new Error('empty');
    return bitmap;
  } catch {
    throw fail('That file could not be read as an image.');
  }
}

/** The chosen square of `bitmap` as a `data:image/jpeg;base64,...` URL, 256 x 256. */
export function renderAvatar(bitmap, rect) {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // a transparent PNG would turn black as a JPEG
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, rect.sx, rect.sy, rect.side, rect.side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return canvas.toDataURL('image/jpeg', 0.85);
}
