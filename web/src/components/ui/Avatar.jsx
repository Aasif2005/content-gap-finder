import { useState } from 'react';
import { cx } from '../../lib/cx.js';

/** First letter of the name, else of the email, else a dot. */
export function initialOf(user) {
  const s = (user?.name || user?.email || '').trim();
  return s ? [...s][0].toUpperCase() : '·';
}

/**
 * The person's photo, or their initial on an ink disc. A photo that fails to
 * load falls back to the initial. `user` is the `useAuth()` user (or anything
 * with `name`, `email`, `photoUrl`); `size` is in pixels.
 */
export function Avatar({ user, size = 36, className }) {
  const [broken, setBroken] = useState(false);
  const photo = user?.photoUrl && !broken ? user.photoUrl : null;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink font-semibold text-on-ink', className)}
    >
      {photo ? (
        // Google's photo host rejects requests that carry a referrer.
        <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        initialOf(user)
      )}
    </span>
  );
}
