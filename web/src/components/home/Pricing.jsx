import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Check } from 'lucide-react';
import { Badge, Button, SlideGroup, SLIDE_ITEM } from '../ui/index.js';
import WaitlistDialog from './WaitlistDialog.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { cx } from '../../lib/cx.js';

// Prices and limits live here, in one place. Paid plans are not on sale yet (no
// billing, and YouTube quota is shared), so the CTA is a waitlist, and the real
// daily limit stays 3 for everyone until billing exists.
// `regular*` are the planned prices after launch, shown struck through beside the
// launch price. Keep them true: they are what new subscribers will pay later.
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    annual: 0,
    blurb: 'Test a niche before you hit record.',
    features: [
      '3 fresh analyses a day',
      '20 Make it drafts a day',
      'Niche and channel reports',
      'Every comment linked to its video',
      'Saved reports are free to reopen',
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    monthly: 12,
    annual: 9,
    regularMonthly: 14,
    regularAnnual: 11,
    popular: true,
    blurb: 'For channels that upload every week.',
    features: [
      '15 fresh analyses a day',
      '100 Make it drafts a day',
      'Deep scan for bigger niches',
      'Watches: re-run a niche on a schedule',
      'Full history, CSV and Markdown export',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    monthly: 39,
    annual: 31,
    regularMonthly: 45,
    regularAnnual: 36,
    blurb: 'For teams running more than one channel.',
    features: [
      '50 fresh analyses a day',
      'Unlimited Make it drafts',
      '10 watches',
      'Analyze client channels',
      'Priority queue and early access',
    ],
  },
];

// Features that exist in the product but are switched off until the YouTube quota extension
// is approved (see lib/features.js). Shown as "Coming soon" so the page matches the app.
const COMING_SOON = new Set(['Deep scan for bigger niches', 'Watches: re-run a niche on a schedule', '10 watches']);

const usd = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const BILLING = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
];

function BillingSwitch({ value, onChange }) {
  return (
    <SlideGroup
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex gap-0.5 rounded-full bg-surface-2 p-1"
      pillClassName="bg-ink"
      hoverClassName="bg-hover"
    >
      {BILLING.map((b) => (
        <button
          key={b.value}
          type="button"
          role="radio"
          data-slide-item
          data-active={value === b.value}
          aria-checked={value === b.value}
          onClick={() => onChange(b.value)}
          className={cx(
            SLIDE_ITEM,
            'min-h-10 rounded-full px-5 text-[15px] transition-colors duration-300',
            value === b.value ? 'font-semibold text-on-ink' : 'font-medium text-fg-2 hover:text-fg'
          )}
        >
          {b.label}
        </button>
      ))}
    </SlideGroup>
  );
}

/** Pricing: three plans, the middle one lifted, prices that count when you switch period. */
export default function Pricing() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);
  const reduced = useReducedMotion();
  const [period, setPeriod] = useState('monthly');
  const [waitlist, setWaitlist] = useState(null);

  return (
    <section id="pricing" aria-labelledby="pricing-h" className="mx-auto mt-[72px] max-w-[1200px] px-5 sm:px-10 md:mt-[120px] lg:mt-[160px]">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-info-fg">Pricing</p>
        <h2 id="pricing-h" className="mx-auto mt-3 max-w-[640px] text-[clamp(2rem,1.4rem+1.9vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance">
          Free to start. Grow when your channel does.
        </h2>
        <p className="mx-auto mt-4 max-w-[560px] text-base leading-[1.55] text-fg-2 md:text-lg">
          Starter is free today. Creator and Studio are not on sale yet: join the waitlist and we will email you when they open.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <BillingSwitch value={period} onChange={setPeriod} />
          <Badge tone="good">Save 20% annually</Badge>
        </div>
      </div>

      <ul className="mt-12 grid list-none items-stretch gap-4 md:grid-cols-3 md:gap-5">
        {PLANS.map((plan, i) => {
          const price = period === 'annual' ? plan.annual : plan.monthly;
          const regular = period === 'annual' ? plan.regularAnnual : plan.regularMonthly;
          return (
            <motion.li
              key={plan.id}
              initial={reduced ? false : { opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ type: 'spring', stiffness: 110, damping: 26, delay: reduced ? 0 : i * 0.08 }}
              className={cx(
                'relative flex flex-col rounded-panel bg-surface p-7 shadow-card md:max-lg:p-5',
                plan.popular ? 'md:-translate-y-3 md:shadow-[0_30px_60px_-30px_rgba(15,30,46,0.35)]' : 'md:mt-3',
                plan.popular && 'ring-1 ring-fg/70'
              )}
            >
              {plan.popular && (
                <Badge tone="info" className="absolute right-5 top-5">Most popular</Badge>
              )}
              <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-fg">{plan.name}</h3>
              <p className="mt-1.5 min-h-[3lh] text-[15px] leading-relaxed text-fg-2">{plan.blurb}</p>

              <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                {regular && (
                  <s className="nums mr-1 text-[24px] md:max-lg:mb-1 md:max-lg:basis-full md:max-lg:text-[20px] font-medium leading-none tracking-[-0.02em] text-fg-3 decoration-[1.5px]">
                    <span className="sr-only">Regular price </span>{usd(regular)}
                  </s>
                )}
                <NumberFlow
                  value={price}
                  format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                  transformTiming={{ duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                  className="nums text-[44px] font-semibold md:max-lg:text-[34px] leading-none tracking-[-0.03em] text-fg"
                />
                <span className="text-[15px] text-fg-3">{price === 0 ? 'forever' : '/ month'}</span>
              </p>
              <p className="mt-1.5 flex min-h-[1lh] items-center gap-2 text-[13px] text-fg-3">
                {regular && <Badge tone="neutral">Launch price</Badge>}
                {price === 0 ? 'No card needed' : period === 'annual' ? 'billed annually' : 'billed monthly'}
              </p>

              <ul className="mt-6 flex-1 list-none space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[15px] leading-snug text-fg">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" strokeWidth={2} />
                    <span>
                      {f}
                      {COMING_SOON.has(f) && <Badge tone="neutral" className="ml-2 align-middle">Coming soon</Badge>}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.id === 'starter' ? (
                <Button href={signedIn ? '/explore' : '/signup'} variant="secondary" size="lg" className="mt-8 w-full">
                  {signedIn ? 'Open the Explorer' : 'Start free'}
                </Button>
              ) : (
                <Button onClick={() => setWaitlist(plan)} variant={plan.popular ? 'primary' : 'secondary'} size="lg" className="mt-8 w-full">
                  Join the waitlist
                </Button>
              )}
            </motion.li>
          );
        })}
      </ul>

      <p className="mx-auto mt-6 max-w-[620px] text-center text-[13px] leading-[1.55] text-fg-3">
        Fresh analyses count toward your daily allowance. Reopening a saved report costs nothing on any plan.
      </p>

      <WaitlistDialog plan={waitlist} onClose={() => setWaitlist(null)} defaultEmail={user?.email ?? ''} />
    </section>
  );
}
