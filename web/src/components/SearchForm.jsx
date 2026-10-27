import { cloneElement, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { Button } from './ui/Button.jsx';
import { Checkbox } from './ui/Checkbox.jsx';
import { Field, Input } from './ui/Field.jsx';
import { Panel } from './ui/Panel.jsx';

const WINDOWS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const TYPES = [
  { value: 'both', label: 'Both' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'long', label: 'Long-form' },
];

function Pills({ options, value, onChange, name, disabled }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap rounded-control bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-11 rounded-[8px] border px-3.5 text-[15px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55',
            value === o.value
              ? 'border-line-strong bg-surface font-semibold text-fg'
              : 'border-transparent font-medium text-fg-2 hover:bg-hover hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** `mode` ('niche' | 'channel') is fixed by which page rendered this form -- the
 * page itself is the mode switch now, so the form no longer has its own toggle. */
export function SearchForm({ onSubmit, busy, initial = {}, mode = 'niche' }) {
  const [niche, setNiche] = useState(initial.niche ?? '');
  const [window, setWindow] = useState(initial.window ?? '7d');
  const [contentType, setContentType] = useState(initial.contentType ?? 'both');
  // Opened with filters in the URL? Show them, or they look like they were ignored.
  const [advanced, setAdvanced] = useState(
    Boolean(initial.regionCode || initial.relevanceLanguage || initial.minViews || initial.deepScan || (initial.gapMode && initial.gapMode !== 'inclusive'))
  );
  const [regionCode, setRegionCode] = useState(initial.regionCode ?? '');
  const [relevanceLanguage, setRelevanceLanguage] = useState(initial.relevanceLanguage ?? '');
  const [minViews, setMinViews] = useState(initial.minViews ? String(initial.minViews) : '');
  const [gapMode, setGapMode] = useState(initial.gapMode ?? 'inclusive');
  const [deepScan, setDeepScan] = useState(Boolean(initial.deepScan));
  const [channelId, setChannelId] = useState(initial.channelId ?? '');
  const [customAfter, setCustomAfter] = useState(
    initial.customAfter ? initial.customAfter.slice(0, 10) : daysAgoISO(14)
  );

  const filtersId = useId();
  const channelMode = mode === 'channel';
  const ready = channelMode ? channelId.trim().length > 1 : niche.trim().length >= 2;

  const submit = (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    if (window === 'custom' && !customAfter) return;
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
      deepScan: channelMode ? false : deepScan,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* The search console: one panel, the field and the button on one line. */}
      <Panel padding="none" className="flex flex-col gap-2 p-2 sm:flex-row">
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
        <Button type="submit" size="lg" disabled={busy || !ready} className="shrink-0">
          {busy ? 'Analyzing…' : 'Find gaps'}
        </Button>
      </Panel>

      <p className="max-w-[68ch] text-sm leading-relaxed text-fg-3">
        {channelMode
          ? 'Analyses that channel\u2019s own recent uploads and its own viewers\u2019 comments — what your audience keeps asking for and you have not made. Cheaper and more precise than a niche search, because there is no question what the videos are about.'
          : 'Searches YouTube for the niche, then mines the comments on what it finds.'}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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

        {window === 'custom' && (
          <label className="flex items-center gap-3 text-sm text-fg-2">
            <span className="font-medium">Since</span>
            <input
              type="date"
              value={customAfter}
              max={todayISO()}
              min={daysAgoISO(365)}
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
          className="-ml-2"
        >
          {advanced ? 'Hide filters' : 'More filters'}
          <ChevronDown aria-hidden className={cx('h-4 w-4', advanced && 'rotate-180')} />
        </Button>
      </div>

      {advanced && (
        <Panel id={filtersId} className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Region and language narrow WHICH videos a niche search returns. A
              channel's own uploads are already exactly the right videos, so
              these have nothing to narrow and are hidden rather than shown
              looking applicable. */}
          {!channelMode && (
            <>
              <Field label="Region" hint="ISO code, e.g. US, IN, GB. Excludes only channels that report a different country — many don't set one.">
                <Input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} placeholder="any" maxLength={2} />
              </Field>
              <Field label="Language" hint="ISO code, e.g. ta, hi, ar, ko, en, es. Real filter using each video's own declared/detected audio language, backed by script/common-word matching and a title dub-label check (e.g. 'Hindi Dubbed') as further evidence.">
                <Input value={relevanceLanguage} onChange={(e) => setRelevanceLanguage(e.target.value)} placeholder="any" maxLength={2} />
              </Field>
            </>
          )}
          <Field label="Min views" hint="Drops videos below this">
            <Input value={minViews} onChange={(e) => setMinViews(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" className="font-mono nums" />
          </Field>
          <SelectField label="Gap strictness" hint={gapMode === 'strict' ? 'Only topics nobody covers at all' : 'Also includes weakly covered topics'}>
            <select value={gapMode} onChange={(e) => setGapMode(e.target.value)} className={cx(controlCls, 'min-h-12 w-full')}>
              <option value="inclusive">Uncovered + weak</option>
              <option value="strict">Uncovered only</option>
            </select>
          </SelectField>

          {/* Deep scan widens a SEARCH pool. Channel mode has no search to widen
              -- it already reads every upload in the window. */}
          {!channelMode && (
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
      )}
    </form>
  );
}

// Selects and dates share the kit's control look (10px radius, 1px strong hairline).
const controlCls =
  'rounded-control border border-line-strong bg-surface px-3 text-[15px] text-fg transition-colors duration-150 hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-55';

// The big field inside the console panel: borderless, the panel is its frame.
const mainInputCls =
  'min-h-12 min-w-0 flex-1 rounded-control bg-transparent px-3.5 text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3 disabled:cursor-not-allowed disabled:opacity-60';

/** A labelled select, wired like the kit's Field (which only knows about Input). */
function SelectField({ label, hint, children }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-fg">{label}</label>
      {cloneElement(children, { id, 'aria-describedby': hintId })}
      <p id={hintId} className="mt-2 text-[13px] leading-relaxed text-fg-3">{hint}</p>
    </div>
  );
}
