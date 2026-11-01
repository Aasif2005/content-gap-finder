import { useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Avatar } from '../ui/index.js';
import { ACCEPTED_TYPES } from '../../lib/avatarImage.js';

/**
 * The profile picture, which is also the control for changing it: a pencil
 * fades in over it on hover and keyboard focus, and sits on its edge on touch
 * screens, where there is no hover. Choosing a file hands it to `onFile`.
 */
export function AvatarButton({ user, size = 96, onFile, disabled }) {
  const input = useRef(null);

  const choose = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still fires
    if (file) onFile(file);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Edit profile picture"
        style={{ width: size, height: size }}
        className="group relative inline-flex shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Avatar user={user} size={size} key={user.photoUrl ?? 'none'} />
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center rounded-full bg-[#0F1E2E]/55 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none pointer-coarse:hidden"
        >
          <Pencil className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span
          aria-hidden
          className="absolute bottom-0 right-0 hidden h-8 w-8 place-items-center rounded-full border-2 border-surface bg-ink text-on-ink pointer-coarse:grid"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </button>
      <input ref={input} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={choose} className="sr-only" tabIndex={-1} aria-hidden />
    </>
  );
}
