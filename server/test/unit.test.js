import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDuration, windowToPublishedAfter } from '../src/services/youtube.js';
import { parseCommentIndex, selectComments, groundGaps, groundObjections, truncate } from '../src/services/analyze.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, stripHashtags, untrustedVideoIds, nicheKeywords } from '../src/lib/relevance.js';
import { hasScriptFilter, matchesLanguageScript, hasLatinHeuristic, matchesLatinLanguage, languageQueryHint, matchesAudioLanguage, matchesRequestedLanguage, namedLanguages, languageDecision } from '../src/lib/language.js';
import { scoreVideos, scoreTopic } from '../src/lib/heat.js';
import { searchPlan } from '../src/lib/searchPlan.js';
import { withLock } from '../src/lib/fileLock.js';
import { FORMULAS, classifyFormula, formulaHint, normalizeFormulaId } from '../src/lib/hookFormulas.js';
import { scoreHook, band, weakOpener, partialHookCheck } from '../src/lib/hookScore.js';
import { finalizeBrief, queryTest, briefPrompt, formulaList, systemPrompt, assessLength, buildOpportunity, titleCoverage } from '../src/services/brief.js';
import { lintTitle, ungroundedNumbers, rankTitleOptions, unverifiedNames, unverifiedTags, impliesAccusation, requestPhrase } from '../src/lib/titleLint.js';
import { detectSensitive, assessSensitivity } from '../src/lib/sensitive.js';
import { ExclusionLedger, REASONS } from '../src/lib/exclusions.js';
import { assessEvidence, assessTopic, explainShortfall, thinPoolFrom, suggestionsFor, rankSwing } from '../src/lib/confidence.js';
import { median, medianMultiple, annotateOutliers } from '../src/lib/outlier.js';
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

  describe('namedLanguages', () => {
    test('finds a language name sitting next to a dub/version/subtitle label', () => {
      // The exact real case: defaultAudioLanguage unset, pure-Latin title, no
      // Tamil script to check -- every other signal landed on "undecided" even
      // though the title says outright, in English, that the audio is Hindi.
      assert.deepEqual(namedLanguages('GALAXY Full Movie Hindi Dubbed 2026 | Thalapathy Vijay'), ['hi']);
      assert.deepEqual(namedLanguages('Tamil Dub | Action Movie'), ['ta']);
      assert.deepEqual(namedLanguages('Full movie with English Subtitles'), ['en']);
    });

    test('a bare language name with no dub/version/audio context nearby is not a claim', () => {
      // The false-positive risk this whole check exists to avoid: a language's
      // English name shows up constantly in phrases that say nothing about a
      // video's own audio.
      assert.deepEqual(namedLanguages('Easy French Toast Recipe for Beginners'), []);
      assert.deepEqual(namedLanguages('Best Dutch Oven Bread -- No Knead Method'), []);
      assert.deepEqual(namedLanguages('Authentic Greek Yogurt Parfait'), []);
      assert.deepEqual(namedLanguages('Chinese Checkers Strategy Guide'), []);
      assert.deepEqual(namedLanguages('German Shepherd Puppy Training Tips'), []);
    });

    test('finds every language claimed when a description lists multiple dubs', () => {
      assert.deepEqual(
        new Set(namedLanguages('varisu full movie kannada dubbed\nvarisu full movie hindi explained')),
        new Set(['kn', 'hi'])
      );
    });

    test('a language with no English-name mapping never matches', () => {
      assert.deepEqual(namedLanguages('Turkish Delight Recipe'), []);
    });
  });

  describe('matchesRequestedLanguage: named-language text claims', () => {
    test('excludes an undecided video whose title names a different language next to a dub label', () => {
      // The exact bug report: "thalapathy vijay" + relevanceLanguage=ta kept
      // several Hindi-dubbed movies because defaultAudioLanguage was unset and
      // the title had no Tamil script to check -- their Hindi-language comments
      // then leaked into gap mining under a "language: ta" filter.
      const video = {
        title: 'ROBBERY (2026) Vijay Thalapathy Hindi Dubbed Action Movie | South Indian Hindi Dubbed Movie',
        description: '',
        defaultAudioLanguage: null,
      };
      assert.equal(matchesRequestedLanguage('ta', video), false);
    });

    test('never overrides a positive audio confirmation', () => {
      // The named-language check is the weakest signal and must never contradict
      // the strongest one -- a creator who mislabels their own title shouldn't
      // get a genuinely Tamil-audio video excluded.
      const video = { title: 'Hindi Dubbed but actually Tamil audio', description: '', defaultAudioLanguage: 'ta' };
      assert.equal(matchesRequestedLanguage('ta', video), true);
    });

    test('never overrides a positive script confirmation', () => {
      const video = {
        title: 'ROBBERY Hindi Dubbed | பேய் கதை உண்மை சம்பவம்',
        description: '',
        defaultAudioLanguage: null,
      };
      assert.equal(matchesRequestedLanguage('ta', video), true);
    });

    test('a bilingual claim that includes the requested language is not excluded', () => {
      // "Hindi & Tamil Dubbed" names the target language too -- excluding it
      // anyway would contradict the video's own claim about itself.
      const video = { title: 'Hindi & Tamil Dubbed Full Movie', description: '', defaultAudioLanguage: null };
      assert.equal(matchesRequestedLanguage('ta', video), null);
    });

    test('food/cultural phrases naming a language do not trigger exclusion', () => {
      const video = { title: 'Easy French Toast Recipe', description: '', defaultAudioLanguage: null };
      assert.equal(matchesRequestedLanguage('ta', video), null);
    });

    test('also applies to languages with no script or Latin-heuristic model', () => {
      const video = { title: 'Cau chuyen ma co that Hindi Dubbed', description: '', defaultAudioLanguage: null };
      assert.equal(matchesRequestedLanguage('vi', video), false);
    });
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
    assert.equal(header.split(",").length, 15);
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

describe('hook formulas (ported from youtube-agent-skill)', () => {
  test('loads all 21 formulas with compiled patterns', () => {
    assert.equal(FORMULAS.length, 21);
    assert.ok(FORMULAS.every((f) => f.regexes.length > 0));
  });
  test('labels a statistic-shaped title and leaves a plain one unclassified', () => {
    assert.equal(classifyFormula('97% of new channels quit before video 30').id, 'the-statistic');
    assert.equal(classifyFormula('cast iron skillet').name, 'Unclassified');
  });
});

describe('median-multiple outliers', () => {
  const long = (views) => ({ views, isShort: false });
  const base = [long(10_000), long(20_000), long(30_000), long(40_000)];

  test('median handles odd, even and empty', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), 0);
  });
  test('is a multiple of the channel median', () => {
    assert.deepEqual(medianMultiple({ views: 125_000, isShort: false }, base), { multiple: 5, median: 25_000, baseline: 4 });
  });
  test('declines rather than ranking on fewer than 4 same-format uploads', () => {
    assert.equal(medianMultiple({ views: 1e6, isShort: false }, base.slice(0, 3)), null);
  });
  test('never mixes Shorts and long-form into one median', () => {
    const mixed = [...base.slice(0, 3), { views: 5_000_000, isShort: true }];
    assert.equal(medianMultiple({ views: 90_000, isShort: false }, mixed), null);
  });
  test('annotates videos, counts formulas among real outliers, reports thin channels', () => {
    const ranked = [
      { videoId: 'a', channelId: 'C1', channelTitle: 'One', title: '97% of people quit', views: 125_000, isShort: false },
      { videoId: 'b', channelId: 'C2', channelTitle: 'Two', title: 'plain title', views: 900, isShort: false },
    ];
    const s = annotateOutliers(ranked, new Map([['C1', base], ['C2', base.slice(0, 2)]]), { threshold: 2 });
    assert.equal(ranked[0].outlier.multiple, 5);
    assert.equal(ranked[1].outlier, null);
    assert.equal(s.outliers, 1);
    assert.deepEqual(s.thinChannels, ['Two']);
    assert.equal(s.topFormulas[0].name, 'The Statistic');
  });
});

