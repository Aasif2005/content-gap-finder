import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, windowToPublishedAfter } from '../src/services/youtube.js';
import { parseCommentIndex, selectComments, groundGaps, truncate } from '../src/services/analyze.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, stripHashtags, untrustedVideoIds, nicheKeywords } from '../src/lib/relevance.js';
import { hasScriptFilter, matchesLanguageScript, hasLatinHeuristic, matchesLatinLanguage } from '../src/lib/language.js';
import { scoreVideos, scoreTopic } from '../src/lib/heat.js';

describe('parseDuration', () => {
  test('parses the ISO-8601 forms YouTube actually returns', () => {
    assert.equal(parseDuration('PT45S'), 45);
    assert.equal(parseDuration('PT1M30S'), 90);
    assert.equal(parseDuration('PT2H5M1S'), 7501);
    assert.equal(parseDuration('P1DT2H'), 93600);
  });
  test('returns 0 for missing or malformed values rather than NaN', () => {
    assert.equal(parseDuration(undefined), 0);
    assert.equal(parseDuration('garbage'), 0);
  });
});

describe('windowToPublishedAfter', () => {
  test('maps a window to an ISO timestamp in the past', () => {
    const iso = windowToPublishedAfter('7d');
    const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    assert.ok(days > 6.9 && days < 7.1, `expected ~7 days, got ${days}`);
  });
  test('rejects an unknown window', () => {
    assert.throws(() => windowToPublishedAfter('1y'), /Unknown time window/);
  });

  test('uses the supplied date for a custom range', () => {
    const iso = windowToPublishedAfter('custom', '2026-01-15T00:00:00Z');
    assert.equal(iso, '2026-01-15T00:00:00.000Z');
  });

  test('rejects a custom range with an unparseable date', () => {
    assert.throws(() => windowToPublishedAfter('custom', 'not-a-date'), /valid start date/);
    assert.throws(() => windowToPublishedAfter('custom', undefined), /valid start date/);
  });
});

