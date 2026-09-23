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

export function SearchForm({ onSubmit, busy }) {
  const [niche, setNiche] = useState('');
  const [window, setWindow] = useState('7d');
  const [contentType, setContentType] = useState('both');
  const [advanced, setAdvanced] = useState(false);
  const [regionCode, setRegionCode] = useState('');
  const [relevanceLanguage, setRelevanceLanguage] = useState('');
  const [minViews, setMinViews] = useState('');
  const [gapMode, setGapMode] = useState('inclusive');
  const [customAfter, setCustomAfter] = useState(daysAgoISO(14));

  const submit = (e) => {
    e.preventDefault();
    if (niche.trim().length < 2 || busy) return;
    if (window === 'custom' && !customAfter) return;
    onSubmit({
      niche: niche.trim(),
      window,
      // Sent as a UTC timestamp so the server is not guessing the user's zone.
      customAfter: window === 'custom' ? new Date(`${customAfter}T00:00:00Z`).toISOString() : undefined,
      contentType,
      gapMode,
      minViews: Number(minViews) || 0,
      regionCode: regionCode.trim() || undefined,
      relevanceLanguage: relevanceLanguage.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Enter a niche — e.g. sourdough baking, home lab, watercolour portraits"
          aria-label="Niche or keyword"
          disabled={busy}
          className="flex-1 rounded-xl border border-ink-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition-shadow placeholder:text-ink-400 focus:border-ink-400 focus:ring-4 focus:ring-ink-900/5 disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:focus:border-ink-500"
        />
        <button
          type="submit"
          disabled={busy || niche.trim().length < 2}
          className="rounded-xl bg-ink-900 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-200"
        >
          {busy ? 'Analyzing…' : 'Find gaps'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
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
          <Field label="Region" hint="ISO code, e.g. US, IN, GB. Excludes only channels that report a different country — many don't set one.">
            <input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} placeholder="any" maxLength={2} className={inputCls} />
          </Field>
          <Field label="Language" hint="ISO code, e.g. ta, hi, ar, ko, en, es. Real filter using each video's own declared/detected audio language, backed by script or common-word matching as a second check for common languages.">
            <input value={relevanceLanguage} onChange={(e) => setRelevanceLanguage(e.target.value)} placeholder="any" maxLength={2} className={inputCls} />
          </Field>
          <Field label="Min views" hint="Drops videos below this">
            <input value={minViews} onChange={(e) => setMinViews(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Gap strictness" hint={gapMode === 'strict' ? 'Only topics nobody covers at all' : 'Also includes weakly covered topics'}>
            <select value={gapMode} onChange={(e) => setGapMode(e.target.value)} className={inputCls}>
              <option value="inclusive">Uncovered + weak</option>
              <option value="strict">Uncovered only</option>
            </select>
          </Field>
        </div>
      )}
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <div className="mt-1">{children}</div>
      <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>
    </label>
  );
}
