import { cloneElement, useId, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { ShinyButton } from './ui/ShinyButton.jsx';
import { SlideGroup, SLIDE_ITEM } from './ui/SlideTabs.jsx';
import { cx } from '../lib/cx.js';
import { Button } from './ui/Button.jsx';
import { Checkbox } from './ui/Checkbox.jsx';
import { Field, Input } from './ui/Field.jsx';
import { Panel } from './ui/Panel.jsx';
import { DEEP_SCAN } from '../lib/features.js';

// The Custom date range is switched off until the YouTube quota extension is approved (and ALLOW_CUSTOM_WINDOW on the server).
const CUSTOM_RANGE = false;

const WINDOWS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  ...(CUSTOM_RANGE ? [{ value: 'custom', label: 'Custom' }] : []),
];

const TWO_LETTERS = /^[a-z]{2}$/i;

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const TYPES = [
  { value: 'both', label: 'Both' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'long', label: 'Long-form' },
];

function Pills({ options, value, onChange, name, disabled }) {
  return (
    <SlideGroup
      role="radiogroup"
      aria-label={name}
      className="inline-flex flex-wrap gap-0.5 rounded-full bg-surface-2 p-1"
      pillClassName="bg-ink"
      hoverClassName="bg-hover"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-slide-item
          data-active={value === o.value}
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            SLIDE_ITEM,
            'min-h-10 rounded-full px-4 text-[15px] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-55',
            value === o.value ? 'font-semibold text-on-ink' : 'font-medium text-fg-2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </SlideGroup>
  );
}

/** `mode` ('niche' | 'channel') is fixed by which page rendered this form -- the
 * page itself is the mode switch now, so the form no longer has its own toggle. */