describe('parseCommentIndex', () => {
  // deepseek-flash cites 3; deepseek-v4-pro cites "c3". Both must resolve, or a
  // model swap silently empties every gap's evidence.
  test('accepts number, numeric string and cN forms', () => {
    assert.equal(parseCommentIndex(3), 3);
    assert.equal(parseCommentIndex('3'), 3);
    assert.equal(parseCommentIndex('c3'), 3);
    assert.equal(parseCommentIndex('C12'), 12);
    assert.equal(parseCommentIndex(' c7 '), 7);
  });
  test('rejects anything it cannot resolve', () => {
    for (const bad of ['abc', '', 'c', null, undefined, 3.5]) {
      assert.equal(parseCommentIndex(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('scoreVideos', () => {
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  const videos = [
    { videoId: 'small', channelId: 'c1', publishedAt: day(1), views: 50_000, likes: 6_000, comments: 900 },
    { videoId: 'big',   channelId: 'c2', publishedAt: day(2), views: 400_000, likes: 3_000, comments: 120 },
    { videoId: 'dud',   channelId: 'c2', publishedAt: day(3), views: 300_000, likes: 500,  comments: 40 },
    { videoId: 'stale', channelId: 'c3', publishedAt: day(28), views: 80_000, likes: 400,  comments: 30 },
  ];
  const channels = new Map([
    ['c1', { subscribers: 9_000 }],
    ['c2', { subscribers: 9_000_000 }],
    ['c3', { subscribers: 150_000 }],
  ]);

  test('ranks a small-channel breakout above a big channel coasting', () => {
    const [top] = scoreVideos(videos, channels);
    assert.equal(top.videoId, 'small');
  });

  test('flags high-reach low-engagement videos for the avoid list', () => {
    const scored = scoreVideos(videos, channels);
    assert.equal(scored.find((v) => v.videoId === 'dud').lowEngagementOutlier, true);
    assert.equal(scored.find((v) => v.videoId === 'small').lowEngagementOutlier, false);
  });

  test('never emits NaN, even when likes and comments are hidden', () => {
    const hidden = [{ videoId: 'h', channelId: 'c1', publishedAt: day(1), views: 0, likes: 0, comments: 0 }];
    const [only] = scoreVideos(hidden, new Map([['c1', { subscribers: 0 }]]));
    assert.ok(Number.isFinite(only.heat), `heat was ${only.heat}`);
  });

  test('treats a hidden subscriber count as small rather than as zero', () => {
    const chans = new Map([['c1', { subscribers: 0, hiddenSubscribers: true }]]);
    const [v] = scoreVideos([videos[0]], chans);
    assert.ok(Number.isFinite(v.signals.outperformance));
  });
});

describe('scoreTopic', () => {
  test('returns a zero score for an empty cluster instead of NaN', () => {
    assert.equal(scoreTopic([]).heatScore, 0);
  });
  test('rewards a topic that several distinct channels are winning on', () => {
    const mk = (id, ch) => ({ videoId: id, channelId: ch, heat: 60, views: 1000, signals: { engagementRate: 0.02 } });
    const oneChannel = scoreTopic([mk('a', 'c1'), mk('b', 'c1'), mk('c', 'c1')]);
    const manyChannels = scoreTopic([mk('a', 'c1'), mk('b', 'c2'), mk('c', 'c3')]);
    assert.ok(manyChannels.heatScore > oneChannel.heatScore);
    assert.equal(manyChannels.breadth, 3);
  });
});

describe('selectComments', () => {
  test("excludes the uploader's own comments and replies", () => {
    const selected = selectComments(
      {
        v1: [
          { text: 'How do I fix a gummy crumb?', likes: 10, replyCount: 1, authorChannelId: 'viewer', replies: [
            { text: 'Can you cover this too?', likes: 2, authorChannelId: 'viewer2' },
            { text: 'Great question! How about I make a video on it?', likes: 5, authorChannelId: 'owner' },
          ] },
          { text: 'Recipe is in the description, how easy is that?', likes: 99, replyCount: 0, authorChannelId: 'owner', replies: [] },
        ],
      },
      { ownerByVideo: { v1: 'owner' } }
    );
    const texts = selected.map((c) => c.text);
    assert.ok(texts.some((t) => t.includes('gummy crumb')));
    assert.ok(texts.some((t) => t.includes('cover this too')));
    assert.ok(!texts.some((t) => t.includes('Recipe is in the description')), 'uploader comment leaked in');
    assert.ok(!texts.some((t) => t.includes('make a video on it')), 'uploader reply leaked in');
  });

  test('assigns stable indexes the model can cite back', () => {
    const selected = selectComments({ v1: [{ text: 'how do I proof?', likes: 1, replyCount: 0, replies: [] }] });
    assert.equal(selected[0].index, 0);
  });
});

describe('groundGaps', () => {
  const comments = [
    { index: 0, videoId: 'v1', text: 'how do I fix this?', likes: 100, replyCount: 2 },
    { index: 1, videoId: 'v2', text: 'same question here', likes: 50, replyCount: 0 },
  ];

  test('drops gaps whose citations do not resolve to real comments', () => {
    const grounded = groundGaps(
      [{ question: 'fabricated', evidence_comment_indexes: [98, 99], demand_strength: 'high', coverage: 'none' }],
      comments
    );
    assert.equal(grounded.length, 0);
  });

  test('keeps a gap grounded in real comments and scores its demand', () => {
    const [gap] = groundGaps(
      [{ question: 'real', evidence_comment_indexes: [0, 1], demand_strength: 'high', coverage: 'none' }],
      comments
    );
    assert.equal(gap.evidenceCount, 2);
    assert.equal(gap.distinctVideos, 2);
    assert.ok(gap.demandScore > 0);
  });

  test('resolves cN-style citations identically to numeric ones', () => {
    const [gap] = groundGaps(
      [{ question: 'real', evidence_comment_indexes: ['c0', 'c1'], demand_strength: 'medium', coverage: 'weak' }],
      comments
    );
    assert.equal(gap.evidenceCount, 2);
  });

  test('ranks a widely-voiced gap above a narrowly-voiced one', () => {
    const many = [...comments, { index: 2, videoId: 'v3', text: 'me too', likes: 200, replyCount: 0 }];
    const ranked = groundGaps(
      [
        { question: 'narrow', evidence_comment_indexes: [0, 1], demand_strength: 'low', coverage: 'weak' },
        { question: 'wide', evidence_comment_indexes: [0, 1, 2], demand_strength: 'high', coverage: 'none' },
      ],
      many
    );
    assert.equal(ranked[0].question, 'wide');
  });
});

describe('relevance', () => {
  test('flags a topic with no niche keyword anywhere in it', () => {
    const offTopic = {
      label: 'Motorcycle barn finds',
      summary: 'restoring old bikes',
      videos: [{ title: 'vintage motorcycle restoration', channelTitle: 'BikeGuy' }],
    };
    const rel = checkTopicRelevance('sourdough baking', offTopic);
    assert.equal(rel.relevant, false);
    assert.deepEqual(rel.matched, []);
  });

  test('credits relevance found only in the evidence videos, not the topic label', () => {
    const topic = {
      label: 'Electrolysis tank demos',
      summary: 'building rigs',
      videos: [{ title: 'cast iron restoration via electrolysis', channelTitle: 'z' }],
    };
    const rel = checkTopicRelevance('cast iron restoration', topic);
    assert.equal(rel.relevant, true);
    assert.equal(rel.matchedIn, 'videos only');
  });

  test('does not false-flag a niche whose words are all short/stopwords', () => {
    // "zz" and "qq" are under the 3-char floor, contain no digit, and are not
    // in the short-abbreviation allowlist -- keywords end up empty, and the
    // check should decline to judge rather than flag everything irrelevant.
    assert.deepEqual(nicheKeywords('zz qq'), []);
    const rel = checkTopicRelevance('zz qq', { label: 'anything', videos: [] });
    assert.equal(rel.relevant, true);
  });

  test('keeps a short pure-letter abbreviation that matters to the niche', () => {
    // Real case: "EV charging" kept only "charging" -- "EV" itself, the more
    // distinctive word, was silently dropped by the 3-char floor.
    assert.deepEqual(nicheKeywords('EV charging'), ['ev', 'charging']);
    assert.deepEqual(nicheKeywords('AR filters'), ['ar', 'filters']);
  });

  test('matches a short abbreviation only at a word boundary, never as a bare substring', () => {
    // A raw "ev" substring check would wrongly "match" inside every, never,
    // level, believe -- all common English words with no connection to EVs.
    const noise = { question: 'x', evidence: [{ text: 'I never really believe every review of this' }] };
    assert.equal(checkGapRelevance('EV charging', noise).matched.includes('ev'), false);

    const real = { question: 'x', evidence: [{ text: 'how much does an EV actually cost to own?' }] };
    assert.equal(checkGapRelevance('EV charging', real).matched.includes('ev'), true);
  });

  test('stemming still finds inflected forms of the niche word', () => {
    // Real case: niche "3D printing" only matched literal "printing", never
    // the "print" / "prints" / "printed" audience comments actually used.
    const gap = { question: 'How much does it cost to print these, and can I buy one?', evidence: [{ text: 'where do you get stl files for your prints' }] };
    assert.equal(checkGapRelevance('3D printing', gap).relevant, true);
  });

  test('gap relevance checks question and evidence text', () => {
    const gap = { question: 'How do I fix a gummy sourdough crumb?', explanation: '', evidence: [{ text: 'my starter is dead' }] };
    assert.equal(checkGapRelevance('sourdough baking', gap).relevant, true);
  });

  test('does not credit the niche keyword when it only appears in the model\'s own explanation', () => {
    // Real case: 3 comments on a "thalapathy vijay" run asked the channel to
    // stop covering Vijay/Bigg Boss and cover unrelated geopolitics instead.
    // None of the comments -- or the gap's own question -- mention Vijay. The
    // model's explanation said "the Vijay-VJS controversy video" (describing
    // which video the comments sit under), which let the gap pass as relevant
    // even though the actual demand has nothing to do with the niche.
    const gap = {
      question: 'Anna, geopolitics cheyyandi, UK and Europe video cheyandi',
      explanation: 'Comments on the Vijay-VJS controversy video ask for unrelated world-affairs content.',
      evidence: [
        { text: 'UK and Europe video cheyandi please, war between Europe and Russia antunnaru' },
        { text: 'Anna Geopolitics cheyyandi, e bigboss gurinchi vadhuu time waste' },
      ],
    };
    const rel = checkGapRelevance('thalapathy vijay', gap);
    assert.equal(rel.relevant, false);
    assert.deepEqual(rel.matched, []);
  });

  test('summarizeRelevance counts flagged as total minus relevant', () => {
    const s = summarizeRelevance([{ relevant: true }, { relevant: true }, { relevant: false }]);
    assert.deepEqual(s, { total: 3, relevant: 2, flagged: 1, rate: 67 });
  });
});

describe('tag hijacking', () => {
  // Verbatim from a real "thalapathy vijay" run: a Mamitha Baiju dance edit that
  // stuffed Vijay/Thalapathy into its hashtags and tags and pulled 12.4M views
  // into the result set, then became the #1 "trending topic".
  const hijacked = {
    title: 'Female Version Leaked😈 #mamithabaiju #vijay #shorts #viral #trending #shortvideo',
    channelTitle: 'Cine 360',
    description: 'Welcome to CINE 360 - The Ultimate Tamil Cinema Hub!',
    tags: ['mamitha dance', 'thalapathy', 'thalapathy status', 'vijay metro scene', 'vijay songs'],
  };

  test('flags a video whose niche match is only tag decoration', () => {
    const r = checkTagHijack('thalapathy vijay', hijacked);
    assert.equal(r.suspect, true);
    assert.deepEqual(r.inProse, []);
    assert.ok(r.inTagsOnly.includes('vijay'));
  });

  test('does not flag a video that names the niche in its title prose', () => {
    const legit = { title: "Jason Sanjay's First Reaction to Vijay Becoming CM", channelTitle: 'Film Point', tags: [] };
    const r = checkTagHijack('thalapathy vijay', legit);
    assert.equal(r.suspect, false);
    assert.deepEqual(r.inProse, ['vijay']);
  });

  test('marks a topic tag-suspect when every backing video is tag-only', () => {
    const rel = checkTopicRelevance('thalapathy vijay', {
      label: 'Mamitha Baiju Dance Edits',
      summary: 'Dance edits branded under the Vijay hashtag.',
      videos: [hijacked],
    });
    // The literal word "vijay" is in the summary, so the keyword check still
    // passes -- tagSuspect is what actually catches this case.
    assert.equal(rel.relevant, true);
    assert.equal(rel.tagSuspect, true);
  });

  test('stripHashtags leaves the title prose behind', () => {
    assert.equal(stripHashtags('Female Version Leaked #vijay #shorts'), 'Female Version Leaked');
    assert.equal(stripHashtags('No hashtags here'), 'No hashtags here');
  });
});

describe('untrustedVideoIds', () => {
  // Real bug: a "SOORI AS HERO #thalapathyvijay" Short (a different actor,
  // tag-stuffed) was correctly excluded from every topic by clustering, but
  // comment-fetching runs by heat score alone -- upstream of any relevance
  // check -- so its comments still reached gap mining and became a "gap"
  // about an unrelated film rivalry that has nothing to do with the niche.
  const videos = [
    { videoId: 'soori', tagOnlyMatch: true },   // tag-only, never used by clustering
    { videoId: 'tncm', tagOnlyMatch: true },    // tag-only, but clustering DID use it
    { videoId: 'clean', tagOnlyMatch: false },  // has the niche in its own title
  ];

  test('flags a tag-only video clustering never vouched for', () => {
    const untrusted = untrustedVideoIds(videos, new Set(['tncm']));
    assert.deepEqual([...untrusted], ['soori']);
  });

  test('trusts a tag-only video once clustering used it as evidence', () => {
    const untrusted = untrustedVideoIds(videos, new Set(['tncm', 'soori']));
    assert.equal(untrusted.has('tncm'), false);
    assert.equal(untrusted.has('soori'), false);
  });

  test('never flags a video that was not tag-only in the first place', () => {
    const untrusted = untrustedVideoIds(videos, new Set());
    assert.equal(untrusted.has('clean'), false);
  });
});

describe('language script detection', () => {
  // Real case: regionCode=IN & relevanceLanguage=ta on a "gym fitness" search
  // returned nearly the same channel set as no language param at all -- none
  // of them actually in Tamil. YouTube's relevanceLanguage is a ranking hint,
  // not a filter (its own docs say so); this is what makes it a real one.
  test('detects Tamil script and rejects plain English', () => {
    assert.equal(matchesLanguageScript('ta', 'இத பண்ணுங்க போதும்'), true);
    assert.equal(matchesLanguageScript('ta', 'Beginners gym workout tips'), false);
  });

  test('detects script inside mixed-script text', () => {
    assert.equal(matchesLanguageScript('ta', 'BigleeTamil - 2g Protein + 6 Days Gym ஏன் உங்கள்'), true);
  });

  test('returns null, not false, for a language with no distinctive script', () => {
    // English/Spanish/French/German all share the Latin alphabet -- script
    // detection cannot tell them apart, and must say so rather than silently
    // rejecting everything.
    assert.equal(matchesLanguageScript('en', 'anything at all'), null);
    assert.equal(hasScriptFilter('en'), false);
  });

  test('hasScriptFilter is true exactly for languages with a mapping', () => {
    assert.equal(hasScriptFilter('ta'), true);
    assert.equal(hasScriptFilter('hi'), true);
    assert.equal(hasScriptFilter('ar'), true);
    assert.equal(hasScriptFilter('es'), false);
    assert.equal(hasScriptFilter(undefined), false);
  });
});

describe('Latin-script common-word language heuristic', () => {
  // Latin-script languages share one alphabet, so script detection is blind
  // between them -- this is the fallback, and it only works comparatively.
  test('confirms a language with enough distinct common words', () => {
    assert.equal(
      matchesLatinLanguage('en', 'The video shows how you fix this with your friends, and what to expect'),
      true
    );
    assert.equal(
      matchesLatinLanguage('es', 'El video muestra cómo hacer esto, pero también es para principiantes'),
      true
    );
  });

  test('rejects confidently-different-language text even though the target itself scored zero', () => {
    // Real risk this guards against: gating on the target's OWN score alone
    // would call 0-hits-for-English on plainly Spanish text "not enough
    // signal" and leave it undecided, when it is actually a confident
    // mismatch -- the best score across the whole modeled set decides
    // whether there's enough text to judge at all, not the target alone.
    assert.equal(
      matchesLatinLanguage('en', 'El video muestra cómo hacer esto, pero también es para principiantes'),
      false
    );
  });

  test('returns null, not false, when no modeled language has enough recognizable words to judge', () => {
    assert.equal(matchesLatinLanguage('en', '#fitness #shorts #viral'), null);
    assert.equal(matchesLatinLanguage('en', 'gym'), null);
  });

  test('hasLatinHeuristic is true exactly for the modeled Latin languages', () => {
    assert.equal(hasLatinHeuristic('en'), true);
    assert.equal(hasLatinHeuristic('es'), true);
    assert.equal(hasLatinHeuristic('fr'), true);
    assert.equal(hasLatinHeuristic('de'), true);
    assert.equal(hasLatinHeuristic('pt'), true);
    assert.equal(hasLatinHeuristic('it'), true);
    assert.equal(hasLatinHeuristic('nl'), true);
    assert.equal(hasLatinHeuristic('vi'), false); // Latin script, but not modeled
    assert.equal(hasLatinHeuristic('ta'), false); // has its own script instead
    assert.equal(hasLatinHeuristic(undefined), false);
  });

  test('script filter and common-word heuristic never both claim the same language code', () => {
    for (const code of ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl']) {
      assert.equal(hasScriptFilter(code), false);
    }
  });
});

describe('truncate', () => {
  // Real bug: a plain .slice(0, n) can cut a surrogate pair (2 UTF-16 code
  // units representing one emoji) in half, leaving an unpaired surrogate at
  // the end of the string. JSON.stringify emits that as a literal escape
  // that is not valid standalone Unicode -- this crashed a real "recetas de
  // cocina" run's gap-mining call with a DeepSeek 400 ("unexpected end of
  // hex escape") once a comment happened to have an emoji land on the cut.
  test('does not split a surrogate pair sitting exactly on the cut', () => {
    const s = 'x'.repeat(9) + '😀' + 'more text after the emoji';
    const t = truncate(s, 10); // cut lands inside the emoji's surrogate pair
    // A lone surrogate can't round-trip through UTF-8 -- it gets silently
    // replaced with U+FFFD, which is exactly the corruption that reached
    // DeepSeek as a malformed escape. No replacement character means no
    // unpaired surrogate survived the cut.
    assert.equal(Buffer.from(t, 'utf8').toString('utf8').includes('�'), false);
    // The emoji is one code point -- truncate should keep it whole rather
    // than half of it, so length-by-codepoint is exactly 10, not 11.
    assert.equal([...t].length, 10);
    assert.equal(t.endsWith('😀'), true);
  });

  test('leaves short text untouched and long plain text cut at the limit', () => {
    assert.equal(truncate('hello', 10), 'hello');
    assert.equal(truncate('a'.repeat(20), 10), 'a'.repeat(10));
  });

  test('collapses whitespace before truncating', () => {
    assert.equal(truncate('  hello   world  ', 20), 'hello world');
  });
});