describe('title lint and ranking (ported from youtube-agent-skill)', () => {
  test('flags length, shouting, vague words, missing figure', () => {
    const r = lintTitle('INSANE ULTIMATE SECRET cast iron guide that covers absolutely everything you could ever want to know');
    const kinds = r.issues.map(([k]) => k);
    for (const k of ['length', 'shouting', 'vague', 'no-number']) assert.ok(kinds.includes(k), k);
  });
  test('flags a thumbnail that repeats the title, and over-long thumbnail text', () => {
    assert.ok(lintTitle('Restore cast iron fast', 'CAST IRON').issues.some(([k]) => k === 'duplicate'));
    assert.ok(lintTitle('Restore a pan', 'one two three four five').issues.some(([k]) => k === 'thumb-length'));
  });
  test('ungroundedNumbers only reports figures absent from the evidence', () => {
    assert.deepEqual(ungroundedNumbers('Restore a 1920 pan in 10 minutes', 'my 1920 Griswold is rusty'), ['10']);
    assert.deepEqual(ungroundedNumbers('Restore a pan', 'anything 5'), []);
  });
  test('a title with an invented number loses to a clean one even when it scores higher on the lint', () => {
    const ranked = rankTitleOptions(['Restore a rusty pan in 7 minutes', 'Restore a rusty pan'], { corpus: 'how do i restore a rusty pan' });
    assert.equal(ranked[0].title, 'Restore a rusty pan');
    assert.ok(ranked[1].ungrounded);
  });
  test('if every option invents a number, the best-scoring one still wins', () => {
    const ranked = rankTitleOptions(['Fix it in 3 steps', 'Fix it in 3 steps today'], { corpus: '' });
    assert.ok(ranked.every((r) => r.ungrounded));
    assert.equal(ranked.length, 2);
  });
  test('dedupes case-insensitively and drops blanks', () => {
    assert.equal(rankTitleOptions(['A pan', 'a pan', '', null, undefined]).length, 1);
  });
  test('groundGaps picks the title in code, keeps alternates, and carries the thumbnail text', () => {
    const comments = [
      { index: 1, videoId: 'v1', text: 'how do i remove black residue', likes: 5, replyCount: 0 },
      { index: 2, videoId: 'v2', text: 'black residue keeps coming back', likes: 3, replyCount: 0 },
    ];
    const [g] = groundGaps([{
      question: 'How do I remove black residue?', evidence_comment_indexes: [1, 2], demand_strength: 'high', coverage: 'none',
      title_options: ['Remove black residue in 5 minutes', 'Why black residue keeps coming back'], thumbnail_text: 'NOT SEASONING',
    }], comments, { context: 'cast iron' });
    assert.equal(g.suggestedTitle, 'Why black residue keeps coming back');
    assert.equal(g.titleOptions.length, 2);
    assert.equal(g.thumbnailText, 'NOT SEASONING');
    assert.ok(g.titleLint.score > 0);
  });
  test('groundGaps still accepts the old single suggested_title shape', () => {
    const comments = [
      { index: 1, videoId: 'v1', text: 'please explain x', likes: 1, replyCount: 0 },
      { index: 2, videoId: 'v2', text: 'explain x too', likes: 1, replyCount: 0 },
    ];
    const [g] = groundGaps([{ question: 'x?', evidence_comment_indexes: [1, 2], suggested_title: 'Explaining x' }], comments);
    assert.equal(g.suggestedTitle, 'Explaining x');
  });
});

describe('formulaHint', () => {
  test('is empty with no formulas and names the shape otherwise', () => {
    assert.equal(formulaHint([]), '');
    assert.match(formulaHint([{ name: 'The Statistic', count: 3 }]), /The Statistic: /);
  });
});

describe('hook score (ported from youtube-agent-skill)', () => {
  test('a specific, direct, high-stakes hook outscores a filler greeting', () => {
    const strong = scoreHook('You are wasting 40 minutes every time you restore a pan the old way, and it costs you the finish.');
    const weak = scoreHook('Hey guys welcome back to my channel today we are going to talk about something really amazing');
    assert.ok(strong.verdict > weak.verdict + 20);
    assert.equal(weak.band, 'WEAK');
    assert.equal(weak.weakest, 'SPECIFICITY');
  });
  test('verdict rounds half to even like the original (Python round), not half up', () => {
    // 0.6*mean + 0.4*min lands on exact .5 for some inputs; Math.round would disagree there.
    const hooks = ['Cast iron.', 'Why does your pan rust?', 'You will never guess what happened to my Griswold'];
    for (const h of hooks) assert.ok(Number.isInteger(scoreHook(h).verdict));
  });
  test('band thresholds', () => {
    assert.deepEqual([band(72), band(71), band(55), band(54)], ['STRONG', 'WORKABLE', 'WORKABLE', 'WEAK']);
  });
});

