import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDuration, windowToPublishedAfter } from '../src/services/youtube.js';
import { parseCommentIndex, selectComments, groundGaps, groundObjections, truncate } from '../src/services/analyze.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, stripHashtags, untrustedVideoIds, nicheKeywords } from '../src/lib/relevance.js';
import { hasScriptFilter, matchesLanguageScript, hasLatinHeuristic, matchesLatinLanguage, languageQueryHint, matchesAudioLanguage, matchesRequestedLanguage } from '../src/lib/language.js';
import { scoreVideos, scoreTopic } from '../src/lib/heat.js';
import { searchPlan } from '../src/lib/searchPlan.js';
import { withLock } from '../src/lib/fileLock.js';
import { nicheKey, subjectKey } from '../src/lib/store.js';
import { gapTokens, gapSimilarity, classifyRecurrence } from '../src/lib/recurrence.js';
// Reaching across the workspace on purpose: these are pure serializers with no
// DOM dependency at module scope, and CSV quoting is exactly the kind of thing
// that silently corrupts an export until someone opens it in a spreadsheet.
import { gapsToCsv, reportToMarkdown, exportStem } from '../../web/src/lib/export.js';

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

describe('languageQueryHint', () => {
  // Real case: niche "ghost story", regionCode=IN, relevanceLanguage=ta
  // returned 1/50 verified-Tamil candidates because the search.list QUERY
  // TEXT was still just "ghost story" in English -- relevanceLanguage barely
  // moves the ranking on its own. Folding the language's name into the query
  // moved that to 32/50, confirmed live.
  test('returns the English name for a language this module can verify', () => {
    assert.equal(languageQueryHint('ta'), 'Tamil');
    assert.equal(languageQueryHint('TA'), 'Tamil'); // case-insensitive, matches the other language.js exports
    assert.equal(languageQueryHint('es'), 'Spanish');
  });

  test('returns null for a language code with no name mapping, not an empty string', () => {
    assert.equal(languageQueryHint('zu'), null);
    assert.equal(languageQueryHint(undefined), null);
  });

  test('every script-filter and Latin-heuristic language has a query hint, so the query-augmentation and the post-fetch filter never disagree on coverage', () => {
    for (const code of ['ta', 'hi', 'ar', 'ja', 'ko', 'ru', 'th', 'he']) {
      assert.equal(hasScriptFilter(code), true);
      assert.notEqual(languageQueryHint(code), null);
    }
    for (const code of ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl']) {
      assert.equal(hasLatinHeuristic(code), true);
      assert.notEqual(languageQueryHint(code), null);
    }
  });
});

