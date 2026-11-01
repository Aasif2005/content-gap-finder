import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageMinus, ImagePlus } from 'lucide-react';
import { Button, Dialog } from '../ui/index.js';
import { MAX_ZOOM, clampOffset, cropRect, decodeImage, initialView, renderAvatar, zoomAt, zoomOf } from '../../lib/avatarImage.js';

const DIM = 'rgba(15, 30, 46, 0.6)';
const KEY_STEP = 12;

/**
 * Frames the chosen photo for the round profile picture. The circle is exactly
 * what will be kept. Drag to move, scroll or pinch to zoom, or use the slider;
 * arrow keys and + / - do the same from the keyboard. The photo always covers
 * the circle. `onSave(dataUrl)` should resolve when stored (it may throw a plain-words error).
 */
export function AvatarEditor({ file, onClose, onSave }) {
  const [bitmap, setBitmap] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [side, setSide] = useState(0); // the stage's width in pixels
  const [view, setView] = useState(null);
  const [stageEl, setStageEl] = useState(null);
  const stage = useRef(null);
  const canvas = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  // The frame is the circle's bounding square, inset from the stage.
  const pad = Math.round(side * 0.07);
  const box = side - pad * 2;
  const imageSize = bitmap ? { width: bitmap.width, height: bitmap.height } : null;

  // Decode the chosen file; closing the dialog or choosing again discards it.
  useEffect(() => {
    if (!file) return undefined;
    let live = true;
    let made = null;
    setBitmap(null); setView(null); setError(null); setSaving(false);
    decodeImage(file).then(
      (b) => { made = b; if (live) setBitmap(b); else b.close?.(); },
      (err) => { if (live) setError(err.message); }
    );
    return () => { live = false; made?.close?.(); };
  }, [file]);

  // The dialog mounts the stage before it is shown, so its width is only known once it is laid out.
  const measure = useCallback((el) => { stage.current = el; setStageEl(el); }, []);
  useEffect(() => {
    if (!stageEl) return undefined;
    const read = () => setSide(Math.round(stageEl.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  useEffect(() => {
    if (bitmap && box > 0) setView(initialView({ imageSize: { width: bitmap.width, height: bitmap.height }, box }));
  }, [bitmap, box]);

  // Paint: the photo, a dim sheet with a round hole, and a hairline ring.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bitmap || !view || !side) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(side * dpr);
    c.height = Math.round(side * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, side, side);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, pad + view.offset.x, pad + view.offset.y, bitmap.width * view.scale, bitmap.height * view.scale);
    g.beginPath();
    g.rect(0, 0, side, side);
    g.arc(side / 2, side / 2, box / 2, 0, Math.PI * 2);
    g.fillStyle = DIM;
    g.fill('evenodd');
    g.beginPath();
    g.arc(side / 2, side / 2, box / 2, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 1.5;
    g.stroke();
  }, [bitmap, view, side, pad, box]);

  const move = (dx, dy) => setView((v) => v && { ...v, offset: clampOffset({ scale: v.scale, offset: { x: v.offset.x + dx, y: v.offset.y + dy }, imageSize, box }) });
  const zoom = (scale, anchor = { x: box / 2, y: box / 2 }) => setView((v) => v && zoomAt({ view: v, scale, anchor, imageSize, box }));
  const frameAt = (clientX, clientY) => {
    const r = stage.current.getBoundingClientRect();
    return { x: clientX - r.left - pad, y: clientY - r.top - pad };
  };

  // Wheel needs a non-passive listener to stop the page scrolling under the stage.
  const wheel = useRef(null);
  wheel.current = (e) => {
    if (!view) return;
    e.preventDefault();
    zoom(view.scale * Math.exp(-e.deltaY * 0.0015), frameAt(e.clientX, e.clientY));
  };
  useEffect(() => {
    if (!stageEl) return undefined;
    const on = (e) => wheel.current(e);
    stageEl.addEventListener('wheel', on, { passive: false });
    return () => stageEl.removeEventListener('wheel', on);
  }, [stageEl]);

  const down = (e) => {
    if (!view) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  };
  const moveTo = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      move(e.clientX - prev.x, e.clientY - prev.y);
    } else if (pointers.current.size === 2 && pinch.current?.dist) {
      const [a, b] = [...pointers.current.values()];
      const mid = frameAt((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoom(pinch.current.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), mid);
    }
  };
  const up = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const key = (e) => {
    const arrows = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    if (arrows[e.key]) { e.preventDefault(); move(...arrows[e.key]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(view.scale * 1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(view.scale / 1.15); }
  };

  const save = async () => {
    if (!bitmap || !view || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(renderAvatar(bitmap, cropRect({ view, imageSize, box })));
      setSaving(false);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const level = view ? zoomOf({ view, imageSize, box }) : 1;
  const ready = Boolean(bitmap && view);

  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      dismissible={!saving}
      title="Edit picture"
      actions={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!ready}>Save</Button>
        </>
      )}
    >
      <div
        ref={measure}
        tabIndex={ready ? 0 : -1}
        role="group"
        aria-label="Crop area. Drag or use the arrow keys to move the photo, scroll or use plus and minus to zoom."
        onPointerDown={down}
        onPointerMove={moveTo}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={ready ? key : undefined}
        className="relative mx-auto aspect-square w-full max-w-[320px] touch-none select-none overflow-hidden rounded-panel bg-surface-2 outline-offset-4 focus-visible:outline-1 focus-visible:outline-focus"
        style={{ cursor: ready ? 'grab' : 'default' }}
      >
        <canvas ref={canvas} style={{ width: side, height: side }} className="absolute inset-0" />
        {!ready && !error && <div role="status" aria-label="Loading your photo" className="absolute inset-0 animate-pulse bg-surface-2" />}
      </div>

      <div className="mx-auto mt-5 flex w-full max-w-[320px] items-center gap-3 text-fg-3">
        <ImageMinus aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={level}
          disabled={!ready}
          onChange={(e) => view && zoom(view.scale * (Number(e.target.value) / level))}
          className="crop-range min-w-0 flex-1"
        />
        <ImagePlus aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-center text-[13px] text-fg-3">Drag to move, scroll to zoom.</p>
      <p role="alert" className="mt-3 text-center text-[14px] text-bad-fg empty:hidden">{error}</p>
    </Dialog>
  );
}