describe('make-it brief', () => {
  const corpus = 'cast iron restoration how do i remove black residue from my 1920 skillet';
  const raw = {
    hooks: [
      { text: 'You will lose the finish on your 1920 skillet if you scrub it before you see what this black residue really is.', formula_id: 'the-warning' },
      { text: 'This trick saves 73 pans a year and nobody told you why it works at all.', formula_id: 'the-statistic' },
    ],
    beats: [
      { beat: 'turn', say: 'one two three four five six seven eight nine ten', on_screen: 'the pan' },
      { beat: 'body', say: 'word '.repeat(140).trim(), on_screen: 'close-up' },
      { beat: 'close', say: '   ', on_screen: 'x' },
    ],
    seo: { queries: ['remove black residue cast iron', 'skillet black gunk', 'seasoning flaking off'], description_opening: 'How to remove black residue from a cast iron skillet.', tags: ['Cast Iron', 'cast iron', 'skillet', 'x'] },
  };
  const out = finalizeBrief(raw, { title: 'Black Residue on Cast Iron: What It Is', thumbnailText: 'not seasoning', corpus });

  test('hooks are scored in code and an invented number cannot win over a clean hook', () => {
    assert.equal(out.hooks.length, 2);
    assert.equal(out.bestHooks[0].inventedNumbers.length, 0);
    assert.ok(out.hooks[1].ungrounded);
    assert.deepEqual(out.hooks[1].inventedNumbers, ['73']);
    assert.ok(Number.isInteger(out.hooks[0].verdict));
  });
  test('runtime is a word count at 150 wpm, ignoring empty beats', () => {
    assert.equal(out.beats.length, 2);
    assert.equal(out.runtime.words, 150);
    assert.equal(out.runtime.seconds, 60);
  });
  test('tags are deduped case-insensitively', () => {
    assert.deepEqual(out.seo.tags, ['Cast Iron', 'skillet', 'x']);
  });
  test('the query test checks title and description opening separately', () => {
    const q = Object.fromEntries(out.seo.queryTest.map((r) => [r.query, r]));
    assert.equal(q['remove black residue cast iron'].inTitle, false); // "remove" is not in the title
    assert.equal(q['remove black residue cast iron'].inOpening, true);
    assert.equal(q['seasoning flaking off'].inOpening, false);
  });
  test('queryTest never passes an empty (all-stopword) query', () => {
    assert.equal(queryTest(['the a'], 'anything', 'anything')[0].inOpening, false);
  });
  test('survives a malformed model response without throwing', () => {
    const empty = finalizeBrief({ hooks: 'nope', beats: null, seo: 5 }, { title: 'T', thumbnailText: '', corpus: '' });
    assert.deepEqual([empty.hooks.length, empty.beats.length, empty.seo.tags.length], [0, 0, 0]);
  });
  test('the prompt carries the evidence and all 21 formulas but not the unrelated run data', () => {
    const gap = { question: 'Q?', explanation: 'E', coverage: 'none', suggestedFormat: 'long-form', suggestedTitle: 'T', thumbnailText: 'tt', evidence: [{ text: 'comment one', likes: 3 }], coveringVideos: [] };
    const p = briefPrompt({ run: { channelMode: false, query: { niche: 'cast iron' } }, gap });
    assert.match(p, /comment one/);
    assert.equal(formulaList().split('\n').length, 21);
  });
});

describe('grounding: spelled-out numbers, names, tags', () => {
  test('a spelled-out number is caught (a real brief said "Nine days")', () => {
    assert.deepEqual(ungroundedNumbers('Nine days and counting', 'a missing child case'), ['9']);
  });
  test('a spelled-out number and a digit ground each other either way round', () => {
    assert.deepEqual(ungroundedNumbers('Nine days in', 'missing for 9 days'), []);
    assert.deepEqual(ungroundedNumbers('Missing for 9 days', 'she has been gone nine days'), []);
  });
  test('"one" is not treated as a figure (it is a pronoun far more often)', () => {
    assert.deepEqual(ungroundedNumbers('One idea per beat', ''), []);
  });
  test('unverifiedNames flags a capitalised mid-sentence name the evidence never used', () => {
    assert.deepEqual(unverifiedNames('Watch what Ramesh said about the pan', 'viewers asked about the pan'), ['Ramesh']);
  });
  test('unverifiedNames ignores sentence-initial words, acronyms, allowlisted words and known names', () => {
    assert.deepEqual(unverifiedNames('Why the CB-CID asked Hema on YouTube. Tamil viewers wonder', 'hema case'), []);
    assert.deepEqual(unverifiedNames("Look at Hema's statement", 'about hema'), []);
  });
  test('unverifiedTags flags a guessed name but not generic SEO words or grounded words', () => {
    const flagged = unverifiedTags(['cast iron repair', 'tamil news', 'ramesh welding'], 'cast iron repair welding');
    assert.deepEqual(flagged, ['ramesh welding']);
  });
  test('accusation wording is caught in English and Tamil, ordinary wording is not', () => {
    assert.ok(impliesAccusation('Why the family is suspected'));
    assert.ok(impliesAccusation('குற்றவாளி யார்'));
    assert.equal(impliesAccusation('What police have confirmed so far'), false);
  });
  test('the accusation chip appears only on sensitive cases', () => {
    assert.ok(!lintTitle('Why the family is suspected').issues.some(([k]) => k === 'accusation'));
    assert.ok(lintTitle('Why the family is suspected', null, { sensitive: true }).issues.some(([k]) => k === 'accusation'));
    assert.ok(lintTitle('Case update', 'GUILTY?', { sensitive: true }).issues.some(([k]) => k === 'accusation'));
  });
});

describe('sensitive-case detection', () => {
  test('flags a custody/interrogation demand about parents (the pasted brief)', () => {
    const r = detectSensitive('police should take both parents into custody and interrogate them. CB-CID updates');
    assert.equal(r.level, 'high');
  });
  test('flags a Tamil child-and-police case with no English terms', () => {
    assert.equal(detectSensitive('செஞ்சி சிறுமி வழக்கு: காவல் விசாரணை, கைது').level, 'high');
  });
  test('flags a missing child with a harm term and a minor', () => {
    assert.equal(detectSensitive('missing girl found after kidnap').level, 'high');
  });
  test('does not flag fiction death, food, or craft', () => {
    for (const t of ['Avengers death theory: will Iron Man die', 'French toast and Dutch oven bread', 'can a cracked cast iron pot be welded']) {
      assert.equal(detectSensitive(t).level, 'none', t);
    }
  });
  test('a single legal word is not enough on its own', () => {
    assert.equal(detectSensitive('the police box in Doctor Who').level, 'none');
  });
  test('the model flag can raise sensitivity but never lower a deterministic hit', () => {
    assert.equal(assessSensitivity('a quiet gardening question', true).level, 'high');
    assert.equal(assessSensitivity('police custody interrogation', false).level, 'high');
    assert.equal(assessSensitivity('a quiet gardening question', false).level, 'none');
  });
  test('groundGaps carries sensitivity and the accusation lint through to the gap', () => {
    const comments = [
      { index: 1, videoId: 'v1', text: 'police should take the parents into custody and interrogate them', likes: 4, replyCount: 0 },
      { index: 2, videoId: 'v2', text: 'the family looks fishy, custody now', likes: 2, replyCount: 0 },
    ];
    const [g] = groundGaps([{
      question: 'Why is the family suspected?', evidence_comment_indexes: [1, 2], demand_strength: 'high', coverage: 'none',
      title_options: ['Why the family is suspected'], thumbnail_text: 'custody now',
    }], comments, { context: 'case' });
    assert.equal(g.sensitive.level, 'high');
    assert.ok(g.titleLint.issues.some(([k]) => k === 'accusation'));
  });
});

