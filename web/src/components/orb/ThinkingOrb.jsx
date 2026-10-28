import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { COPY, createRuntime } from './orbEngine.js';
import { PHASES } from '../ProgressRail.jsx';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** "#8FA9FF" or "rgb(…)" → [r, g, b]; falls back to Ion Blue's light tint. */
function toRgb(value) {
  const v = String(value ?? '').trim();
  const hex = v.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = v.match(/\d+(\.\d+)?/g);
  if (rgb && rgb.length >= 3) return rgb.slice(0, 3).map((n) => Math.round(Number(n)));
  return [143, 169, 255];
}

/**
 * The full-screen thinking orb that plays while an analysis runs. It is the
 * 21st.dev "AI thinking orb" effect (see orbEngine.js), skinned in our palette
 * on a pinned night ground.
 *
 * `job`: { text, origin: {x, y, w}, onSubmit: () => Promise<string>, minThink }
 *   `text`    what the clicked pill showed (the search)
 *   `origin`  where that pill is on screen, so the flight starts there
 *   `onSubmit` resolves with the line shown on the finished card
 * `onDismiss({ cancelled })` fires when the stage closes: after "Open report"
 * (cancelled false) or when the visitor stops it with Esc / Cancel (true).
 */
export function ThinkingOrb({ job, progress, onDismiss }) {
  const [phase, setPhase] = useState('idle');
  const [lbl, setLbl] = useState({ cur: COPY.labels[0], prev: null, n: 0 });
  const [answer, setAnswer] = useState('');
  const [leaving, setLeaving] = useState(false);

  const rootRef = useRef(null);
  const moverRef = useRef(null);
  const actorRef = useRef(null);
  const formRef = useRef(null);
  const canvasRef = useRef(null);
  const pulseRef = useRef(null);
  const statusRef = useRef(null);
  const answerRef = useRef(null);
  const bodyRef = useRef(null);
  const liveRef = useRef(null);
  const ctaRef = useRef(null);
  const cancelRef = useRef(null);
  const ghostRefs = useRef([]);
  const rtRef = useRef(null);
  const phaseRef = useRef('idle');
  const doneRef = useRef(false);
  const jobRef = useRef(job);
  jobRef.current = job;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useIsoLayoutEffect(() => {
    const root = rootRef.current, mover = moverRef.current, actor = actorRef.current, canvas = canvasRef.current;
    const pulse = pulseRef.current, status = statusRef.current, form = formRef.current;
    const ghosts = ghostRefs.current.filter(Boolean);
    if (!root || !mover || !actor || !canvas || !pulse || !status || !form) return undefined;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = mq.matches;
    const onMq = (e) => { reduced = e.matches; };
    mq.addEventListener('change', onMq);

    const accent = toRgb(getComputedStyle(root).getPropertyValue('--accent'));
    const rt = createRuntime({
      root, mover, actor, form, ghosts, canvas, pulse, status, accent,
      getBody: () => bodyRef.current,
      getSpeed: () => 1,
      isReduced: () => reduced,
      ui: {
        setPhase: (p) => { phaseRef.current = p; setPhase(p); },
        swapLabel: (name) => setLbl((l) => (l.cur === name ? l : { cur: name, prev: l.cur, n: l.n + 1 })),
        resetLabel: () => setLbl((l) => ({ cur: COPY.labels[0], prev: null, n: l.n + 1 })),
        setAnswer: (s) => setAnswer(s),
        live: (s) => { if (liveRef.current) liveRef.current.textContent = s; },
        lock: () => {},
        dismiss: (kind) => {
          if (doneRef.current) return;
          doneRef.current = true;
          // A finished run glides out before the report rises in; a cancel closes at once.
          if (kind === 'reset' && !reduced) {
            setLeaving(true);
            window.setTimeout(() => dismissRef.current?.({ cancelled: false }), 560);
          } else {
            dismissRef.current?.({ cancelled: kind !== 'reset' });
          }
        },
        focusAnswer: () => { window.requestAnimationFrame(() => ctaRef.current?.focus({ preventScroll: true })); },
      },
    });
    rtRef.current = rt;

    const onKey = (e) => {
      if (e.key === 'Escape' && phaseRef.current !== 'idle' && phaseRef.current !== 'reset') {
        e.preventDefault();
        // Once the report is ready there is nothing left to cancel: Esc just opens it now.
        if (phaseRef.current === 'answered') rt.reset(); else rt.escape();
      }
    };
    window.addEventListener('keydown', onKey);
    cancelRef.current?.focus({ preventScroll: true });

    const j = jobRef.current;
    rt.start(j.text, { onSubmit: j.onSubmit, minThink: j.minThink ?? 1200, origin: j.origin });

    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
      rt.destroy();
      rtRef.current = null;
    };
  }, []);

  const finished = phase === 'answered';

  // The report opens by itself a beat after the card lands.
  useEffect(() => {
    if (!finished) return undefined;
    const id = window.setTimeout(() => rtRef.current?.reset(), 1600);
    return () => window.clearTimeout(id);
  }, [finished]);
  const active = phase !== 'idle' && phase !== 'reset' && !finished;
  const words = answer.split(/\s+/).filter(Boolean);

  const labelInner = (name) => (name === COPY.done ? (
    <span className="mo-lab-done">{name}</span>
  ) : (
    <>
      <span className="mo-lab-t">{name}</span>
      <span className="mo-dots" aria-hidden="true"><i /><i /><i /></span>
    </>
  ));

  // The words are the app's real steps (Finding videos … Mining gaps), not the demo's "Thinking".
  const curIdx = Math.max(0, PHASES.findIndex((p) => p.key === progress?.phase));
  const stepName = PHASES[curIdx].label;
  const label = lbl.cur === COPY.done ? COPY.done : stepName;

  useEffect(() => {
    if (liveRef.current) liveRef.current.textContent = label;
  }, [label]);

  return (
    <section className="fade-in" aria-label="Analyzing your search">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-3">Live analysis</p>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">Analyzing your search</h1>
      <p className="mt-2 max-w-2xl truncate text-[17px] leading-relaxed text-fg-2">{job.summary || job.text}</p>

    <div className="mo-root mo-inline theme-night mt-6" data-phase={phase} data-leaving={leaving || undefined} ref={rootRef} role="group" aria-label="Analysis progress">
      <div className="mo-bg" aria-hidden="true" />
      <div className="mo-halo" aria-hidden="true" />

      <div className="mo-mover" ref={moverRef}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="mo-trail" aria-hidden="true" ref={(el) => { ghostRefs.current[i] = el; }} />
        ))}

        <div className="mo-actor" ref={actorRef}>
          <div className="mo-underglow" aria-hidden="true" />
          <div className="mo-halo-accent" aria-hidden="true" />
          <div className="mo-surface" aria-hidden="true">
            <div className="mo-aurora"><i /><i /><i /><i /></div>
          </div>
          <div className="mo-ball" aria-hidden="true" />
          <div className="mo-done" aria-hidden="true">
            <Check strokeWidth={2.25} />
          </div>
          <div className="mo-card" aria-hidden="true" />
          <div className="mo-ring" aria-hidden="true" />

          {/* The pill the visitor just clicked, as a static clone: the search, then it melts into the ball. */}
          <div className="mo-input" ref={formRef}>
            <Sparkles className="mo-spark" aria-hidden="true" strokeWidth={1.5} />
            <span className="mo-query">{job.text}</span>
          </div>

          <canvas className="mo-orb" ref={canvasRef} aria-hidden="true" />
          <div className="mo-pulse" ref={pulseRef} aria-hidden="true" />

          <div className="mo-answer" ref={answerRef} role="group" aria-label={COPY.answerTitle}>
            <div className="mo-a-head">
              <i className="mo-a-dot" aria-hidden="true" />
              <span>{COPY.answerTitle}</span>
            </div>
            <p className="mo-a-body" ref={bodyRef}>
              {words.map((w, i) => (
                <span key={i}><span className="mo-w">{w}</span>{' '}</span>
              ))}
            </p>
          </div>
        </div>
      </div>

      <div className="mo-status" ref={statusRef} aria-hidden="true">
        <span key={label} className="mo-lab mo-in">{labelInner(label)}</span>
      </div>

      <ol className="mo-chips" aria-hidden="true">
        {PHASES.map((p, i) => (
          <li key={p.key} className="mo-chip" data-state={finished || i < curIdx ? 'done' : i === curIdx ? 'now' : 'next'}>
            <i />{p.label}
          </li>
        ))}
      </ol>

      {/* Our own buttons, not the original's input and send button. */}
      <div className="mo-actions">
        {active && (
          <Button ref={cancelRef} variant="ghost" onClick={() => rtRef.current?.escape()} className="mo-fade">
            Cancel <span className="mo-key">Esc</span>
          </Button>
        )}
        {finished && <p className="mo-fade mo-opening">Opening your report<span className="mo-dots" aria-hidden="true"><i /><i /><i /></span></p>}
      </div>

      <div className="mo-live" ref={liveRef} role="status" aria-live="polite" />
    </div>
    </section>
  );
}
