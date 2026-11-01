import { useEffect, useRef, useState } from 'react';
import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

/**
 * The mark: "Bubble Catcher", messages drifting past in space while a weightless
 * astronaut catches one in a net. The caught bubble is amber (a viewer's question),
 * the bubbles drifting past are outlines. It is drawn here, not loaded, so the
 * suit takes the text colour and works in either theme. Amber is used only for the
 * caught bubble and the visor, in line with amber meaning real viewer words.
 * `variant="light"` is for a dark ground that is not a themed one (it pins the
 * colour to near-white). Never combine it with YouTube branding.
 */
const BUBBLE = 'M-24 -16 L20 -16 A16 16 0 0 1 36 0 A16 16 0 0 1 20 16 L4 16 L-10 24 L-6 16 L-24 16 A16 16 0 0 1 -40 0 A16 16 0 0 1 -24 -16 Z';

const LOGO_MARK = (
  <g>
    <g transform="translate(-128 -74) rotate(-14) scale(1.3)" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
      <path d={BUBBLE} strokeWidth="4.5" />
      <line x1="-16" y1="-3" x2="12" y2="-3" strokeWidth="3.5" />
      <line x1="-16" y1="5" x2="4" y2="5" strokeWidth="3.5" />
    </g>
    <g transform="translate(-134 80) rotate(12) scale(1.1)" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
      <path d={BUBBLE} strokeWidth="5" />
    </g>
    <g transform="translate(-36 14) rotate(22)">
      <path d="M-14 38 L-38 72 L-56 102" fill="none" stroke="currentColor" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 38 L2 74 L-18 108" fill="none" stroke="currentColor" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="-46" y="-40" width="22" height="64" rx="8" fill="currentColor" />
      <circle cx="-35" cy="-26" r="3" fill="#2F5BEA" />
      <path d="M-22 -32 C-22 -38 -14 -42 0 -42 C14 -42 22 -38 22 -32 L16 44 C16 48 10 52 0 52 C-10 52 -16 48 -16 44 Z" fill="currentColor" />
      <rect x="-4" y="-14" width="8" height="3" rx="1.5" fill="#2F5BEA" />
      <circle cx="0" cy="-78" r="35" fill="currentColor" />
      <path d="M6 -98 C24 -98 32 -88 32 -78 C32 -67 24 -58 6 -58 C-6 -58 0 -68 0 -78 C0 -88 -6 -98 6 -98 Z" fill="#F3DFAE" />
      <path d="M-16 -18 L8 4 L38 -6" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 -18 L44 -10 L64 -22" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="20" y1="4" x2="104" y2="-48" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </g>
    <g transform="translate(82 -38)">
      <path d="M-24 -46 C-60 -32 -68 6 -32 38 C-12 54 8 48 18 38" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="5 5" opacity="0.55" />
      <ellipse cx="6" cy="-6" rx="36" ry="46" transform="rotate(-24)" fill="none" stroke="currentColor" strokeWidth="9" />
      <g transform="translate(18 -8) rotate(-8)">
        <path d="M-18 -34 L26 -34 A22 22 0 0 1 48 -12 L48 10 A22 22 0 0 1 26 32 L-8 32 L-28 44 L-20 24 L-26 20 A22 22 0 0 1 -48 -2 L-48 -4 A22 22 0 0 1 -26 -34 Z" fill="#F3DFAE" />
        <rect x="-24" y="-12" width="46" height="6.5" rx="3.25" fill="#0F1E2E" />
        <rect x="-24" y="4" width="30" height="6.5" rx="3.25" fill="#0F1E2E" />
        <circle cx="28" cy="-28" r="3" fill="#2F5BEA" />
      </g>
    </g>
  </g>
);

const LOGO_VIDEO = '/brand/gapstronaut-logo.mp4';

/** The animated mark: a muted, looping clip cropped to the astronaut. It pauses on its first frame under reduced motion and falls back to the drawn SVG if the clip cannot load. */
function LogoMark({ size }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  const height = Math.round(size * 1.3);
  const width = Math.round(height * 1.25);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Reduced motion rests on the clip's last frame, which is the finished logo.
    const sync = () => {
      if (!query.matches) return void video.play().catch(() => {});
      video.pause();
      if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 0.1);
    };
    sync();
    video.addEventListener('loadedmetadata', sync);
    query.addEventListener('change', sync);
    return () => {
      video.removeEventListener('loadedmetadata', sync);
      query.removeEventListener('change', sync);
    };
  }, []);

  if (failed) {
    return <svg width={width} height={height} viewBox="-190 -120 350 280" aria-hidden>{LOGO_MARK}</svg>;
  }
  return (
    <span style={{ width, height }} className="inline-block shrink-0 overflow-hidden rounded-lg bg-[#F4EFE4]">
      <video
        ref={ref}
        src={LOGO_VIDEO}
        width={width}
        height={height}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
        aria-hidden
        onError={() => setFailed(true)}
        className="block h-full w-full scale-125 object-cover object-center"
      />
    </span>
  );
}

export function Logo({ variant = 'default', size = 26, markOnly = false, href, className }) {
  const body = (
    <>
      <LogoMark size={size} />
      {!markOnly && <span style={{ fontSize: Math.round(size * 0.77) }} className="font-semibold tracking-[-0.02em]">Gapstronaut</span>}
    </>
  );
  const classes = cx('inline-flex items-center gap-2.5', variant === 'light' ? 'text-[#EAF1FF]' : 'text-fg', className);
  return href ? (
    <Link href={href} aria-label={markOnly ? 'Gapstronaut' : undefined} className={cx(classes, 'min-h-11')}>{body}</Link>
  ) : (
    <span aria-label={markOnly ? 'Gapstronaut' : undefined} className={classes}>{body}</span>
  );
}