describe('audio-language field and the combined verdict', () => {
  // Real case: niche "ghost story", regionCode=IN, relevanceLanguage=ta
  // returned only 1/50 Tamil matches by script alone. Checking
  // defaultAudioLanguage on the same 50 live found 38 set to "ta" --
  // including titles with zero Tamil script at all, like "GHOST STORIES IN
  // TAMIL" written entirely in Latin letters. Audio language reflects what's
  // actually SPOKEN; script/word checks can only ever read the TEXT.
  test('matchesAudioLanguage compares BCP-47 on the primary subtag only', () => {
    assert.equal(matchesAudioLanguage('ta', 'ta'), true);
    assert.equal(matchesAudioLanguage('en', 'en-GB'), true);
    assert.equal(matchesAudioLanguage('ta', 'en-GB'), false);
  });

  test('matchesAudioLanguage returns null, not false, when the field is absent', () => {
    assert.equal(matchesAudioLanguage('ta', null), null);
    assert.equal(matchesAudioLanguage('ta', undefined), null);
  });

  test('matchesRequestedLanguage: audio confirms even when the title has no script evidence at all', () => {
    // The exact "GHOST STORIES IN TAMIL" case: fully Latin-letter title, Tamil
    // audio. Script detection alone would call this unverifiable; the audio
    // field should be enough on its own.
    const video = { title: 'GHOST STORIES IN TAMIL #horrorstory', description: '', defaultAudioLanguage: 'ta' };
    assert.equal(matchesRequestedLanguage('ta', video), true);
  });

  test('matchesRequestedLanguage: script evidence rescues a video from a disagreeing audio field', () => {
    // The exact "en-GB but visibly Tamil-script title" case: a stale/wrong
    // audio-language value shouldn't override text that unambiguously IS the
    // requested language's script.
    const video = { title: 'பேய் இருப்பது உண்மை என நிரூபிக்கும் சம்பவம்', description: '', defaultAudioLanguage: 'en-GB' };
    assert.equal(matchesRequestedLanguage('ta', video), true);
  });

  test('matchesRequestedLanguage: confirmed audio mismatch with no rescue excludes', () => {
    const video = { title: 'Plain English gym workout tips', description: '', defaultAudioLanguage: 'en' };
    assert.equal(matchesRequestedLanguage('ta', video), false);
  });

  test('matchesRequestedLanguage: no audio field and no text evidence is undecided, not excluded', () => {
    const video = { title: '#fitness #shorts', description: '', defaultAudioLanguage: null };
    assert.equal(matchesRequestedLanguage('ta', video), null);
  });

  test('matchesRequestedLanguage works for a language with no script or Latin-heuristic model at all, using audio alone', () => {
    assert.equal(hasScriptFilter('vi'), false);
    assert.equal(hasLatinHeuristic('vi'), false);
    const video = { title: 'Cau chuyen ma co that', description: '', defaultAudioLanguage: 'vi' };
    assert.equal(matchesRequestedLanguage('vi', video), true);
    const other = { title: 'Cau chuyen ma co that', description: '', defaultAudioLanguage: 'en' };
    assert.equal(matchesRequestedLanguage('vi', other), false);
    const unknown = { title: 'Cau chuyen ma co that', description: '', defaultAudioLanguage: null };
    assert.equal(matchesRequestedLanguage('vi', unknown), null);
  });

  test('matchesRequestedLanguage for a Latin-heuristic language: audio can confirm even when the word heuristic can\'t judge', () => {
    const video = { title: 'hi', description: '', defaultAudioLanguage: 'es' }; // too short for the word heuristic alone
    assert.equal(matchesRequestedLanguage('es', video), true);
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

describe('searchPlan', () => {
  test('"both" and "shorts" each need exactly one slice', () => {
    assert.deepEqual(searchPlan({ contentType: 'both' }), [{ order: 'viewCount', videoDuration: 'any' }]);
    assert.deepEqual(searchPlan({ contentType: 'shorts' }), [{ order: 'viewCount', videoDuration: 'short' }]);
  });

  // The bug this whole mechanism exists for. YouTube's videoDuration buckets are
  // short(<4m)/medium(4-20m)/long(>20m) and a call takes exactly one -- so
  // "long-form" (anything over 180s) spans two of them. Requesting only `medium`
  // capped long-form analysis at 20 minutes: verified live on "home lab server
  // tutorial"/90d, contentType=long returned 0 videos over 20 min while the same
  // query under `any` surfaced 11, up to 45 minutes.
  test('"long" spans BOTH the medium and long duration buckets', () => {
    const buckets = searchPlan({ contentType: 'long' }).map((s) => s.videoDuration);
    assert.deepEqual(buckets, ['medium', 'long']);
    assert.ok(buckets.includes('long'), 'must request the >20min bucket, or long-form silently caps at 20 minutes');
  });

  test('deep scan adds a date-ordered pass over the same buckets, never dropping the viewCount pass', () => {
    const plan = searchPlan({ contentType: 'both', deepScan: true });
    assert.equal(plan.length, 2);
    assert.deepEqual(plan.map((s) => s.order), ['viewCount', 'date']);
    // order=viewCount alone makes the pool the top N by ABSOLUTE views, which
    // pre-selects against the breakout small channel that views-per-subscriber
    // scoring exists to surface.
    assert.ok(plan.some((s) => s.order === 'date'));
  });

  test('long-form deep scan covers every bucket/order combination', () => {
    const plan = searchPlan({ contentType: 'long', deepScan: true });
    assert.equal(plan.length, 4);
    assert.equal(new Set(plan.map((s) => `${s.order}:${s.videoDuration}`)).size, 4, 'no duplicate slices -- each one costs 100 units');
  });

  test('defaults to the cheapest single slice when given nothing', () => {
    assert.equal(searchPlan().length, 1);
  });
});

describe('withLock', () => {
  const tmpBase = path.join(os.tmpdir(), `cgf-lock-test-${process.pid}`);

  test('runs the critical section and releases the lock afterwards', () => {
    const target = `${tmpBase}-a`;
    const result = withLock(target, () => 'done');
    assert.equal(result, 'done');
    assert.equal(fs.existsSync(`${target}.lock`), false, 'lock must not leak after a normal return');
  });

  test('releases the lock even when the critical section throws', () => {
    const target = `${tmpBase}-b`;
    assert.throws(() => withLock(target, () => { throw new Error('boom'); }), /boom/);
    assert.equal(fs.existsSync(`${target}.lock`), false, 'a throw inside the lock must not wedge every later call');
  });

  test('creates the lock directory if it does not exist yet', () => {
    // Real bug this covers: the lock file sits next to the file it guards, and
    // callers legitimately create that directory INSIDE the locked section --
    // that write is the thing being serialized. On the very first gap-history
    // append for a niche, .state/niches/ did not exist, openSync(lock,'wx')
    // threw ENOENT, and tryAcquire only handled EEXIST. The pipeline caught it
    // and reported "could not compare against earlier runs", which looked
    // exactly like recurrence being broken on every fresh install.
    const nested = path.join(tmpBase + '-fresh', 'nested', 'deep', 'ledger.jsonl');
    assert.equal(fs.existsSync(path.dirname(nested)), false, 'precondition: directory must not exist');
    const out = withLock(nested, () => {
      fs.mkdirSync(path.dirname(nested), { recursive: true });
      fs.writeFileSync(nested, 'row\n');
      return 'wrote';
    });
    assert.equal(out, 'wrote');
    assert.equal(fs.existsSync(nested), true);
    assert.equal(fs.existsSync(`${nested}.lock`), false, 'lock must still be cleaned up');
  });

  test('serializes against a lock already held, rather than running straight through', () => {
    const target = `${tmpBase}-c`;
    // Simulate another process holding the lock, but backdate it past the stale
    // threshold so the spin loop reclaims it instead of waiting the full 2s.
    fs.writeFileSync(`${target}.lock`, '');
    const old = Date.now() - 60_000;
    fs.utimesSync(`${target}.lock`, new Date(old), new Date(old));
    let ran = false;
    withLock(target, () => { ran = true; });
    assert.equal(ran, true, 'a stale lock must be reclaimed, not block forever');
    assert.equal(fs.existsSync(`${target}.lock`), false);
  });
});

describe('nicheKey', () => {
  test('normalizes case and whitespace so one niche has one history file', () => {
    // If these diverged, recurrence detection would silently never match:
    // every re-run would look like a brand new niche with no history.
    assert.equal(nicheKey('Sourdough Baking'), nicheKey('sourdough baking'));
    assert.equal(nicheKey('  sourdough   baking  '), nicheKey('sourdough baking'));
  });
  test('keeps genuinely different niches apart', () => {
    assert.notEqual(nicheKey('sourdough baking'), nicheKey('sourdough starter'));
  });
  test('channel runs key off the channel, not the empty niche string', () => {
    // Channel mode sends no niche at all, so keying history on query.niche would
    // land every channel that has ever been analysed on the hash of '' -- one
    // shared history file, and recurrence comparing each channel against all the
    // others. Must also match what the pipeline hands appendGapHistory().
    const a = subjectKey({ niche: '', channelId: 'UCBJycsmduvYEL83R_U4JriQ' });
    const b = subjectKey({ niche: '', channelId: 'UCXuqSBlHAE6Xw-yeJA0Tunw' });
    assert.notEqual(a, b, 'two channels must not share a history');
    assert.equal(a, nicheKey('channel:UCBJycsmduvYEL83R_U4JriQ'), 'must match the pipeline\'s history key');
    assert.notEqual(a, subjectKey({ niche: '' }), 'a channel run must not collide with a blank niche');
  });

  test('niche runs still key off the niche text', () => {
    assert.equal(subjectKey({ niche: 'Sourdough Baking' }), nicheKey('sourdough baking'));
  });

  test('survives non-Latin niches, which is why it hashes instead of slugifying', () => {
    const key = nicheKey('தமிழ் பேய் கதை');
    assert.match(key, /^[0-9a-f]{16}$/);
    assert.equal(key, nicheKey('தமிழ் பேய் கதை '));
  });
});

describe('export serializers', () => {
  const result = {
    runId: 'r1',
    generatedAt: '2026-09-24T10:00:00.000Z',
    query: { niche: 'sourdough baking', window: '30d', contentType: 'both', gapMode: 'inclusive', minViews: 0 },
    stats: { videosAnalyzed: 50, commentsAnalyzed: 265 },
    topics: [],
    avoid: [],
    gaps: [
      {
        question: 'How do I fix a "gummy, under-baked crumb"?',
        explanation: 'Several bakers report it, nobody covers it well.',
        coverage: 'none',
        demandStrength: 'high',
        demandScore: 12.5,
        evidenceCount: 3,
        distinctVideos: 2,
        suggestedTitle: 'Why your crumb is gummy',
        suggestedFormat: 'long-form',
        evidence: [
          { text: 'Mine came out gummy, help?', likes: 40 },
          { text: 'Same here, line two\nof the comment', likes: 12 },
        ],
      },
    ],
  };

  test('quotes CSV cells containing commas, quotes and newlines', () => {
    const rows = gapsToCsv(result).split('\r\n');
    // The question has an embedded comma AND embedded double quotes -- both have
    // to survive, or every following column shifts by one.
    assert.ok(rows[1].includes('"How do I fix a ""gummy, under-baked crumb""?"'));
    // A newline inside an evidence quote must stay inside its quoted cell rather
    // than terminating the record early.
    assert.equal(rows.length, 2, 'an embedded newline must not split the row');
  });

  test('CSV header and row column counts line up', () => {
    const [header] = gapsToCsv(result).split('\r\n');
    assert.equal(header.split(',').length, 13);
  });

  test('markdown keeps the evidence quotes, not just the model conclusion', () => {
    const md = reportToMarkdown(result);
    assert.match(md, /# Content gaps — sourdough baking/);
    assert.match(md, /Why your crumb is gummy/);
    // A gap's credibility lives in what viewers literally said.
    assert.match(md, /Mine came out gummy, help\?/);
  });

  test('markdown leads with the weak-evidence warning when the pool was thin', () => {
    const thin = { ...result, thinPool: { videos: 3, threshold: 12 } };
    assert.match(reportToMarkdown(thin), /Weak evidence.*only 3 videos/is);
  });

  test('export filenames are filesystem-safe even for non-Latin niches', () => {
    assert.equal(exportStem(result), 'sourdough-baking-2026-09-24');
    const tamil = { ...result, query: { ...result.query, niche: 'தமிழ் பேய் கதை' } };
    assert.match(exportStem(tamil), /^report-2026-09-24$/);
  });
});

describe('gap recurrence matching', () => {
  test('two phrasings of the same question match', () => {
    // This is the whole feature. The model rewrites every gap from scratch each
    // run, so if fuzzy matching fails here, every gap is reported as new forever
    // -- which is indistinguishable from recurrence being broken entirely.
    const a = gapTokens('Why is my sourdough crumb gummy and dense?');
    const b = gapTokens('How do I fix a gummy, dense crumb in sourdough?');
    const { score, shared } = gapSimilarity(a, b);
    assert.ok(shared >= 2, `expected >=2 shared tokens, got ${shared}`);
    assert.ok(score >= 0.4, `expected similarity >=0.4, got ${score}`);
  });

  test('matches a real pair Jaccard scored too low, found on live data', () => {
    // These two are the same question, from consecutive live "cast iron
    // restoration" runs. Under Jaccard they scored 0.31 and did not match, so
    // the run reported the same demand as BOTH "new this run" and "closed since
    // last run" -- two contradictory claims about one gap on the same screen.
    // Each question carries different incidental detail, which inflates the
    // union and punishes overlap for the more verbose phrasing.
    const a = gapTokens('Can you fix a warped cast iron pan, or one that spins and wobbles on a flat stove?');
    const b = gapTokens('Can you fix a warped or spinning cast iron skillet, and does it matter on a glass-top stove?');
    const { score, shared } = gapSimilarity(a, b);
    assert.ok(shared >= 2, `expected >=2 shared tokens, got ${shared}`);
    assert.ok(score >= 0.4, `expected Dice >=0.4, got ${score}`);
  });

  test('stemming collapses doubled consonants so spins/spinning share a token', () => {
    // relevance.js's stem() yields "spin" for "spins" but "spinn" for
    // "spinning" -- fine for its own substring matching, silently lossy for set
    // overlap. Recurrence normalizes on top rather than changing that stemmer,
    // which backs niche keyword matching and is tuned for a different job.
    assert.ok(gapTokens('spins').has([...gapTokens('spinning')][0]), 'spins and spinning must normalize alike');
  });

  test('a short question subsumed by a longer one is rejected by the shared-token floor', () => {
    // Dice is more permissive than Jaccard, which is the point -- but it rates
    // this pair at 0.5, above the ratio threshold. Only the shared-token floor
    // rejects it, so that floor is load-bearing and not belt-and-braces.
    const { score, shared } = gapSimilarity(gapTokens('sourdough hydration'), gapTokens('sourdough oven'));
    assert.ok(score >= 0.4, 'precondition: Dice alone would accept this pair');
    assert.ok(shared < 2, 'the shared-token floor is what must reject it');
  });

  test('a gap is never reported as both recurring and resolved', () => {
    // The invariant the Jaccard bug violated in production. Both verdicts run
    // off the same matcher, so this holds by construction -- but it is the
    // user-visible contract worth pinning down, since a regression here puts two
    // contradictory statements about one gap on screen.
    const history = [
      { runId: 'r1', generatedAt: '2026-09-01T00:00:00Z', question: 'Can you fix a warped or spinning cast iron skillet, and does it matter on a glass-top stove?', demandScore: 16.8, coverage: 'none' },
    ];
    const { gaps, resolved } = classifyRecurrence(
      [{ question: 'Can you fix a warped cast iron pan, or one that spins and wobbles on a flat stove?', demandScore: 13.7 }],
      history
    );
    assert.equal(gaps[0].recurrence.status, 'recurring');
    assert.equal(resolved.length, 0, 'a gap matched as recurring must not also appear as resolved');
  });

  test('genuinely different questions in the same niche do NOT match', () => {
    const a = gapTokens('How do I score sourdough before baking?');
    const b = gapTokens('Which flour is best for sourdough starter?');
    const { score } = gapSimilarity(a, b);
    assert.ok(score < 0.4, `expected similarity <0.4, got ${score}`);
  });

  test('one coincidentally shared word is not a match', () => {
    // Both mention "sourdough" and nothing else in common. A ratio threshold
    // alone can clear on a single word when both questions are short, which is
    // why a minimum shared-token count exists alongside it.
    const { shared } = gapSimilarity(gapTokens('sourdough hydration'), gapTokens('sourdough oven'));
    assert.ok(shared < 2, `expected <2 shared tokens, got ${shared}`);
  });

  test('with no history at all, nothing is called new or recurring', () => {
    const { gaps, resolved, runsCompared } = classifyRecurrence(
      [{ question: 'How do I fix a gummy crumb?', demandScore: 10 }],
      []
    );
    assert.equal(runsCompared, 0);
    assert.equal(resolved.length, 0);
    // "unknown", not "new": with nothing to compare against, calling it new
    // would assert something the data cannot support.
    assert.equal(gaps[0].recurrence.status, 'unknown');
  });

  test('a gap seen in two earlier runs is recurring, and counts runs not rows', () => {
    const history = [
      { runId: 'r1', generatedAt: '2026-09-01T00:00:00Z', question: 'Why is my crumb gummy and dense?', demandScore: 6, coverage: 'none' },
      // Same run, near-duplicate row: must not inflate the streak to 3.
      { runId: 'r1', generatedAt: '2026-09-01T00:00:00Z', question: 'How to fix gummy dense crumb', demandScore: 5, coverage: 'none' },
      { runId: 'r2', generatedAt: '2026-09-08T00:00:00Z', question: 'How do I fix a gummy, dense crumb?', demandScore: 8, coverage: 'weak' },
    ];
    const { gaps, runsCompared } = classifyRecurrence(
      [{ question: 'Fixing a dense gummy crumb in sourdough', demandScore: 12 }],
      history
    );
    assert.equal(runsCompared, 2);
    assert.equal(gaps[0].recurrence.status, 'recurring');
    assert.equal(gaps[0].recurrence.timesSeen, 3, 'two prior runs plus this one');
    assert.equal(gaps[0].recurrence.firstSeen, '2026-09-01T00:00:00Z');
  });

  test('demand climbing across runs is reported as rising', () => {
    const history = [{ runId: 'r1', generatedAt: '2026-09-01T00:00:00Z', question: 'How do I fix a gummy crumb?', demandScore: 5, coverage: 'none' }];
    const { gaps } = classifyRecurrence([{ question: 'Fixing a gummy crumb', demandScore: 20 }], history);
    assert.equal(gaps[0].recurrence.trend, 'rising');
    assert.equal(gaps[0].recurrence.previousDemandScore, 5);
  });

  test('a gap open last run but absent now is reported as resolved', () => {
    const history = [
      { runId: 'r1', generatedAt: '2026-09-08T00:00:00Z', question: 'Can you cover oven spring troubleshooting?', demandScore: 9, coverage: 'none' },
    ];
    const { gaps, resolved } = classifyRecurrence(
      [{ question: 'Which flour for a beginner starter?', demandScore: 7 }],
      history
    );
    assert.equal(gaps[0].recurrence.status, 'new');
    assert.equal(resolved.length, 1);
    assert.match(resolved[0].question, /oven spring/);
    assert.equal(resolved[0].previousDemandScore, 9);
  });

  test('only the most recent prior run contributes resolved gaps', () => {
    // Something absent for several runs is old news; reporting it forever would
    // bury the signal under every gap the niche has ever had.
    const history = [
      { runId: 'r1', generatedAt: '2026-08-01T00:00:00Z', question: 'Ancient forgotten question about levain', demandScore: 4, coverage: 'none' },
      { runId: 'r2', generatedAt: '2026-09-08T00:00:00Z', question: 'Recent question about oven spring', demandScore: 9, coverage: 'none' },
    ];
    const { resolved } = classifyRecurrence([{ question: 'Totally unrelated flour query', demandScore: 3 }], history);
    assert.equal(resolved.length, 1);
    assert.match(resolved[0].question, /oven spring/);
  });
});

describe('groundObjections', () => {
  const comments = [
    { index: 0, videoId: 'v1', text: 'The sponsor segment is way too long', likes: 40, replyCount: 2 },
    { index: 1, videoId: 'v2', text: 'Please add timestamps, 20 minutes with no chapters', likes: 25, replyCount: 0 },
    { index: 2, videoId: 'v1', text: 'Audio is so quiet I had to max the volume', likes: 5, replyCount: 0 },
  ];

  test('resolves cited comments and counts distinct videos', () => {
    const [o] = groundObjections(
      [{ label: 'Sponsor segments too long', detail: 'd', severity: 'high', fix: 'Cut to 20s', evidence_comment_indexes: [0, 1] }],
      comments
    );
    assert.equal(o.evidenceCount, 2);
    assert.equal(o.distinctVideos, 2);
    assert.equal(o.fix, 'Cut to 20s');
  });

  test('drops an objection with fewer than 2 resolvable comments', () => {
    // One viewer's opinion is not a pattern, and a creator changing how they
    // edit on the strength of it is a worse outcome than showing nothing.
    const out = groundObjections(
      [{ label: 'Too quiet', severity: 'low', evidence_comment_indexes: [2] }],
      comments
    );
    assert.equal(out.length, 0);
  });

  test('drops fabricated citations rather than inventing evidence', () => {
    const out = groundObjections(
      [{ label: 'Made up', severity: 'high', evidence_comment_indexes: [99, 100] }],
      comments
    );
    assert.equal(out.length, 0);
  });

  test('parses the "c3" citation form the same way groundGaps does', () => {
    const [o] = groundObjections(
      [{ label: 'Needs chapters', severity: 'medium', evidence_comment_indexes: ['c0', 'c1'] }],
      comments
    );
    assert.equal(o.evidenceCount, 2);
  });

  test('sorts high severity first', () => {
    const out = groundObjections(
      [
        { label: 'Low thing', severity: 'low', evidence_comment_indexes: [0, 1] },
        { label: 'High thing', severity: 'high', evidence_comment_indexes: [0, 1] },
      ],
      comments
    );
    assert.equal(out[0].label, 'High thing');
  });
});
