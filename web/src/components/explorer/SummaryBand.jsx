import { EvidenceMark } from '../ui/index.js';
import { Rank } from '../Bits.jsx';

const cut = (t) => ([...t].length > 170 ? `${[...t].slice(0, 160).join('').replace(/\s+\S*$/, '')}…` : t);

/**
 * The report at a glance: the three strongest unmet requests as large rows,
 * each with the first viewer comment behind it. The tabs below carry everything.
 */
export function SummaryBand({ gaps }) {
  const top = (gaps ?? []).slice(0, 3);
  if (!top.length) return null;
  return (
    <section aria-label="Top unmet requests">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fg-3">Top unmet requests</h2>
      <ol className="mt-2">
        {top.map((g, i) => {
          const quote = g.evidence?.[0]?.text;
          return (
            <li key={i} className="flex gap-4 border-b border-line py-6 last:border-b-0">
              <Rank n={i + 1} />
              <div className="min-w-0">
                <p className="text-[24px] font-semibold leading-snug tracking-[-0.02em] [text-wrap:balance]">{g.question}</p>
                {quote && (
                  <p className="mt-3 text-[16px] leading-[1.55]">
                    <EvidenceMark>&ldquo;{cut(quote)}&rdquo;</EvidenceMark>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
