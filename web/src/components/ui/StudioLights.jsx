import { useEffect, useState } from 'react';

/**
 * A dark studio with three ceiling spots that flicker on and throw soft cones of
 * light onto the floor. A dependency-free port of 21st.dev's "volumetric studio":
 * the room, track, fixtures, flicker timings and stagger are the original's; the
 * WebGL spotlights are drawn as blurred, screen-blended cones, and every colour
 * comes from the pinned night tokens of the element it sits in (`--bg`, `--sl-light`),
 * so the lights are warm cream in light mode and soft white in dark mode. Only opacity
 * animates.
 */

const SPOTS = [20, 50, 80]; // % across, spread so the cones barely overlap
const TRACK_TOP = 12; // % down: clear of the logo
const FLOOR = 76; // % down: where the cones land
const CONE_W = 190; // px wide where the beam meets the floor
const CONE_TOP = 92; // px below the track where a beam starts
const CONE_BELOW = 28; // px past the floor line where it ends
const BACK = { tl: [8, 20], tr: [92, 20], br: [92, FLOOR], bl: [8, FLOOR] };

const poly = (pts) => `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
const wall = (n) => `color-mix(in oklab, var(--bg) ${n}%, black)`;
const LIGHT = 'var(--sl-light)';
const glow = (a) => `color-mix(in oklab, ${LIGHT} ${a}%, transparent)`;

// Each lamp stutters on its own: [ms since mount, state]. Lamp 0 is the original's pattern
// (600 ms wait, then 100/300/50/200/40/60/40/400); the others are offset and differ a little,
// so the beams (and the words they fall on) blink independently. All end on by ~2 s.
const TIMELINES = [
  [[600, 1], [700, 0], [1000, 1], [1050, 0], [1250, 1], [1290, 0], [1350, 1], [1390, 0], [1790, 1]],
  [[740, 1], [820, 0], [1100, 1], [1180, 0], [1330, 1], [1370, 0], [1450, 1], [1480, 0], [1560, 1], [1600, 0], [1950, 1]],
  [[680, 1], [750, 0], [1150, 1], [1200, 0], [1500, 1], [1530, 0], [1700, 1], [1730, 0], [1880, 1]],
];
const SETTLE_AT = 2300;
const FLOOD_MS = 800; // the beams widen over the text for this long, then the full text takes over

/**
 * The cone of lamp `x` (% across) as a clip-path in panel coordinates: the same trapezoid
 * the drawn beam has, so text clipped to it is lit exactly where the light falls.
 */
export const coneClip = (x) => {
  const top = `calc(${TRACK_TOP}% + ${CONE_TOP}px)`;
  const bottom = `calc(${FLOOR}% + ${CONE_BELOW}px)`;
  return `polygon(calc(${x}% - ${CONE_W * 0.06}px) ${top}, calc(${x}% + ${CONE_W * 0.06}px) ${top}, calc(${x}% + ${CONE_W / 2}px) ${bottom}, calc(${x}% - ${CONE_W / 2}px) ${bottom})`;
};
/** The same fan opened out wide: three of these overlap to cover the whole panel (the "flood" of the reveal). */
export const floodClip = (x) => {
  const top = `calc(${TRACK_TOP}% + ${CONE_TOP}px)`;
  const bottom = `calc(${FLOOR}% + ${CONE_BELOW}px)`;
  return `polygon(calc(${x}% - 70%) ${top}, calc(${x}% + 70%) ${top}, calc(${x}% + 130%) ${bottom}, calc(${x}% - 130%) ${bottom})`;
};
export { SPOTS };

/**
 * The lamps' state: `on[i]` follows lamp i's own flicker, `settled` is true once all
 * three are steady (`flickering` is its opposite) and `flooded` once the beams have
 * finished widening over the text. Call it once and hand the result to
 * <StudioLights state> and to the text that lights up with them.
 */
export function useStudioFlicker() {
  const [on, setOn] = useState([false, false, false]);
  const [settled, setSettled] = useState(false);
  const [flooded, setFlooded] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setOn([true, true, true]); setSettled(true); setFlooded(true); return undefined; }
    const timers = [];
    TIMELINES.forEach((steps, i) => {
      steps.forEach(([at, state]) => {
        timers.push(setTimeout(() => setOn((o) => o.map((v, j) => (j === i ? Boolean(state) : v))), at));
      });
    });
    timers.push(setTimeout(() => setSettled(true), SETTLE_AT));
    timers.push(setTimeout(() => setFlooded(true), SETTLE_AT + FLOOD_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  return { on, settled, flooded, flickering: !settled };
}

export function StudioLights({ state, className = '' }) {
  const { on, flickering } = state;
  const anyOn = on.some(Boolean);

  const fade = flickering ? 'none' : 'opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)';
  const fullInset = { position: 'absolute', inset: 0 };

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Room: back wall, ceiling, side walls, floor. */}
      <div style={{ ...fullInset, background: wall(100) }} />
      <div style={{ ...fullInset, clipPath: poly([BACK.tl, BACK.tr, BACK.br, BACK.bl]), background: `linear-gradient(to bottom, ${wall(100)}, ${wall(94)})` }} />
      <div style={{ ...fullInset, clipPath: poly([[0, 0], [100, 0], BACK.tr, BACK.tl]), background: `linear-gradient(to bottom, ${wall(98)}, ${wall(100)})` }} />
      <div style={{ ...fullInset, clipPath: poly([[0, 0], BACK.tl, BACK.bl, [0, 100]]), background: `linear-gradient(to right, ${wall(98)}, ${wall(100)})` }} />
      <div style={{ ...fullInset, clipPath: poly([[100, 0], BACK.tr, BACK.br, [100, 100]]), background: `linear-gradient(to left, ${wall(98)}, ${wall(100)})` }} />
      <div style={{ ...fullInset, clipPath: poly([[0, 100], [100, 100], BACK.br, BACK.bl]), background: `linear-gradient(to top, ${wall(96)}, ${wall(100)})` }} />

      {/* Where wall meets floor, and the corners. */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sl-base" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="25%" stopColor="white" stopOpacity="0.22" />
            <stop offset="75%" stopColor="white" stopOpacity="0.22" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sl-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="55%" stopColor="white" stopOpacity="0.08" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={`${BACK.bl[0]}%`} y1={`${BACK.bl[1]}%`} x2={`${BACK.br[0]}%`} y2={`${BACK.br[1]}%`} stroke="url(#sl-base)" strokeWidth="1" />
        <line x1={`${BACK.tl[0]}%`} y1={`${BACK.tl[1]}%`} x2={`${BACK.bl[0]}%`} y2={`${BACK.bl[1]}%`} stroke="url(#sl-v)" strokeWidth="1" />
        <line x1={`${BACK.tr[0]}%`} y1={`${BACK.tr[1]}%`} x2={`${BACK.br[0]}%`} y2={`${BACK.br[1]}%`} stroke="url(#sl-v)" strokeWidth="1" />
      </svg>

      {/* The wash the lights leave on walls and floor. */}
      <div
        style={{ ...fullInset, opacity: anyOn ? 1 : 0, transition: fade, mixBlendMode: 'screen' }}
      >
        <div
          style={{
            ...fullInset,
            clipPath: poly([BACK.tl, BACK.tr, BACK.br, BACK.bl]),
            background: SPOTS.map((x) => `radial-gradient(ellipse 22% 34% at ${x}% ${FLOOR - 4}%, ${glow(22)} 0%, transparent 70%)`).join(', '),
          }}
        />
        <div
          style={{
            ...fullInset,
            clipPath: poly([[0, 100], [100, 100], BACK.br, BACK.bl]),
            background: SPOTS.map((x) => `radial-gradient(ellipse 30% 16% at ${x}% ${FLOOR + 6}%, ${glow(30)} 0%, transparent 70%)`).join(', '),
          }}
        />
      </div>

      {/* The cones: narrow at the lamp, wide at the floor, staggered like the original. */}
      <div className={flickering ? undefined : 'sl-cones'} style={{ ...fullInset, mixBlendMode: 'screen' }}>
        {SPOTS.map((x, i) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `calc(${TRACK_TOP}% + ${CONE_TOP}px)`,
              height: `calc(${FLOOR - TRACK_TOP}% - ${CONE_TOP}px + ${CONE_BELOW}px)`,
              width: CONE_W,
              transform: 'translateX(-50%)',
              opacity: on[i] ? 1 : 0,
              transition: flickering ? 'none' : `opacity 800ms ease-in-out ${i * 100}ms`,
              clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)',
              background: `linear-gradient(to bottom, ${glow(44)} 0%, ${glow(11)} 55%, transparent 100%)`,
              filter: 'blur(9px)',
            }}
          />
        ))}
      </div>

      {/* Ceiling track and the three fixtures. */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: `${TRACK_TOP}%`, height: 14,
          background: 'linear-gradient(to bottom, var(--sl-dark) 0%, var(--sl-mid) 45%, var(--sl-dark) 100%)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.14), 0 10px 22px -6px rgba(0,0,0,0.7)',
        }}
      />
      {SPOTS.map((x, i) => (
        <div key={x} style={{ position: 'absolute', left: `${x}%`, top: `calc(${TRACK_TOP}% + 10px)`, transform: 'translateX(-50%)' }} className="flex flex-col items-center">
          <div style={{ width: 7, height: 16, background: 'linear-gradient(to right, var(--sl-deep), var(--sl-high), var(--sl-deep))' }} />
          <div
            style={{
              position: 'relative', width: 40, height: 48, borderRadius: '4px 4px 16px 16px',
              background: 'linear-gradient(to right, var(--sl-deep) 0%, var(--sl-mid) 32%, var(--sl-high) 52%, var(--sl-dark) 80%, var(--sl-deep) 100%)',
              boxShadow: '0 16px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            {[10, 18, 26, 34].map((t) => <span key={t} style={{ position: 'absolute', left: 0, right: 0, top: t, height: 2, background: 'rgba(0,0,0,0.85)', boxShadow: '0 1px 0 rgba(255,255,255,0.12)' }} />)}
            <span
              style={{
                position: 'absolute', left: '50%', bottom: -5, width: 30, height: 11, borderRadius: '50%', transform: 'translateX(-50%)',
                background: on[i] ? '#fff' : 'var(--sl-deep)',
                boxShadow: on[i] ? `0 0 18px 7px ${glow(85)}, inset 0 0 6px #fff` : 'inset 0 2px 4px rgba(0,0,0,0.9)',
                transition: flickering ? 'none' : 'background 600ms, box-shadow 600ms',
              }}
            />
          </div>
        </div>
      ))}

      {/* A vignette and a floor scrim keep it quiet at the edges and under the text. */}
      <div style={{ ...fullInset, background: 'radial-gradient(ellipse 95% 85% at 50% 42%, transparent 50%, color-mix(in oklab, var(--bg) 82%, black) 100%)' }} />
      <div style={{ ...fullInset, height: '46%', top: 'auto', bottom: 0, background: 'linear-gradient(to top, color-mix(in oklab, var(--bg) 94%, black) 8%, transparent)' }} />
    </div>
  );
}
