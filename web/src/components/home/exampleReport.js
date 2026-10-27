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

const WINDOWS = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' };
const FORMATS = { both: 'long-form and Shorts', shorts: 'Shorts', long: 'long-form' };

const MAX_QUOTE = 220;
const clip = (s) => {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > MAX_QUOTE ? `${t.slice(0, MAX_QUOTE).trimEnd()}…` : t;
};

/** Turns the /api/featured payload into what the panel draws. Returns null when it is unusable. */
export function toView(featured) {
  const gaps = Array.isArray(featured?.gaps) ? featured.gaps.slice(0, 3).filter((g) => g?.question) : [];
  if (!gaps.length) return null;
  const titles = featured.videoTitles ?? {};
  const date = featured.generatedAt ? new Date(featured.generatedAt) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  return {
    example: false,
    niche: featured.query?.niche ?? '',
    windowLabel: WINDOWS[featured.query?.window] ?? null,
    formatLabel: FORMATS[featured.query?.contentType] ?? null,
    asOf: validDate ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
    asOfISO: validDate ? date.toISOString() : null,
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
  };
}