describe('make-it brief v2', () => {
  const corpus = 'cast iron repair how do i weld a cracked pot 9 days';
  const base = {
    angle: 'Shows which repairs a welder will take on.',
    needs: [{ claim: 'a welder will TIG a crack', why: 'ask a welder' }, { claim: '', why: 'empty claim is dropped' }],
    hooks: [{ text: 'You will scrap a pot a welder could save, so look before you bin it, today?', formula_id: 'the-warning' }],
    beats: [
      { beat: 'turn', seconds: 40, say: 'one two three four five six seven eight nine ten', on_screen: 'pot' },
      { beat: 'body', seconds: 90, points: ['cleaning the crack', 'what TIG can do [NEEDS SOURCE: confirm with a welder]'], on_screen: 'close-up' },
      { beat: 'body', seconds: 9999, points: ['x'], on_screen: 'y' },
      { beat: 'close', say: '', points: [], on_screen: 'empty beat dropped' },
    ],
    seo: { queries: ['weld cracked cast iron pot', 'cast iron repair'], description_opening: 'Can you weld a cracked cast iron pot? Repair options.', tags: ['cast iron repair', 'ramesh welding'] },
  };
  const out = finalizeBrief(base, { title: 'Weld a cracked cast iron pot', corpus, format: 'long-form' });

  test('keeps angle and needs, drops needs with no claim', () => {
    assert.equal(out.angle, 'Shows which repairs a welder will take on.');
    assert.equal(out.needs.length, 1);
  });
  test('talking-point beats keep their budget (clamped) and the runtime says it is an estimate', () => {
    assert.equal(out.beats.length, 3);
    assert.equal(out.beats[1].seconds, 90);
    assert.equal(out.beats[2].seconds, 240);
    assert.equal(out.runtime.estimated, true);
    assert.equal(out.runtime.format, 'long-form');
  });
  test('prose beats are still timed by their words', () => {
    assert.equal(out.beats[0].seconds, Math.round((10 / 150) * 60));
  });
  test('counts [NEEDS SOURCE] markers per beat', () => {
    assert.equal(out.beats[1].needsSource, 1);
    assert.equal(out.beats[0].needsSource, 0);
  });
  test('a hook naming an unknown person cannot beat a clean hook', () => {
    const r = finalizeBrief({
      hooks: [
        { text: 'You will never guess what Ramesh did to this pot and why it still cooks today.' },
        { text: 'You will scrap a pot a welder could save, so look before you bin it, today?' },
      ],
    }, { title: 'T', corpus, format: 'Short' });
    assert.equal(r.bestHooks[0].unverifiedNames.length, 0);
    assert.deepEqual(r.hooks[1].unverifiedNames, ['Ramesh']);
  });
  test('flags a guessed tag and an unknown number in the description', () => {
    assert.deepEqual(out.seo.unverifiedTags, ['ramesh welding']);
    const r = finalizeBrief({ seo: { queries: [], description_opening: 'Nine pots, fixed.', tags: [] } }, { title: 'T', corpus: '' });
    assert.deepEqual(r.seo.descriptionInvented, ['9']);
  });
  test('a short format reports itself as short', () => {
    assert.equal(finalizeBrief({}, { title: 'T', format: 'Short' }).runtime.format, 'short');
  });
  test('queryTest reports coverage and the missing words, not just pass/fail', () => {
    const [q] = queryTest(['hema family mela doubt'], 'Hema case: why the family is suspected', 'Hema family doubt explained');
    assert.equal(q.inOpening, false);
    assert.deepEqual(q.missing, ['mela']);
    assert.equal(q.coverage, 0.75);
  });
  test('the system prompt adapts to format, language and sensitivity', () => {
    const short = systemPrompt({ format: 'Short' });
    assert.match(short, /under 60 seconds/);
    assert.doesNotMatch(short, /talking points, in the order/);
    const long = systemPrompt({ format: 'long-form', language: 'Tamil', sensitive: { level: 'high', reasons: ['legal process mentioned (custody)'] } });
    assert.match(long, /There is NO target length/);
    assert.doesNotMatch(long, /about \d+ minutes/);
    assert.match(long, /write the essentials, needs, hooks, script, queries, description and tags in Tamil/);
    assert.match(long, /SENSITIVE CASE/);
    assert.match(long, /CONFIRMED/);
    assert.doesNotMatch(systemPrompt({ format: 'long-form' }), /SENSITIVE CASE/);
  });
  test('the prompt labels evidence by source and includes the channel house titles in channel mode', () => {
    const gap = { question: 'Q?', explanation: 'E', coverage: 'none', suggestedFormat: 'long-form', suggestedTitle: 'T', thumbnailText: '', evidence: [{ text: 'a comment', likes: 1 }], coveringVideos: [{ title: 'Covering video' }] };
    const run = { channelMode: true, channel: { title: 'Chan' }, query: {}, topVideos: [{ title: 'Own title A', publishedAt: '2026-10-01' }] };
    const p = briefPrompt({ run, gap });
    assert.match(p, /\[comment\] \(1 likes\) a comment/);
    assert.match(p, /\[video title\] Covering video/);
    assert.match(p, /\[channel's own title\] Own title A/);
  });
});

describe('brief checks for non-Latin scripts and false positives', () => {
  const tamil = '\u0b87\u0ba8\u0bcd\u0ba4 \u0bb5\u0bc0\u0b9f\u0bbf\u0baf\u0bcb\u0bb5\u0bbf\u0bb2\u0bcd \u0b95\u0bc1\u0b9f\u0bc1\u0bae\u0bcd\u0baa\u0bae\u0bcd \u0bae\u0bc7\u0bb2\u0bcd \u0bb5\u0bb0\u0bc1\u0bae\u0bcd \u0b9a\u0ba8\u0bcd\u0ba4\u0bc7\u0b95\u0ba4\u0bcd\u0ba4\u0bc8 \u0b8e\u0b9f\u0bc1\u0ba4\u0bcd\u0ba4\u0bc1\u0b95\u0bcd\u0b95\u0bbf\u0bb1\u0bc7\u0ba9\u0bcd';

  test('Tamil prose is timed by its words, not counted as a handful of Latin tokens', () => {
    const out = finalizeBrief({ beats: [{ beat: 'turn', say: Array(30).fill(tamil).join(' '), on_screen: 'x' }] }, { title: 'T', corpus: '' });
    assert.ok(out.beats[0].seconds > 60, `got ${out.beats[0].seconds}s`);
    assert.equal(out.runtime.estimated, false);
  });
  test('a non-Latin hook is left unscored instead of being called weak', () => {
    const out = finalizeBrief({ hooks: [{ text: tamil }] }, { title: 'T', corpus: '' });
    assert.equal(out.hooks[0].unscored, true);
    assert.equal(out.hooks[0].verdict, null);
    assert.equal(out.hooks[0].band, 'UNSCORED');
    assert.match(out.languageNote, /non-Latin/);
  });
  test('a Latin hook is still scored and carries no language note', () => {
    const out = finalizeBrief({ hooks: [{ text: 'You will scrap a pot a welder could save, so look before you bin it, today?' }], beats: [{ beat: 'turn', say: 'plain english words here', on_screen: 'x' }] }, { title: 'T', corpus: '' });
    assert.equal(out.hooks[0].unscored, false);
    assert.ok(Number.isInteger(out.hooks[0].verdict));
    assert.equal(out.languageNote, '');
  });
  test('words inside a [NEEDS SOURCE: ...] marker are not checked as claims or timed as speech', () => {
    const out = finalizeBrief({ beats: [{ beat: 'body', say: 'what the police said [NEEDS SOURCE: Confirm With Station Records 12]', on_screen: 'x' }] }, { title: 'T', corpus: 'police said' });
    assert.equal(out.beats[0].needsSource, 1);
    assert.deepEqual(out.beats[0].unverifiedNames, []);
    assert.deepEqual(out.beats[0].inventedNumbers, []);
    assert.equal(out.beats[0].seconds, Math.round((4 / 150) * 60));
  });
  test('a tag is judged against the draft itself, so ordinary words it uses are not flagged', () => {
    const out = finalizeBrief({
      hooks: [{ text: 'Why would police demand this, and what do you risk by believing it today?' }],
      seo: { queries: [], description_opening: 'Police demand explained.', tags: ['police demand', 'quibblewump trail'] },
    }, { title: 'T', corpus: 'a case' });
    assert.deepEqual(out.seo.unverifiedTags, ['quibblewump trail']);
  });
  test('query tokens ignore 1-2 letter particles but keep numbers', () => {
    const [q] = queryTest(['hema ah 9 mela'], 'Hema', 'Hema 9');
    assert.deepEqual(q.missing, ['mela']);
  });
});

describe('exclusion ledger', () => {
  const v = (id, extra = {}) => ({ videoId: id, title: `title ${id}`, channelTitle: 'Chan', views: 100, ...extra });

  test('counts by reason and by kind, keeping excluded and unread apart', () => {
    const l = new ExclusionLedger();
    l.add(v('a'), 'format-short', '61s');
    l.add(v('b'), 'format-short', '30s');
    l.add(v('c'), 'min-views');
    l.add(v('d'), 'not-comment-read');
    assert.equal(l.count('format-short'), 2);
    assert.equal(l.countKind('excluded'), 3);
    assert.equal(l.countKind('unread'), 1);
  });
  test('summary lists excluded reasons before unread ones, largest first, with a few examples', () => {
    const l = new ExclusionLedger();
    for (let i = 0; i < 8; i++) l.add(v(`s${i}`), 'format-short');
    l.add(v('m'), 'min-views');
    for (let i = 0; i < 20; i++) l.add(v(`u${i}`), 'not-comment-read');
    const sum = l.summary();
    assert.deepEqual(sum.map((r) => r.code), ['format-short', 'min-views', 'not-comment-read']);
    assert.equal(sum[0].count, 8);
    assert.equal(sum[0].examples.length, 5);
    assert.equal(sum[0].examples[0].url, 'https://www.youtube.com/watch?v=s0');
  });
  test('an unknown reason is a programming error, not a silently-uncounted video', () => {
    assert.throws(() => new ExclusionLedger().add(v('a'), 'because'), /Unknown exclusion reason/);
  });
  test('items are capped so a huge run cannot bloat the saved report', () => {
    const l = new ExclusionLedger();
    for (let i = 0; i < 400; i++) l.add(v(`x${i}`), 'not-comment-read');
    assert.equal(l.items().length, 300);
    assert.equal(l.size, 400);
  });
  test('every reason that names a filter names one the form actually has', () => {
    const filters = new Set(Object.values(REASONS).map((r) => r.filter).filter(Boolean));
    assert.deepEqual([...filters].sort(), ['contentType', 'minViews', 'regionCode', 'relevanceLanguage']);
  });
  test('a missing title or view count does not break an entry', () => {
    const l = new ExclusionLedger();
    l.add({ videoId: 'gone' }, 'unavailable');
    assert.deepEqual([l.items()[0].title, l.items()[0].views], ['', null]);
  });
});

describe('languageDecision reports which signal settled it', () => {
  test('an audio-track mismatch', () => {
    const d = languageDecision('ta', { title: 'x', defaultAudioLanguage: 'hi' });
    assert.deepEqual([d.verdict, d.signal], [false, 'audio']);
  });
  test('a "Hindi Dubbed" title with no audio field', () => {
    const d = languageDecision('ta', { title: 'GALAXY Full Movie Hindi Dubbed 2026', defaultAudioLanguage: null });
    assert.deepEqual([d.verdict, d.signal], [false, 'named-language']);
  });
  test('Latin-word evidence for another language', () => {
    const d = languageDecision('en', { title: 'la receta de la abuela para el pan de la casa', defaultAudioLanguage: null });
    assert.deepEqual([d.verdict, d.signal], [false, 'latin-words']);
  });
  test('script evidence confirms', () => {
    const d = languageDecision('ta', { title: '\u0b87\u0ba8\u0bcd\u0ba4 \u0bb5\u0bc0\u0b9f\u0bbf\u0baf\u0bcb', defaultAudioLanguage: null });
    assert.deepEqual([d.verdict, d.signal], [true, 'script']);
  });
  test('no evidence either way is undecided, and undecided is kept', () => {
    const d = languageDecision('ta', { title: 'GHOST', defaultAudioLanguage: null });
    assert.deepEqual([d.verdict, d.signal], [null, 'undecided']);
  });
  test('matchesRequestedLanguage is exactly its verdict', () => {
    for (const video of [
      { title: 'x', defaultAudioLanguage: 'hi' },
      { title: 'GHOST', defaultAudioLanguage: null },
      { title: 'x', defaultAudioLanguage: 'ta' },
    ]) assert.equal(matchesRequestedLanguage('ta', video), languageDecision('ta', video).verdict);
  });
});

describe('calibrated evidence', () => {
  const base = { channelMode: false, scored: 20, distinctChannels: 12, topics: [], commentVideos: 25, commentsAnalysed: 300, outlierChannels: 10, runsCompared: 3 };

  test('one video moves a ranked score by 100/(n-1) points, which is why 8 is the default', () => {
    assert.equal(rankSwing(8), 14);
    assert.equal(rankSwing(5), 25);
    assert.equal(rankSwing(1), 100);
  });
  test('a broad niche run is solid on every output', () => {
    const e = assessEvidence(base);
    assert.deepEqual([e.heat.level, e.gaps.level, e.outliers.level, e.recurrence.level], ['solid', 'solid', 'solid', 'solid']);
  });
  test('the real Madan Gowri week: 7 of 7 long uploads is small but complete, not weak', () => {
    const e = assessEvidence({ channelMode: true, scored: 7, distinctChannels: 1, population: 7, commentVideos: 7, commentsAnalysed: 60, runsCompared: 1 });
    assert.equal(e.heat.level, 'small');
    assert.match(e.heat.why, /complete output/);
    assert.match(e.heat.why, /not a sample/);
    assert.equal(thinPoolFrom(e, { cause: 'cadence', detail: 'd' }, {}, []), null);
  });
  test('a channel walk cut short is judged as a sample, not as the whole population', () => {
    const e = assessEvidence({ channelMode: true, scored: 4, distinctChannels: 1, population: 4, uploadsTruncated: true });
    assert.equal(e.heat.level, 'thin');
  });
  test('a channel with 2 uploads cannot be ranked even though it is complete', () => {
    assert.equal(assessEvidence({ channelMode: true, scored: 2, distinctChannels: 1, population: 2 }).heat.level, 'thin');
  });
  test('a niche pool of 12 videos from 3 channels is small: breadth has nothing to count', () => {
    assert.equal(assessEvidence({ ...base, scored: 12, distinctChannels: 3 }).heat.level, 'small');
  });
  test('a niche pool under the floor is thin and earns the banner', () => {
    const e = assessEvidence({ ...base, scored: 3, distinctChannels: 3 });
    assert.equal(e.heat.level, 'thin');
    const pool = thinPoolFrom(e, { cause: 'niche', detail: 'Only 3 videos matched this niche in this window.' }, { window: '7d', contentType: 'both' }, []);
    assert.equal(pool.videos, 3);
    assert.equal(pool.swing, 50);
    assert.match(pool.warning, /weak evidence/);
  });
  test('gaps are judged on comments, not on how many videos were scored', () => {
    assert.equal(assessEvidence({ ...base, scored: 3, commentVideos: 25, commentsAnalysed: 300 }).gaps.level, 'solid');
    assert.equal(assessEvidence({ ...base, commentVideos: 7, commentsAnalysed: 60 }).gaps.level, 'small');
    assert.equal(assessEvidence({ ...base, commentVideos: 2, commentsAnalysed: 10 }).gaps.level, 'thin');
    assert.equal(assessEvidence({ ...base, commentVideos: 0, commentsAnalysed: 0 }).gaps.level, 'thin');
  });
  test('outliers and recurrence are n/a when not applicable, never "weak"', () => {
    assert.equal(assessEvidence({ ...base, channelMode: true, outlierChannels: null }).outliers.level, 'n/a');
    assert.equal(assessEvidence({ ...base, outlierChannels: null }).outliers.level, 'n/a');
    assert.equal(assessEvidence({ ...base, runsCompared: 0 }).recurrence.level, 'n/a');
    assert.equal(assessEvidence({ ...base, runsCompared: 1 }).recurrence.level, 'small');
  });
  test('a topic on one video is thin, one channel is small, otherwise solid', () => {
    assert.equal(assessTopic({ videos: [1] }).level, 'thin');
    assert.equal(assessTopic({ videos: [1, 2], breadth: 1 }).level, 'small');
    assert.equal(assessTopic({ videos: [1, 2], breadth: 1 }, { channelMode: true }).level, 'solid');
    assert.equal(assessTopic({ videos: [1, 2, 3], breadth: 3 }).level, 'solid');
  });
  test('the topics output says how many topics rest on a single video', () => {
    const e = assessEvidence({ ...base, topics: [{ videos: [1], breadth: 1 }, { videos: [1, 2], breadth: 2 }] });
    assert.equal(e.topics.level, 'small');
    assert.match(e.topics.why, /1 of 2/);
  });
});

describe('why the set is the size it is', () => {
  const funnel = (found, scored) => [{ key: 'found', count: found }, { key: 'scored', count: scored }];
  const filterReason = { kind: 'excluded', filter: 'contentType', label: 'A Short, with long-form selected', count: 7 };

  test('blames the filters when they removed a large share', () => {
    const r = explainShortfall({ funnel: funnel(14, 7), byReason: [filterReason], channelMode: true });
    assert.equal(r.cause, 'filters');
    assert.match(r.detail, /7 of 14/);
  });
  test('a channel that simply published little is cadence, and dropping filters would not help', () => {
    const r = explainShortfall({ funnel: funnel(4, 4), byReason: [], channelMode: true });
    assert.equal(r.cause, 'cadence');
    assert.match(r.detail, /published 4 uploads/);
  });
  test('a niche with few matches is the niche or window, not the filters', () => {
    assert.equal(explainShortfall({ funnel: funnel(9, 9), byReason: [], channelMode: false }).cause, 'niche');
  });
  test('unavailable videos are not blamed on a filter', () => {
    const r = explainShortfall({ funnel: funnel(10, 5), byReason: [{ kind: 'excluded', filter: null, label: 'x', count: 5 }], channelMode: false });
    assert.notEqual(r.cause, 'filters');
  });
  test('suggestions are ordered by cause: filters first when they are to blame, wider search first otherwise', () => {
    const q = { window: '7d', relevanceLanguage: 'ta', contentType: 'long', deepScan: false, channelMode: false, minViews: 0 };
    assert.match(suggestionsFor('filters', q)[0], /both formats/);
    assert.equal(suggestionsFor('niche', q)[0], 'widen the time window');
  });
  test('it never suggests widening a window that is already 90 days, or deep scan in channel mode', () => {
    const s = suggestionsFor('niche', { window: '90d', channelMode: true, deepScan: false, contentType: 'both', minViews: 0 });
    assert.deepEqual(s, []);
  });
});

describe('markdown export carries the funnel', () => {
  test('one line says how many were found, scored and why the rest were left out', () => {
    const md = reportToMarkdown({
      query: { niche: 'n', window: '7d' }, generatedAt: '2026-10-25T00:00:00Z', gaps: [], topics: [], stats: { videosAnalyzed: 7, commentsAnalyzed: 60 },
      exclusions: { funnel: [{ key: 'found', count: 14 }, { key: 'scored', count: 7 }], byReason: [{ kind: 'excluded', count: 7, label: 'A Short, with long-form selected' }] },
      evidence: { heat: { level: 'small' }, gaps: { level: 'solid' } },
    });
    assert.match(md, /14 found, 7 scored; left out: 7 a short, with long-form selected/);
    assert.match(md, /Evidence: heat small\./);
  });
});

describe('make-it v3: hooks, markers and formula labels', () => {
  test('a bare [NEEDS SOURCE] marker is counted and its words are not checked as names', () => {
    const r = finalizeBrief({ beats: [{ beat: 'body', covers: 1, seconds: 60, points: ['Delta is a summary [NEEDS SOURCE]', 'and [NEEDS SOURCE: Platform docs]'] }] }, { title: 'T', corpus: 'delta' });
    assert.equal(r.beats[0].needsSource, 2);
    assert.deepEqual(r.beats[0].unverifiedNames, []);
    assert.equal(r.checks.needsSource, 2);
  });
  test('claimed formula ids are validated, forgiving one stray "the-" prefix', () => {
    assert.equal(normalizeFormulaId('the-contrarian-flip').id, 'contrarian-flip');
    assert.equal(normalizeFormulaId('warning').id, 'the-warning');
    assert.equal(normalizeFormulaId('not-a-formula'), null);
    assert.equal(normalizeFormulaId(null), null);
  });
  test('a Tamil hook with no wording match shows the model\'s validated label, not "Unclassified"', () => {
    const r = finalizeBrief({ hooks: [{ text: 'ஒரு footprint cell-ஐ எடுத்து அப்படியே உடைக்கிறேன் — எந்த விலையில் bid ஓடிச்சு என்று காட்டுகிறேன்.', formula_id: 'the-teardown' }] }, { title: 'T' });
    assert.equal(r.hooks[0].formula, 'The Teardown');
    assert.equal(r.hooks[0].formulaSource, 'model');
  });
  test('weak openers are caught in English, Tamil, Tanglish and Hindi', () => {
    assert.equal(weakOpener('In this video I will show you how to read a footprint'), true);
    assert.equal(weakOpener('“இந்த வீடியோவில் footprint chart-ஐ காட்டுகிறேன்'), true);
    assert.equal(weakOpener('Indha videola naan solren'), true);
    assert.equal(weakOpener('इस वीडियो में हम देखेंगे'), true);
    assert.equal(weakOpener('You read footprint charts wrong, and the tape proves it?'), false);
  });
  test('the partial checklist matches Tamil second person by prefix, Latin words whole', () => {
    const p = partialHookCheck('நீங்கள் footprint chart-ஐ வெறும் volume bar-ஆ பார்க்கிறீர்கள் — அதன் உண்மையான தகவல் என்ன?');
    assert.equal(p.checks.find((c) => c.id === 'address').pass, true);
    assert.equal(p.checks.find((c) => c.id === 'question').pass, true);
    assert.equal(partialHookCheck('We need a better way to read the tape today friends').checks.find((c) => c.id === 'address').pass, false);
  });
  test('an "In this video" opener ranks below a hook that starts with the thing itself, scored or not', () => {
    const r = finalizeBrief({ hooks: [
      { text: 'இந்த வீடியோவில் footprint chart-ஐ cell-க்கு cell எப்படிப் படிக்கிறது என்று காட்டுகிறேன்.' },
      { text: 'நீங்கள் footprint chart-ஐ வெறும் volume bar-ஆ பார்க்கிறீர்கள் — அதன் உண்மையான தகவல் என்ன?' },
    ] }, { title: 'T' });
    assert.match(r.bestHooks[0].hook, /^நீங்கள்/);
    assert.equal(r.hooks[1].weakOpener, true);
    assert.ok(r.hooks[0].partial.passed > r.hooks[1].partial.passed);
  });
});

describe('make-it v3: length from essentials', () => {
  const ess = (secs) => secs.map((s, i) => ({ point: `essential ${i + 1}`, answers: [1], seconds: s }));
  const body = (covers, seconds) => ({ beat: 'body', covers, seconds, points: ['p'] });
  const frame = [{ beat: 'turn', seconds: 20, points: ['t'] }, { beat: 'payoff', seconds: 20, points: ['p'] }, { beat: 'close', seconds: 10, points: ['c'] }];
  const run = (essentials, beats, opts = {}) => finalizeBrief({ essentials, beats }, { title: 'T', corpus: '', evidenceCount: 3, ...opts });

  test('a draft that teaches what was asked, at about its budget, fits', () => {
    const r = run(ess([90, 120, 90]), [frame[0], body(1, 90), body(2, 120), body(3, 100), frame[1], frame[2]]);
    assert.equal(r.length.verdict, 'fits');
    assert.equal(r.length.offerRedraft, false);
    assert.deepEqual(r.essentials.map((e) => e.coveredBy), [[2], [3], [4]]);
  });
  test('beats nobody asked for make it padded, name the beat, and offer the shorter cut', () => {
    // 3 essentials (5:00 with the frame) drafted at 7:24 with two extra beats.
    const r = run(ess([80, 90, 80]), [frame[0], body(1, 80), body(2, 90), body(3, 80), body(null, 70), body(9, 74), frame[1], frame[2]]);
    assert.equal(r.length.verdict, 'padded');
    assert.equal(r.length.draft, 444);
    assert.equal(r.length.needed, 300);
    assert.equal(r.length.suggestedMinutes, 5);
    assert.equal(r.length.offerRedraft, true);
    assert.equal(r.beats[4].offPlan, true);
    assert.equal(r.beats[5].offPlan, true);
    assert.ok(r.length.reasons.some((x) => /Beat 5 teaches nothing/.test(x)));
  });
  test('a beat far longer than its essential is stretched', () => {
    const r = run(ess([60, 60]), [frame[0], body(1, 200), body(2, 60), frame[1]]);
    assert.equal(r.beats[1].stretched, true);
    assert.equal(r.length.verdict, 'padded');
  });
  test('a draft well under what its essentials need is rushed', () => {
    const r = run(ess([200, 200, 200]), [frame[0], body(1, 100), body(2, 100), body(3, 100), frame[1]]);
    assert.equal(r.length.verdict, 'rushed');
  });
  test('an essential citing no real comment is unrequested; one no beat teaches is reported', () => {
    const r = run([{ point: 'asked', answers: [2], seconds: 60 }, { point: 'nobody asked', answers: [7, 'x'], seconds: 60 }, { point: 'the request', answers: ['q'], seconds: 60 }],
      [frame[0], body(1, 60), body(2, 60), frame[1]]);
    assert.equal(r.essentials[1].unrequested, true);
    assert.deepEqual(r.essentials[2].answers, ['q']);
    assert.equal(r.essentials[2].unrequested, false);
    assert.ok(r.length.reasons.some((x) => /Essential 3 .* not taught/.test(x)));
  });
  test('long-form whose essentials fit in a minute could be a Short; a Short that needs more says so', () => {
    assert.equal(run(ess([20]), [{ beat: 'turn', seconds: 10, points: ['t'] }, body(1, 20)]).length.verdict, 'wrong-format');
    const s = run([{ point: 'a', answers: [1], seconds: 40 }, { point: 'b', answers: [1], seconds: 50 }], [body(1, 40), body(2, 50)], { format: 'Short' });
    assert.equal(s.length.verdict, 'wrong-format');
    assert.match(s.length.summary, /A Short can cover essential 1/);
  });
  test('thin demand adds the early-signal advice on long-form only', () => {
    const opportunity = buildOpportunity({ question: 'q', evidence: [{ text: 'Footprint video', likes: 1, videoId: 'a' }, { text: 'x', likes: 0, videoId: 'a' }, { text: 'y', likes: 0, videoId: 'b' }] }, { thinComments: 3, thinLikes: 5 });
    assert.equal(opportunity.earlySignal, true);
    assert.equal(opportunity.videos, 2);
    assert.equal(opportunity.likes, 1);
    const r = run(ess([120, 120]), [frame[0], body(1, 120), body(2, 120), frame[1]], { opportunity });
    assert.match(r.length.earlySignal, /3 comments and 1 like/);
    assert.equal(buildOpportunity({ evidence: [{ text: 'x', likes: 400 }] }, { thinComments: 3, thinLikes: 5 }).earlySignal, false);
  });
  test('an old-shape brief (no essentials) has no length verdict and does not crash', () => {
    const r = finalizeBrief({ beats: [{ beat: 'turn', say: 'hello there friends' }] }, { title: 'T' });
    assert.equal(r.length, null);
    assert.deepEqual(r.essentials, []);
  });
  test('needs default to verify; prepare is kept', () => {
    const r = finalizeBrief({ needs: [{ claim: 'delta formula' }, { kind: 'Prepare', claim: 'a recorded session' }] }, { title: 'T' });
    assert.deepEqual(r.needs.map((n) => n.kind), ['verify', 'prepare']);
  });
  test('the prompt has no length quota, and redraft options change it', () => {
    const p = systemPrompt({ format: 'long-form' });
    assert.match(p, /Never add a beat, example, tangent or recap to reach a length/);
    assert.doesNotMatch(p, /4-6 body beats/);
    assert.match(systemPrompt({ format: 'long-form', targetMinutes: 5 }), /fit it in about 5 minutes/);
    assert.match(systemPrompt({ format: 'long-form', style: 'script' }), /EVERY beat, body beats included/);
    assert.match(systemPrompt({ format: 'Short' }), /under 60 seconds/);
  });
});

describe('make-it v3: search terms and the title suggestion', () => {
  test('request phrasing is flagged as not a search', () => {
    assert.equal(requestPhrase('orderflow parthi video'), true);
    assert.equal(requestPhrase('footprint chart pathi video podunga'), true);
    assert.equal(requestPhrase('please make a video on delta'), true);
    assert.equal(requestPhrase('footprint chart tamil'), false);
    assert.equal(requestPhrase('footprint chart epdi padikurathu'), false);
  });
  test('the query test marks request-shaped queries', () => {
    const q = queryTest(['orderflow parthi video', 'footprint chart tamil'], 'T', '');
    assert.deepEqual(q.map((x) => x.request), [true, false]);
  });
  test('a title fix is shown only when it carries more of the real search words', () => {
    const seo = { queries: ['footprint chart tamil', 'orderflow parthi video', 'footprint chart epdi padikurathu'], description_opening: '', tags: [] };
    const r = finalizeBrief({ seo, title_fix: 'Footprint Chart Tamil: epdi padikurathu' }, { title: 'Footprint Charts: Reading The Data', corpus: 'footprint chart' });
    assert.equal(r.titleFix.title, 'Footprint Chart Tamil: epdi padikurathu');
    assert.ok(r.titleFix.coverage > r.titleFix.originalCoverage);
    const worse = finalizeBrief({ seo, title_fix: 'Order Flow Secrets' }, { title: 'Footprint Chart Tamil Guide', corpus: '' });
    assert.equal(worse.titleFix, null);
    const invented = finalizeBrief({ seo, title_fix: 'Footprint Chart Tamil: 5 Rules' }, { title: 'T', corpus: 'footprint chart' });
    assert.equal(invented.titleFix, null);
  });
  test('titleCoverage averages the share of each query in the title', () => {
    assert.equal(titleCoverage(['footprint chart tamil', 'delta bar'], 'Footprint Chart Tamil'), 0.5);
  });
});

describe('make-it v3: the core cut and query words in any script', () => {
  const frame = [{ beat: 'turn', seconds: 20, points: ['t'] }, { beat: 'payoff', seconds: 20, points: ['p'] }];
  const body = (covers, seconds) => ({ beat: 'body', covers, seconds, points: ['p'] });
  test('an essential one low-liked comment asked for is optional, and the core cut leaves it out', () => {
    const r = finalizeBrief({
      essentials: [
        { point: 'what a footprint is', answers: [1, 2, 'q'], seconds: 120 },
        { point: 'reading a row', answers: [1, 'q'], seconds: 180 },
        { point: 'version lag', answers: [3], seconds: 130 },
      ],
      beats: [frame[0], body(1, 120), body(2, 180), body(3, 130), frame[1]],
    }, { title: 'T', evidenceCount: 3, evidenceLikes: [1, 0, 0] });
    assert.equal(r.length.verdict, 'fits');
    assert.deepEqual(r.essentials.map((e) => e.thin), [false, false, true]);
    assert.equal(r.length.core.seconds, 340);
    assert.equal(r.length.core.minutes, 6);
    assert.deepEqual(r.length.core.drop, [3]);
    assert.match(r.length.core.note, /Essential 3 rests on a single comment/);
  });
  test('one comment with many likes is not optional', () => {
    const r = finalizeBrief({ essentials: [{ point: 'a', answers: [1], seconds: 120 }, { point: 'b', answers: [2], seconds: 120 }], beats: [body(1, 120), body(2, 120)] },
      { title: 'T', evidenceCount: 2, evidenceLikes: [300, 0] });
    assert.deepEqual(r.essentials.map((e) => e.thin), [false, true]);
  });
  test('the core cut prompt drops single-comment side-topics', () => {
    assert.match(systemPrompt({ format: 'long-form', core: true, targetMinutes: 6 }), /CORE CUT.*Aim for about 6 minutes/s);
  });
  test('Tamil query words count, and match across a suffix', () => {
    const [q] = queryTest(['footprint chart எப்படி படிக்கலாம்'], 'Footprint Chart: Reading The Data', '');
    assert.equal(q.coverage, 0.5);
    assert.deepEqual(q.missing, ['எப்படி', 'படிக்கலாம்']);
    const [q2] = queryTest(['footprint chart படிக்கலாம்'], 'Footprint Chart படிக்க', '');
    assert.equal(q2.inTitle, true);
  });
});

describe('make-it v3: small false positives', () => {
  test("contractions of I are not names", () => {
    assert.deepEqual(unverifiedNames("So here, I'm going to show what I've found and Ramesh said.", ''), ['Ramesh']);
  });
  test('the language rule covers essentials and needs too', () => {
    assert.match(systemPrompt({ format: 'long-form', language: 'Tamil' }), /write the essentials, needs, hooks/);
  });
});

describe('make-it v3: a measured script is judged by its words, not the model guess', () => {
  const prose = (n) => Array(n).fill('word').join(' ');
  test('full prose beats are measured, never "rushed" against inflated estimates, and the core cut uses the measured time', () => {
    const r = finalizeBrief({
      essentials: [
        { point: 'what it is', answers: [1, 'q'], seconds: 120, demo: true },
        { point: 'reading a row', answers: [1, 2], seconds: 170, demo: true },
        { point: 'version lag', answers: [3], seconds: 130 },
      ],
      beats: [
        { beat: 'turn', say: prose(40) },
        { beat: 'body', covers: 1, say: prose(150) },
        { beat: 'body', covers: 2, say: prose(150) },
        { beat: 'body', covers: 3, say: prose(150) },
        { beat: 'payoff', say: prose(50) },
      ],
    }, { title: 'T', evidenceCount: 3, evidenceLikes: [1, 0, 0] });
    assert.equal(r.length.basis, 'measured');
    assert.equal(r.length.draft, 216);
    assert.equal(r.length.best, 216);
    assert.equal(r.length.verdict, 'fits');
    assert.match(r.length.summary, /of speech, plus the screen time the demonstrations take/);
    assert.equal(r.length.core.seconds, 156);
    assert.equal(r.runtime.estimated, false);
  });
  test('long-form defaults to a full script; talking points are the option', () => {
    assert.match(systemPrompt({ format: 'long-form' }), /EVERY beat, body beats included/);
    assert.match(systemPrompt({ format: 'long-form', style: 'points' }), /3-5 short talking points/);
    assert.equal(finalizeBrief({}, { title: 'T' }).style, 'script');
    assert.equal(finalizeBrief({}, { title: 'T', style: 'points' }).style, 'points');
  });
});
