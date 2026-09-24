import { useState } from 'react';

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

const MODES = [
  { value: 'niche', label: 'Niche' },
  { value: 'channel', label: 'Channel' },
];

function Pills({ options, value, onChange, name, disabled }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg bg-ink-100 p-0.5 dark:bg-ink-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${
            value === o.value
              ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-600 dark:text-white'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchForm({ onSubmit, busy, initial = {} }) {
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
  const [mode, setMode] = useState(initial.channelId ? 'channel' : 'niche');
  const [channelId, setChannelId] = useState(initial.channelId ?? '');
  const [customAfter, setCustomAfter] = useState(
    initial.customAfter ? initial.customAfter.slice(0, 10) : daysAgoISO(14)
  );

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
      <div className="flex flex-col gap-2 sm:flex-row">
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
            placeholder="Enter a niche — e.g. sourdough baking, home lab, watercolour portraits"
            aria-label="Niche or keyword"
            disabled={busy}
            className={mainInputCls}
          />
        )}
        <button
          type="submit"
          disabled={busy || !ready}
          className="rounded-xl bg-ink-900 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-200"
        >
          {busy ? 'Analyzing…' : 'Find gaps'}
        </button>
      </div>

      <p className="text-xs text-ink-400">
        {channelMode
          ? 'Analyses that channel\u2019s own recent uploads and its own viewers\u2019 comments — what your audience keeps asking for and you have not made. Cheaper and more precise than a niche search, because there is no question what the videos are about.'
          : 'Searches YouTube for the niche, then mines the comments on what it finds.'}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
          <span className="font-medium">Analyse</span>
          <Pills name="Analysis mode" options={MODES} value={mode} onChange={setMode} disabled={busy} />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
          <span className="font-medium">Published</span>
          <Pills name="Time window" options={WINDOWS} value={window} onChange={setWindow} disabled={busy} />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
          <span className="font-medium">Format</span>
          <Pills name="Content type" options={TYPES} value={contentType} onChange={setContentType} disabled={busy} />
        </label>

        {window === 'custom' && (
          <label className="rise flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
            <span className="font-medium">Since</span>
            <input
              type="date"
              value={customAfter}
              max={todayISO()}
              min={daysAgoISO(365)}
              onChange={(e) => setCustomAfter(e.target.value)}
              disabled={busy}
              aria-label="Custom range start date"
              className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-ink-400 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="text-sm font-medium text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
        >
          {advanced ? 'Hide filters' : 'More filters'}
        </button>
      </div>

      {advanced && (
        <div className="rise grid gap-4 rounded-xl border border-ink-200 bg-white p-4 sm:grid-cols-4 dark:border-ink-800 dark:bg-ink-900">
          {/* Region and language narrow WHICH videos a niche search returns. A
              channel's own uploads are already exactly the right videos, so
              these have nothing to narrow and are hidden rather than shown
              looking applicable. */}
          {!channelMode && (
            <>
              <Field label="Region" hint="ISO code, e.g. US, IN, GB. Excludes only channels that report a different country — many don't set one.">
                <input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} placeholder="any" maxLength={2} className={inputCls} />
              </Field>
              <Field label="Language" hint="ISO code, e.g. ta, hi, ar, ko, en, es. Real filter using each video's own declared/detected audio language, backed by script/common-word matching and a title dub-label check (e.g. 'Hindi Dubbed') as further evidence.">
                <input value={relevanceLanguage} onChange={(e) => setRelevanceLanguage(e.target.value)} placeholder="any" maxLength={2} className={inputCls} />
              </Field>
            </>
          )}
          <Field label="Min views" hint="Drops videos below this">
            <input value={minViews} onChange={(e) => setMinViews(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Gap strictness" hint={gapMode === 'strict' ? 'Only topics nobody covers at all' : 'Also includes weakly covered topics'}>
            <select value={gapMode} onChange={(e) => setGapMode(e.target.value)} className={inputCls}>
              <option value="inclusive">Uncovered + weak</option>
              <option value="strict">Uncovered only</option>
            </select>
          </Field>

          {/* Deep scan widens a SEARCH pool. Channel mode has no search to widen
              -- it already reads every upload in the window. */}
          {!channelMode && (
          <label className="flex cursor-pointer items-start gap-2.5 sm:col-span-4">
            <input
              type="checkbox"
              checked={deepScan}
              onChange={(e) => setDeepScan(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-ink-900 dark:border-ink-600 dark:accent-white"
            />
            <span>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-300">
                Deep scan
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                Doubles the candidate pool with a second pass sorted by upload date instead of
                view count. Without it the pool is the top 50 by <em>absolute</em> views, which
                quietly filters out the breakout small channel that views-per-subscriber scoring
                is meant to find. Costs one extra 100-unit search per format.
              </span>
            </span>
          </label>
          )}
        </div>
      )}
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800';

const mainInputCls =
  'flex-1 rounded-xl border border-ink-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition-shadow placeholder:text-ink-400 focus:border-ink-400 focus:ring-4 focus:ring-ink-900/5 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:focus:border-ink-500';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <div className="mt-1">{children}</div>
      <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>
    </label>
  );
}
