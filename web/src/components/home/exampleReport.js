/**
 * The labelled example shown in the homepage panel when the server has no
 * featured report (or could not be reached). It is copy from the approved
 * design, never presented as real: the panel carries an "Example data" badge,
 * the video link is plain text, and no date or tab counts are shown.
 */
export const EXAMPLE_VIEW = {
  example: true,
  niche: 'sourdough starter',
  windowLabel: 'last 7 days',
  formatLabel: 'long-form and Shorts',
  asOf: null,
  asOfISO: null,
  counts: null,
  gaps: [
    {
      question: 'Can you actually eat a living starter?',
      strength: 'high',
      coverage: 'none',
      evidenceCount: 6,
      distinctVideos: 4,
      demandScore: 26.1,
      suggestedTitle: 'Can you eat sourdough starter? What’s safe and what isn’t',
      evidence: [
        { text: 'can i cook it?', likes: 2, videoTitle: 'Example video title', href: null },
        { text: 'Is it safe to eat the starter raw?', likes: 3, videoTitle: 'Example video title', href: null },
      ],
    },
    {
      question: 'How do you keep one alive for years?',
      coverage: 'weak',
      evidenceCount: 5,
      distinctVideos: 4,
      evidence: [],
    },
    {
      question: 'Why does mine smell like nail polish?',
      coverage: 'none',
      evidenceCount: 4,
      distinctVideos: 3,
      evidence: [],
    },
  ],
};

const video = 'Example video title';
const quote = (text, likes) => ({ text, likes, videoTitle: video, href: null });
const gap = (question, strength, coverage, evidenceCount, distinctVideos, demandScore, suggestedTitle, evidence) => ({
  question, strength, coverage, evidenceCount, distinctVideos, demandScore, suggestedTitle, evidence,
});
const topic = (label, heatScore, summary) => ({ label, heatScore, summary });
const complaint = (label, severity, evidenceCount, detail, fix) => ({ label, severity, evidenceCount, detail, fix });
const avoid = (label, reason) => ({ label, reason });
const LABELS = { example: true, windowLabel: 'last 7 days', formatLabel: 'long-form and Shorts', asOf: null, asOfISO: null, counts: null };

/** The reports in the homepage's small app. All made up, and the window labels them "Example data". */
export const EXAMPLE_REPORTS = [
  {
    ...LABELS,
    niche: 'Sourdough starter',
    age: '2h',
    gaps: [
      EXAMPLE_VIEW.gaps[0],
      gap('How do you keep one alive for years?', 'medium', 'weak', 5, 4, 19.4, 'Keeping a sourdough starter alive for years, without daily feeds', [
        quote('mine died the second i went on holiday', 4),
        quote('how often do you really have to feed it?', 2),
      ]),
      gap('Why does mine smell like nail polish?', 'medium', 'none', 4, 3, 16.8, 'Why your starter smells like nail polish, and how to fix it', [
        quote('smells like acetone, is it ruined??', 5),
        quote('mine does this too, nobody explains why', 1),
      ]),
      gap('Is rye really better than white flour?', 'low', 'weak', 4, 2, 11.2, 'Rye vs white flour: which starter actually wins?', [
        quote('everyone says rye but never says why', 3),
      ]),
    ],
    topics: [
      topic('Starters from scratch', 71, 'Day-by-day diaries of a first starter, from flour and water to a first bake.'),
      topic('Discard recipes', 58, 'Quick bakes that use up what would be thrown away.'),
    ],
    objections: [
      complaint('Skipping the failures', 'high', 5, 'Viewers say every video shows a perfect rise and never what to do when it goes wrong.', 'Show one failed batch and how you rescued it.'),
      complaint('Grams never given', 'medium', 3, 'Commenters ask for weights because cups give them a different dough.', 'Put the weights on screen and in the description.'),
    ],
    avoid: [
      avoid('Another basic loaf tutorial', 'Plenty of strong videos already cover it, so a new one has little room.'),
      avoid('Bread-maker recipes', 'Few viewers here use one, and those videos draw little conversation.'),
    ],
  },
  {
    ...LABELS,
    niche: 'Budget van life',
    age: '5h',
    gaps: [
      gap('Where do you legally sleep in a city?', 'high', 'none', 7, 5, 28.3, 'Where you can legally sleep in a van, city by city', [
        quote('every video skips the part where you get knocked on at 2am', 6),
        quote('is it even legal to park overnight here?', 3),
      ]),
      gap('What does a year really cost?', 'high', 'weak', 6, 4, 24.7, 'What a year in a van really cost me, every receipt', [
        quote('nobody ever counts the repairs', 8),
      ]),
      gap('How do you stay warm without a heater?', 'medium', 'none', 4, 3, 15.9, 'Staying warm in a van with no heater', [
        quote('winter is the part no one films', 2),
      ]),
    ],
    topics: [
      topic('Under-a-grand builds', 66, 'Cheap conversions that use second-hand parts and a weekend of work.'),
      topic('First-week diaries', 52, 'Honest accounts of the first days on the road.'),
    ],
    objections: [
      complaint('Costs left out', 'high', 6, 'Viewers feel the budgets ignore fuel, repairs and insurance.', 'Show the full running cost, not only the build.'),
    ],
    avoid: [
      avoid('Luxury sprinter tours', 'Viewers here say these feel out of reach, and the space is crowded.'),
    ],
  },
  {
    ...LABELS,
    niche: 'Mechanical keyboards',
    age: '1d',
    gaps: [
      gap('Which switches are quiet enough for an office?', 'high', 'weak', 8, 6, 30.1, 'The quietest switches, tested in a real office', [
        quote('my coworkers would kill me, what is actually quiet?', 7),
      ]),
      gap('Is hot-swap worth paying more for?', 'medium', 'none', 5, 4, 20.2, 'Is hot-swap worth the extra money?', [
        quote('i can never tell if i need it or not', 3),
      ]),
      gap('How do you fix one sticky key?', 'medium', 'none', 4, 2, 14.6, 'Fix a sticky key in five minutes', [
        quote('one key feels off and i have no idea why', 2),
      ]),
    ],
    topics: [
      topic('Budget 75% boards', 69, 'Affordable compact boards compared by sound and feel.'),
      topic('Sound tests', 61, 'Typing tests with no talking, just the keys.'),
    ],
    objections: [
      complaint('Sound tests with bad mics', 'medium', 4, 'Viewers say the recorded sound does not match the real thing.', 'Say which mic you used and how far away it was.'),
    ],
    avoid: [
      avoid('Unboxing with no typing', 'Viewers click away when they cannot hear the board.'),
    ],
  },
  {
    ...LABELS,
    niche: 'Cozy gaming',
    age: '2d',
    gaps: [
      gap('Which cozy games respect your time?', 'high', 'none', 6, 4, 25.5, 'Cozy games you can enjoy in 15 minutes', [
        quote('i only have 20 minutes after work, what fits?', 5),
      ]),
      gap('What is good on a low-spec laptop?', 'medium', 'weak', 5, 3, 18.3, 'The best cozy games for a cheap laptop', [
        quote('all these lists need a good pc', 4),
      ]),
    ],
    topics: [
      topic('Autumn game picks', 63, 'Seasonal lists with warm, slow games for shorter days.'),
      topic('Desk setup tours', 49, 'Soft-lit setups built around a handheld or a small screen.'),
    ],
    objections: [
      complaint('Lists that all look the same', 'medium', 3, 'Commenters see the same five games in every list.', 'Lead with a game most lists miss.'),
    ],
    avoid: [
      avoid('Top ten best-sellers', 'Viewers have seen these lists already, and many strong ones exist.'),
    ],
  },
];