export function SearchForm({ onSubmit, busy, initial = {}, mode = 'niche' }) {
  const [niche, setNiche] = useState(initial.niche ?? '');
  const [window, setWindow] = useState(initial.window === 'custom' && !CUSTOM_RANGE ? '7d' : initial.window ?? '7d');
  const [contentType, setContentType] = useState(initial.contentType ?? 'both');
  // Opened with filters in the URL? Show them, or they look like they were ignored.
  const [advanced, setAdvanced] = useState(
    Boolean(initial.regionCode || initial.relevanceLanguage || initial.minViews || (DEEP_SCAN && initial.deepScan) || (initial.gapMode && initial.gapMode !== 'inclusive'))
  );
  const [regionCode, setRegionCode] = useState(initial.regionCode ?? '');
  const [relevanceLanguage, setRelevanceLanguage] = useState(initial.relevanceLanguage ?? '');
  const [minViews, setMinViews] = useState(initial.minViews ? String(initial.minViews) : '');
  const [gapMode, setGapMode] = useState(initial.gapMode ?? 'inclusive');
  const [deepScan, setDeepScan] = useState(DEEP_SCAN && Boolean(initial.deepScan));
  const [channelId, setChannelId] = useState(initial.channelId ?? '');
  const [customAfter, setCustomAfter] = useState(
    initial.customAfter ? initial.customAfter.slice(0, 10) : daysAgoISO(14)
  );

  const [codeErrors, setCodeErrors] = useState({});

  const filtersId = useId();
  const [options, setOptions] = useState(Boolean(initial.window && initial.window !== '7d') || Boolean(initial.contentType && initial.contentType !== 'both') || advanced);
  const windowText = window === 'custom' ? 'Custom range' : `Last ${WINDOWS.find((w) => w.value === window)?.label ?? '7 days'}`;
  const formatText = contentType === 'both' ? 'Both formats' : (TYPES.find((t) => t.value === contentType)?.label ?? 'Both formats');
  const summaryLine = `${windowText} · ${formatText}`;
  const channelMode = mode === 'channel';
  const ready = channelMode ? channelId.trim().length > 1 : niche.trim().length >= 2;

  const submit = (e) => {
    e.preventDefault();
    // Where the search pill is on screen: the thinking orb flies out from there.
    const box = e.currentTarget.querySelector('[data-orb-origin]')?.getBoundingClientRect();
    const origin = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width } : undefined;
    if (!ready || busy) return;
    if (window === 'custom' && !customAfter) return;
    if (!channelMode) {
      // Caught here so a typo costs nothing and the message sits on the field.
      const found = {
        region: regionCode.trim() && !TWO_LETTERS.test(regionCode.trim()) ? 'Use two letters, like US.' : undefined,
        language: relevanceLanguage.trim() && !TWO_LETTERS.test(relevanceLanguage.trim()) ? 'Use two letters, like en.' : undefined,
      };
      setCodeErrors(found);
      if (found.region || found.language) {
        setOptions(true);
        setAdvanced(true);
        return;
      }
    }
    onSubmit({
      niche: channelMode ? '' : niche.trim(),
      channelId: channelMode ? channelId.trim() : undefined,
      window,
      // Sent as a UTC timestamp so the server is not guessing the user's zone.
      customAfter: window === 'custom' ? new Date(`${customAfter}T00:00:00Z`).toISOString() : undefined,
      contentType,
      gapMode,
      minViews: Number(minViews) || 0,
      // A channel's own uploads are already unambiguous, so region/language
      // narrowing has nothing to disambiguate and is left off entirely.
      regionCode: channelMode ? undefined : regionCode.trim() || undefined,
      relevanceLanguage: channelMode ? undefined : relevanceLanguage.trim() || undefined,
      deepScan: channelMode || !DEEP_SCAN ? false : deepScan,
    }, { origin });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* The search console: one panel, the field and the button on one line. */}
      <Panel padding="none" data-orb-origin="" className="search-console flex flex-col items-stretch gap-2 rounded-[2rem] p-2 pl-5 sm:flex-row sm:items-center sm:rounded-full">
        <Search aria-hidden className="search-icon hidden h-5 w-5 shrink-0 sm:block" strokeWidth={1.6} />
        {channelMode ? (
          <input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="Paste a channel URL, @handle, or UC… id"
            aria-label="YouTube channel URL, handle or id"
            disabled={busy}
            className={mainInputCls}
          />
        ) : (
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Enter a niche, e.g. sourdough baking, home lab, watercolour portraits"
            aria-label="Niche or keyword"
            disabled={busy}
            className={mainInputCls}
          />
        )}
        <ShinyButton type="submit" disabled={busy || !ready} loading={busy} className="shrink-0">
          {busy ? 'Analyzing…' : 'Find gaps'}
        </ShinyButton>
      </Panel>

      {channelMode && (
        <p className="text-center text-[13px] text-fg-3">
          Scoped to this channel&rsquo;s own uploads and its viewers&rsquo; comments.
        </p>
      )}

      {/* One quiet line stands in for the controls; it opens them. */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => setOptions((v) => !v)}
          aria-expanded={options}
          aria-controls={`${filtersId}-options`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        >
          {summaryLine}
          <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]', options && 'rotate-180')} />
        </button>

        <Collapse open={options} id={`${filtersId}-options`}>
          <div className="flex w-full flex-col items-center gap-4 pt-1">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {/* Not <label>: a label forwards clicks to its first button, so clicking
                  the word "Published" silently switched the window to 24 hours. */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
                <span className="font-medium" aria-hidden="true">Published</span>
                <Pills name="Published: time window" options={WINDOWS} value={window} onChange={setWindow} disabled={busy} />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
                <span className="font-medium" aria-hidden="true">Format</span>
                <Pills name="Format: content type" options={TYPES} value={contentType} onChange={setContentType} disabled={busy} />
              </div>
            </div>

            {CUSTOM_RANGE && window === 'custom' && (
              <label className="flex items-center gap-3 text-sm text-fg-2">
                <span className="font-medium">Since</span>
                <input
                  type="date"
                  value={customAfter}
                  max={todayISO()}
                  min={daysAgoISO(364)}
                  onChange={(e) => setCustomAfter(e.target.value)}
                  disabled={busy}
                  aria-label="Custom range start date"
                  className={cx(controlCls, 'min-h-11 font-mono nums')}
                />
              </label>
            )}

            <Button
              variant="ghost"
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
              aria-controls={filtersId}
            >
              {advanced ? 'Hide filters' : 'More filters'}
              <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]', advanced && 'rotate-180')} />
            </Button>
          </div>
        </Collapse>
      </div>

      {/* Tied to the options line: closing "Last 7 days · …" closes the filters with it. */}
      <Collapse open={options && advanced}>
        <Panel id={filtersId} className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Region and language narrow WHICH videos a niche search returns. A
              channel's own uploads are already exactly the right videos, so
              these have nothing to narrow and are hidden rather than shown
              looking applicable. */}
          {!channelMode && (
            <>
              <Field label="Region" error={codeErrors.region} hint="ISO code, e.g. US, IN, GB. Excludes only channels that report a different country — many don't set one.">
                <Input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} placeholder="any" maxLength={2} />
              </Field>
              <Field label="Language" error={codeErrors.language} hint="ISO code, e.g. ta, hi, ar, ko, en, es. Real filter using each video's own declared/detected audio language, backed by script/common-word matching and a title dub-label check (e.g. 'Hindi Dubbed') as further evidence.">
                <Input value={relevanceLanguage} onChange={(e) => setRelevanceLanguage(e.target.value)} placeholder="any" maxLength={2} />
              </Field>
            </>
          )}
          <Field label="Min views" hint="Drops videos below this">
            <Input value={minViews} onChange={(e) => setMinViews(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9))} placeholder="0" inputMode="numeric" maxLength={9} className="font-mono nums" />
          </Field>
          <SelectField className="sm:col-span-2" label="Gap strictness" hint={gapMode === 'strict' ? 'Only topics nobody covers at all' : 'Also includes weakly covered topics'}>
            <select value={gapMode} onChange={(e) => setGapMode(e.target.value)} className={cx(controlCls, 'min-h-12 w-full appearance-none pl-5 pr-11')}>
              <option value="inclusive">Uncovered + weak</option>
              <option value="strict">Uncovered only</option>
            </select>
          </SelectField>

          {/* Deep scan widens a SEARCH pool. Channel mode has no search to widen
              -- it already reads every upload in the window. */}
          {DEEP_SCAN && !channelMode && (
            <Checkbox
              checked={deepScan}
              onChange={(e) => setDeepScan(e.target.checked)}
              className="sm:col-span-2 lg:col-span-4"
            >
              <span className="font-medium text-fg">Deep scan</span>
              <span className="mt-0.5 block max-w-[68ch] text-[13px] leading-relaxed text-fg-3">
                Doubles the candidate pool with a second pass sorted by upload date instead of
                view count. Without it the pool is the top 50 by <em>absolute</em> views, which
                quietly filters out the breakout small channel that views-per-subscriber scoring
                is meant to find. Costs one extra search call per format (of 100 a day).
              </span>
            </Checkbox>
          )}
        </Panel>
      </Collapse>
    </form>
  );
}