const WINDOWS = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' };
const FORMATS = { both: 'long-form and Shorts', shorts: 'Shorts', long: 'long-form' };

const MAX_QUOTE = 220;
const clip = (s) => {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > MAX_QUOTE ? `${t.slice(0, MAX_QUOTE).trimEnd()}…` : t;
};

/** "3h" or "2d": how old a report is, for the rail. */
function ageText(date) {
  const hours = Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return 'now';
  return hours < 24 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
}

/** Turns the /api/featured payload into what the panel draws. Returns null when it is unusable. */
export function toView(featured) {
  const gaps = Array.isArray(featured?.gaps) ? featured.gaps.slice(0, 3).filter((g) => g?.question) : [];
  if (!gaps.length) return null;
  const titles = featured.videoTitles ?? {};
  const date = featured.generatedAt ? new Date(featured.generatedAt) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  return {
    example: false,
    niche: (featured.query?.niche ?? '').replace(/^./, (c) => c.toUpperCase()),
    windowLabel: WINDOWS[featured.query?.window] ?? null,
    formatLabel: FORMATS[featured.query?.contentType] ?? null,
    asOf: validDate ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
    asOfISO: validDate ? date.toISOString() : null,
    age: validDate ? ageText(date) : null,
    counts: {
      topics: Number.isFinite(featured.stats?.topicsFound) ? featured.stats.topicsFound : (featured.topics?.length ?? null),
      gaps: Number.isFinite(featured.stats?.gapsFound) ? featured.stats.gapsFound : gaps.length,
    },
    gaps: gaps.map((g) => ({
      question: g.question,
      strength: g.demandStrength,
      coverage: g.coverage,
      evidenceCount: g.evidenceCount,
      distinctVideos: g.distinctVideos,
      demandScore: Number.isFinite(g.demandScore) ? Math.round(g.demandScore * 10) / 10 : null,
      suggestedTitle: g.suggestedTitle,
      evidence: (g.evidence ?? []).filter((e) => e?.text).map((e) => ({
        text: clip(e.text),
        likes: Number.isFinite(e.likes) ? e.likes : null,
        videoTitle: titles[e.videoId] ?? null,
        href: e.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(e.videoId)}` : null,
      })),
    })),
    topics: (featured.topics ?? []).filter((t) => t?.label).map(({ label, heatScore, summary }) => ({ label, heatScore, summary })),
    objections: (featured.objections ?? []).filter((o) => o?.label),
    avoid: (featured.avoid ?? []).filter((a) => a?.label),
  };
}