/** Height-and-fade collapse (grid rows 0fr to 1fr). Children stay mounted, so their state survives; closed, they are inert. */
function Collapse({ open, id, children }) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      // React 18 has no boolean `inert` prop (an empty string warns), so set the attribute directly.
      ref={(el) => { if (el) { if (open) el.removeAttribute('inert'); else el.setAttribute('inert', ''); } }}
      className={cx(
        'grid w-full transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
    >
      <div className="-mx-2 -my-1 min-h-0 overflow-hidden px-2 py-1">{children}</div>
    </div>
  );
}

// Selects and dates share the kit's control look (10px radius, 1px strong hairline).
const controlCls =
  'search-console rounded-full px-5 text-[15px] text-fg disabled:cursor-not-allowed disabled:opacity-55';

// The big field inside the console panel: borderless, the panel is its frame.
const mainInputCls =
  'min-h-12 min-w-0 flex-1 rounded-control bg-transparent px-3.5 text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3 disabled:cursor-not-allowed disabled:opacity-60';

/** A labelled select, wired like the kit's Field (which only knows about Input). */
function SelectField({ label, hint, className, children }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-fg">{label}</label>
      <div className="relative">
        {cloneElement(children, { id, 'aria-describedby': hintId })}
        <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
      </div>
      <p id={hintId} className="mt-2 text-[13px] leading-relaxed text-fg-3">{hint}</p>
    </div>
  );
}
