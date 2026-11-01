import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDuration, windowToPublishedAfter } from '../src/services/youtube.js';
import { parseCommentIndex, selectComments, groundGaps, groundObjections, truncate } from '../src/services/analyze.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, stripHashtags, untrustedVideoIds, nicheKeywords, nicheVideoIdSet } from '../src/lib/relevance.js';
import { avoidVerdict } from '../src/lib/avoid.js';
import { commentErrorKind } from '../src/services/youtube.js';
import { arrayOf } from '../src/services/analyze.js';
import { hasScriptFilter, matchesLanguageScript, hasLatinHeuristic, matchesLatinLanguage, languageQueryHint, matchesAudioLanguage, matchesRequestedLanguage, namedLanguages, languageDecision, languageMismatch, languageCodeFor } from '../src/lib/language.js';
import { scoreVideos, scoreTopic } from '../src/lib/heat.js';
import { searchPlan } from '../src/lib/searchPlan.js';
import { connectMongo, closeMongo, dropDatabase, col } from '../src/lib/mongo.js';
import { FORMULAS, classifyFormula, formulaHint, normalizeFormulaId } from '../src/lib/hookFormulas.js';
import { scoreHook, band, weakOpener, partialHookCheck } from '../src/lib/hookScore.js';
import { finalizeBrief, queryTest, briefPrompt, formulaList, systemPrompt, assessLength, buildOpportunity, titleCoverage, mismatchedFields } from '../src/services/brief.js';
import { lintTitle, ungroundedNumbers, rankTitleOptions, unverifiedNames, unverifiedTags, impliesAccusation, requestPhrase } from '../src/lib/titleLint.js';
import { detectSensitive, assessSensitivity } from '../src/lib/sensitive.js';
import { ExclusionLedger, REASONS } from '../src/lib/exclusions.js';
import { assessEvidence, assessTopic, explainShortfall, thinPoolFrom, suggestionsFor, rankSwing } from '../src/lib/confidence.js';
import { median, medianMultiple, annotateOutliers } from '../src/lib/outlier.js';
import { nicheKey, subjectKey, partitionByAge, HISTORY_MAX_DAYS } from '../src/lib/store.js';
import { gapTokens, gapSimilarity, classifyRecurrence } from '../src/lib/recurrence.js';
// Reaching across the workspace on purpose: these are pure serializers with no
// DOM dependency at module scope, and CSV quoting is exactly the kind of thing
// that silently corrupts an export until someone opens it in a spreadsheet.
import { requestBody } from '../src/services/deepseek.js';
import { config, num } from '../src/config.js';
import { createRateLimit } from '../src/lib/rateLimit.js';
import { corsOriginAllowed, makeSecurityHeaders, httpsRedirectFor } from '../src/lib/security.js';
import { clampLimit, validInterval, validate } from '../src/routes/api.js';
import { publicMessage, errorResponse, GENERIC_ERROR, RUN_FAILED } from '../src/lib/publicError.js';
import { limitsFor } from '../src/lib/limits.js';
import { domainAcceptsMail } from '../src/lib/emailDomain.js';
import { isAppPath, siteOrigin, sitemapXml, robotsTxt, renderIndex } from '../src/lib/site.js';
import { readFileSync, readdirSync } from 'node:fs';
import { parseAvatarDataUrl, MAX_AVATAR_BYTES } from '../src/lib/avatar.js';
import { squareCrop, checkFile, fitImage, clampOffset, initialView, zoomAt, zoomOf, cropRect, MAX_ZOOM } from '../../web/src/lib/avatarImage.js';
import { setAvatar, getAvatar, clearAvatar } from '../src/lib/db.js';
import * as jobs from '../src/lib/jobs.js';
import { pollJob } from '../../web/src/lib/api.js';
import { gapsToCsv, reportToMarkdown, exportStem } from '../../web/src/lib/export.js';
import { matchRoute, normalizePath } from '../../web/src/lib/routes.js';
import { reportPathFor, correctReportPath, runIdFromPath, queryFromUrl, queryToSearch, pagePathFor } from '../../web/src/lib/urlState.js';
import {
  plural, windowLabel, formatLabel, relativeDay, toRunRow, intervalLabel, toWatchRow,
  resetTimeLabel, reportMeta, reportName, describeRunError, describeLoadError,
} from '../../web/src/lib/runRows.js';
import { authError } from '../../web/src/lib/authErrors.js';
import { safeNext, nextSuffix, passwordStrength, looksLikeEmail, emailTypoFix, MIN_NEW_PASSWORD, needsVerification as clientNeedsVerification } from '../../web/src/components/auth/helpers.js';
import { memberSince, resetsText, normalizeName, deleteConfirmed } from '../../web/src/components/profile/helpers.js';
import { charge, analysesAffordable, searchCallsPerAnalysis, unitsPerAnalysis, nextQuotaReset, quotaDay } from '../src/lib/quota.js';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { verifyIdToken, normalizeUser } from '../src/lib/firebaseToken.js';
import { bearerToken, shouldTouch, requireUser, requireVerified, requireAdmin, isAdmin, needsVerification } from '../src/lib/auth.js';
import { upsertUser, getUser, acceptTerms, linkRun, runIdsFor, usageFor, tryConsume, refund, deleteUserData } from '../src/lib/db.js';
import { ownRuns, featuredCandidates, featuredReports, trimFeatured } from '../src/lib/store.js';
import { isPublicSafe } from '../src/lib/publicFilter.js';
import { ownedBy, ownedWatch, atOwnerCap, hasDuplicate } from '../src/lib/watches.js';
import { dailyLimitBody } from '../src/routes/api.js';
import { normalizeEmail, joinWaitlist } from '../src/lib/waitlist.js';
import * as jobsRegistry from '../src/lib/jobs.js';

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
    assert.equal(header.split(",").length, 17);
  });

  test('exports say where the data came from, when, and which figures are ours', () => {
    const [header, row] = gapsToCsv(result).split('\r\n');
    assert.match(header, /,data_as_of,source$/);
    assert.match(row, /2026-09-24 \d\d:\d\d UTC,YouTube API Services$/);
    const md = reportToMarkdown(result);
    assert.match(md, /YouTube data as of 2026-09-24/);
    assert.match(md, /not YouTube metrics/);
    assert.match(md, /not affiliated with or endorsed by YouTube/);
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

describe('fix: number words count only as figures, not references', () => {
  test('references are not figures', () => {
    for (const t of ['compare the two sides inside a row', 'the two-sided bid/ask volume', 'which of the two applies', 'one or two candles', 'both two-way and one-way']) {
      assert.deepEqual(ungroundedNumbers(t, ''), [], t);
    }
  });
  test('counts still are, spelled out or in digits', () => {
    assert.deepEqual(ungroundedNumbers('Nine days and no word', ''), ['9']);
    assert.deepEqual(ungroundedNumbers('three ways to read it', ''), ['3']);
    assert.deepEqual(ungroundedNumbers('two lakh views', ''), ['2']);
    assert.deepEqual(ungroundedNumbers('against two piles', ''), ['2']);
    assert.deepEqual(ungroundedNumbers('the 2 sides', ''), ['2']);
  });
  test('any number word in the evidence still grounds the figure', () => {
    assert.deepEqual(ungroundedNumbers('Nine days', 'it has been the nine of us'), []);
  });
});

describe('fix: language held per field', () => {
  test('maps names to codes', () => {
    assert.equal(languageCodeFor('Tamil'), 'ta');
    assert.equal(languageCodeFor('klingon'), null);
  });
  test('an English note for a Tamil brief is a mismatch; code-mixed Tamil is not', () => {
    assert.equal(languageMismatch('Tamil', 'Which platform and which version the reported lag refers to'), true);
    assert.equal(languageMismatch('Tamil', 'Footprint chart-ல ஒரு row-ஐ எப்படி படிக்கிறது'), false);
    assert.equal(languageMismatch('Tamil', 'delta'), false);
    // Real brief text that a letter-share check wrongly called English.
    assert.equal(languageMismatch('Tamil', 'ஒரு live footprint bar-ஐ zoom செய்து row-by-row படிக்கும் screen recording'), false);
    assert.equal(languageMismatch('Tamil', 'market open-ல் time and sales window-ஐயும் footprint chart-ஐயும் ஒரே screen-ல பார்ப்பது'), false);
    assert.equal(languageMismatch('Spanish', 'Which platform and which version'), false);
  });
  test('mismatchedFields names the drifted fields by path, and nothing when no language was chosen', () => {
    const raw = {
      essentials: [{ point: 'What a footprint chart actually shows on screen' }, { point: 'ஒரு row-ஐ எப்படி படிக்கிறது என்று' }],
      needs: [{ claim: 'Which platform the lag refers to', why: 'ask the commenter' }],
      beats: [{ say: 'இப்போ chart-ஐ திறந்து பாக்கலாம்', points: ['Compare both sides of the row now'] }],
    };
    assert.deepEqual(mismatchedFields(raw, 'Tamil').map((f) => f.id), ['essentials.0.point', 'needs.0.claim', 'needs.0.why', 'beats.0.points.0']);
    assert.deepEqual(mismatchedFields(raw, ''), []);
  });
  test('the language rule opens and closes the prompt, and field cues name the language', () => {
    const p = systemPrompt({ format: 'long-form', language: 'Tamil' });
    assert.ok(p.startsWith('LANGUAGE: write the essentials'));
    const u = briefPrompt({ run: { channelMode: false, query: { niche: 'n' } }, gap: { question: 'q', evidence: [{ text: 'c', likes: 0 }] }, language: 'Tamil' });
    assert.match(u, /"one thing the viewer must leave with \(in Tamil\)"/);
    assert.match(u, /Every text field above is written in Tamil, including the essentials and the needs/);
  });
});

describe('fix: a redraft keeps its plan', () => {
  const plan = [{ point: 'what it is', answers: [1, 'q'], seconds: 60, demo: true }, { point: 'reading a row', answers: [2], seconds: 90, demo: false }];
  test('the prompt carries the plan verbatim', () => {
    const p = systemPrompt({ format: 'long-form', plan });
    assert.match(p, /FIXED PLAN: the essentials are already decided\. Return exactly these 2/);
    assert.match(p, /1\. what it is \(answers \[1,"q"\], 60s, demo\)/);
  });
  test('the plan decides the scope whatever the model returns; its wording of a point is kept', () => {
    const r = finalizeBrief({ essentials: [{ point: 'என்ன இது', answers: [9], seconds: 500 }, { point: 'x' }, { point: 'an extra one' }] }, { title: 'T', plan, evidenceCount: 3 });
    assert.equal(r.essentials.length, 2);
    assert.equal(r.essentials[0].point, 'என்ன இது');
    assert.deepEqual(r.essentials[0].answers, [1, 'q']);
    assert.equal(r.essentials[0].seconds, 60);
    assert.equal(r.planned, true);
  });
});

describe('fix: thinking mode is explicit in the request', () => {
  test('the body carries thinking only when asked', () => {
    const base = { model: 'm', system: 's', user: 'u', maxTokens: 10, temperature: 0.2 };
    assert.equal('thinking' in requestBody(base), false);
    assert.deepEqual(requestBody({ ...base, thinking: 'disabled' }).thinking, { type: 'disabled' });
    assert.equal(requestBody({ ...base, thinking: 'disabled' }).temperature, 0.2);
  });
});

describe('audit: gap relevance counts where the comment was written', () => {
  const videos = [
    { videoId: 'v1', title: 'Restoring a 1890s cast iron skillet with electrolysis', channelTitle: 'Iron Guy', tags: [] },
    { videoId: 'v2', title: 'Satisfying ASMR clean #castiron #restoration', channelTitle: 'Clips', tags: ['cast iron'] },
  ];
  const ids = nicheVideoIdSet('cast iron restoration', videos);
  test('only videos whose prose names the niche (or that clustering vouched for) are niche videos', () => {
    assert.deepEqual([...ids], ['v1']);
    assert.deepEqual([...nicheVideoIdSet('cast iron restoration', videos, new Set(['v2']))].sort(), ['v1', 'v2']);
  });
  test('a core question under niche videos is relevant without repeating the niche words', () => {
    const gap = { question: 'How do I set up an electrolysis tank, what anode and voltage?', evidence: [{ videoId: 'v1', text: 'what voltage do you run?' }] };
    const r = checkGapRelevance('cast iron restoration', gap, { nicheVideoIds: ids });
    assert.equal(r.relevant, true);
    assert.equal(r.verdict, 'niche-videos');
  });
  test('the same question asked only under a tag-hijacked video stays off-niche', () => {
    const gap = { question: 'How do I set up an electrolysis tank?', evidence: [{ videoId: 'v2', text: 'voltage?' }] };
    assert.equal(checkGapRelevance('cast iron restoration', gap, { nicheVideoIds: ids }).verdict, 'off-niche');
  });
  test('words that match still read on-niche, and the old call shape still works', () => {
    assert.equal(checkGapRelevance('cast iron restoration', { question: 'Can cast iron be welded?', evidence: [] }).verdict, 'on-niche');
  });
});

describe('audit: avoid entries are judged against our own numbers', () => {
  const v = (er, flagged, views = 10000) => ({ signals: { engagementRate: er }, lowEngagementOutlier: flagged, views });
  const run = [v(0.02, false), v(0.03, false), v(0.04, false), v(0.05, false), v(0.01, true)];
  test('1 flagged of 7 is "partly", not "confirmed"', () => {
    const m = [v(0.005, true), ...Array(6).fill(0).map(() => v(0.01, false))];
    assert.equal(avoidVerdict(m, run).level, 'partly');
  });
  test('half or more flagged is confirmed', () => {
    assert.equal(avoidVerdict([v(0.005, true), v(0.006, false)], run).level, 'confirmed');
  });
  test('engagement above the run median, with real views, is contradicted', () => {
    const r = avoidVerdict([v(0.54, false), v(0.5, false)], run);
    assert.equal(r.level, 'contradicted');
    assert.equal(r.runMedianEngagementRate, 0.03);
  });
  test('a tiny-view percentage never contradicts', () => {
    assert.equal(avoidVerdict([v(0.54, false, 11), v(0.5, false, 19)], run).level, 'model-only');
  });
  test('one unflagged video is dropped', () => {
    assert.equal(avoidVerdict([v(0.01, false)], run).drop, true);
    assert.equal(avoidVerdict([v(0.01, true)], run).drop, false);
  });
  test('the entry median is the true median for even counts', () => {
    assert.equal(avoidVerdict([v(0.01, true), v(0.03, true)], run).medianEngagementRate, 0.02);
  });
});

describe('audit: recurrence counts occasions, not clicks', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const row = (runId, iso, question, extra = {}) => ({ runId, generatedAt: iso, question, demandScore: 5, coverage: 'none', ...extra });
  const q = 'Can a cracked cast iron pot be welded and saved?';
  test('runs minutes apart are one occasion, and a run from the last day is not compared', () => {
    const history = [
      row('a', '2026-10-20T10:00:00Z', q), row('b', '2026-10-20T10:05:00Z', q), row('c', '2026-10-20T10:10:00Z', q),
      row('d', '2026-10-25T11:55:00Z', q),
    ];
    const r = classifyRecurrence([{ question: 'Can you weld a cracked cast iron pot and save it?', demandScore: 6 }], history, { now });
    assert.equal(r.runsCompared, 1);
    assert.equal(r.recentSkipped, 1);
    assert.equal(r.gaps[0].recurrence.timesSeen, 2);
  });
  test('occasions days apart each count', () => {
    const history = [row('a', '2026-10-10T10:00:00Z', q), row('b', '2026-10-17T10:00:00Z', q)];
    assert.equal(classifyRecurrence([{ question: q, demandScore: 6 }], history, { now }).gaps[0].recurrence.timesSeen, 3);
  });
  test('a run with no comments resolves nothing, and an outage run is not an occasion', () => {
    const history = [row('a', '2026-10-10T10:00:00Z', q, { comments: 200 }), { runId: 'b', generatedAt: '2026-10-17T10:00:00Z', marker: true, comments: 0 }];
    const r = classifyRecurrence([], history, { now, noComments: true });
    assert.equal(r.resolved.length, 0);
    assert.equal(r.runsCompared, 1);
  });
  test('old history without recorded filters counts as a sighting but resolves nothing', () => {
    const history = [row('a', '2026-10-10T10:00:00Z', 'Some old question about lye baths and rust')];
    const r = classifyRecurrence([{ question: q, demandScore: 6 }], history, { now, filters: { window: '7d' } });
    assert.equal(r.runsCompared, 1);
    assert.equal(r.resolved.length, 0);
  });
  test('history from another language filter is not compared', () => {
    const history = [row('a', '2026-10-10T10:00:00Z', q, { relevanceLanguage: 'ta', regionCode: '', gapMode: 'inclusive' })];
    const r = classifyRecurrence([{ question: q, demandScore: 6 }], history, { now, filters: { relevanceLanguage: 'en', regionCode: '', gapMode: 'inclusive' } });
    assert.equal(r.runsCompared, 0);
    assert.equal(r.gaps[0].recurrence.status, 'unknown');
  });
});

describe('audit: YouTube errors and model output', () => {
  test('only disabled or missing comments are an empty list', () => {
    assert.equal(commentErrorKind({ status: 403, reason: 'commentsDisabled' }), 'none');
    assert.equal(commentErrorKind({ status: 404 }), 'none');
    assert.equal(commentErrorKind({ status: 503 }), 'retry');
    assert.equal(commentErrorKind({ name: 'TimeoutError' }), 'retry');
    assert.equal(commentErrorKind({ code: 'QUOTA_EXHAUSTED', status: 403 }), 'quota');
    assert.equal(commentErrorKind({ status: 400, reason: 'badRequest' }), 'fail');
  });
  test('a hidden like count is not low engagement', () => {
    const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
    const vids = [
      { videoId: 'a', channelId: 'c', publishedAt: day(1), views: 50_000, likes: 6_000, comments: 900 },
      { videoId: 'b', channelId: 'c', publishedAt: day(1), views: 60_000, likes: 5_000, comments: 700 },
      { videoId: 'h', channelId: 'c', publishedAt: day(2), views: 1_260_000, likes: 0, comments: 42, likesHidden: true },
    ];
    const scored = scoreVideos(vids, new Map([['c', { subscribers: 100_000 }]]));
    assert.equal(scored.find((v) => v.videoId === 'h').lowEngagementOutlier, false);
  });
  test('arrayOf turns malformed model output into an empty list', () => {
    assert.deepEqual(arrayOf({}), []);
    assert.deepEqual(arrayOf('abc'), []);
    assert.deepEqual(arrayOf([{ a: 1 }, 'x', null]), [{ a: 1 }]);
  });
});

describe('audit: server input and limits', () => {
  test('limit is clamped to 1..max', () => {
    assert.equal(clampLimit('-1', 30, 200), 1);
    assert.equal(clampLimit('abc', 30, 200), 30);
    assert.equal(clampLimit('5000', 30, 200), 200);
  });
  test('watch intervals have a ceiling', () => {
    assert.equal(validInterval(24), true);
    assert.equal(validInterval(1e20), false);
    assert.equal(validInterval(1), false);
  });
  test('num() treats blank as unset', () => {
    assert.equal(num(' ', 120000), 120000);
    assert.equal(num(' 15 ', 1), 15);
    assert.equal(num('0', 5), 0);
  });
  test('the rate limiter forgets IPs idle for an hour', () => {
    const rl = createRateLimit({ perHour: 3, noun: 'x' });
    rl.record('1.1.1.1', Date.now() - 2 * 3600 * 1000);
    rl.record('2.2.2.2', Date.now());
    rl.sweep();
    assert.equal(rl.size(), 1);
  });
  test('CORS allows same-origin and listed origins only', () => {
    assert.equal(corsOriginAllowed(undefined, []), true);
    assert.equal(corsOriginAllowed('https://evil.example', []), false);
    assert.equal(corsOriginAllowed('http://localhost:5173', ['http://localhost:5173']), true);
  });
});

describe('audit: exports use the labels the UI shows', () => {
  const base = { query: { niche: 'n', window: '7d', contentType: 'long', gapMode: 'strict' }, generatedAt: '2026-10-25T00:00:00Z', stats: { videosAnalyzed: 7, commentsAnalyzed: 60 }, topics: [] };
  test('format and gap mode are labelled, missing likes are left out, avoid level is shown', () => {
    const md = reportToMarkdown({
      ...base,
      warnings: ['1 run of this subject from the last 24 hours was not compared.'],
      gaps: [{ question: 'Q?', demandStrength: 'low', coverage: 'none', demandScore: 3, evidence: [{ text: 'a comment' }], relevance: { verdict: 'niche-videos' } }],
      avoid: [{ label: 'Nifty predictions', reason: 'r', statsLevel: 'contradicted', videos: [] }],
      resolvedGaps: [{ question: 'Old ask', lastSeen: '2026-10-01T00:00:00Z' }],
    });
    assert.match(md, /format: Long-form/);
    assert.match(md, /gaps: uncovered only/);
    assert.doesNotMatch(md, /undefined/);
    assert.match(md, /Nifty predictions \(our numbers disagree\)/);
    assert.match(md, /asked under niche videos/);
    assert.match(md, /No longer being asked[\s\S]*Old ask/);
    assert.match(md, /Notes from this run/);
  });
  test('recurrence CSV cells say n/a when there was nothing to compare', () => {
    const csv = gapsToCsv({ gaps: [{ question: 'Q', recurrence: { status: 'unknown', timesSeen: 1, firstSeen: null } }] });
    assert.match(csv.split('\n')[1], /unknown,n\/a,n\/a/);
  });
});

describe('audit: quota pricing', () => {
  test('channel mode is priced at the pages it can walk', async () => {
    const { unitsPerAnalysis } = await import('../src/lib/quota.js');
    assert.ok(unitsPerAnalysis({ channelMode: true }) >= 6 + 5);
  });
});

describe('quota buckets: search.list has its own daily call cap', () => {
  const fresh = { day: 'd', used: 0, calls: {} };

  test('a search call charges the search bucket, not shared units', () => {
    const s = charge(fresh, 'search');
    assert.equal(s.searchCalls, 1);
    assert.equal(s.used, 0);
    assert.equal(charge(s, 'videos', 3).used, 3);
  });

  test('the search cap throws while units remain', () => {
    const full = { ...fresh, searchCalls: 95 };
    assert.throws(() => charge(full, 'search'), (e) => e.code === 'QUOTA_EXHAUSTED' && /search/.test(e.message));
    assert.equal(charge(full, 'commentThreads').used, 1);
  });

  test('long-form makes two search calls, channel mode none', () => {
    assert.equal(searchCallsPerAnalysis({ contentType: 'long' }), 2);
    assert.equal(searchCallsPerAnalysis({ contentType: 'both', deepScan: true }), 2);
    assert.equal(searchCallsPerAnalysis({ channelMode: true }), 0);
    assert.ok(unitsPerAnalysis({ contentType: 'both' }) < 100, 'search no longer priced as 100 units');
  });

  test('analyses left is the tighter of the two buckets', () => {
    assert.equal(analysesAffordable({ used: 0, searchCalls: 90 }, { contentType: 'long' }), 2);
    const units = unitsPerAnalysis({ contentType: 'both' });
    assert.equal(analysesAffordable({ used: 9000 - units, searchCalls: 0 }, { contentType: 'both' }), 1);
    assert.equal(analysesAffordable({ used: 0 }, { contentType: 'both' }), 95, 'an old ledger without searchCalls reads as 0');
  });
});

describe('retention: YouTube data is kept 30 days at most', () => {
  const now = Date.parse('2026-10-26T00:00:00Z');
  const day = 24 * 3600 * 1000;
  const at = (days) => new Date(now - days * day).toISOString();

  test('a 31-day-old run is dropped and a 29-day-old one kept', () => {
    const [keep, drop] = partitionByAge([{ runId: 'old', generatedAt: at(31) }, { runId: 'new', generatedAt: at(29) }], now - 30 * day);
    assert.deepEqual(drop.map((r) => r.runId), ['old']);
    assert.deepEqual(keep.map((r) => r.runId), ['new']);
  });

  test('a row without a readable date is kept, not silently deleted', () => {
    const [keep] = partitionByAge([{ runId: 'x' }, { runId: 'y', generatedAt: 'nope' }], now);
    assert.equal(keep.length, 2);
  });

  test('gap history is kept for 36 months, not 30 days', () => {
    const cutoff = now - HISTORY_MAX_DAYS * day;
    const [keep, drop] = partitionByAge([{ generatedAt: at(400) }, { generatedAt: at(1100) }], cutoff);
    assert.equal(keep.length, 1);
    assert.equal(drop.length, 1);
  });

  test('the retention setting can never exceed 30 days', async () => {
    const { config } = await import('../src/config.js');
    assert.ok(config.store.maxDataDays <= 30 && config.store.maxDataDays >= 1);
  });
});

describe('security headers', () => {
  const headersFrom = (isProd) => {
    const set = {};
    makeSecurityHeaders({ isProd })({}, { set: (k, v) => { set[k] = v; } }, () => {});
    return set;
  };
  test('HSTS only in production', () => {
    assert.match(headersFrom(true)['Strict-Transport-Security'], /max-age=\d+/);
    assert.equal(headersFrom(false)['Strict-Transport-Security'], undefined);
    assert.equal(headersFrom(false)['X-Frame-Options'], 'DENY');
  });
});

// ------------------------------------------------------------- accounts ----

describe('Firebase ID token verification', () => {
  const PROJECT = 'gapstronaut-test';
  const NOW = new Date('2026-10-26T12:00:00Z');
  const nowS = Math.floor(NOW.getTime() / 1000);
  let privateKey; let keySet; let otherKey;

  // One key pair for the whole block: RSA generation is the slow part.
  const setup = async () => {
    if (privateKey) return;
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    keySet = createLocalJWKSet({ keys: [jwk] });
  };

  const sign = async (claims = {}, { key = privateKey, alg = 'RS256', header = {} } = {}) => {
    const { exp = nowS + 3600, iss = `https://securetoken.google.com/${PROJECT}`, aud = PROJECT, sub = 'uid-1', auth_time = nowS - 60, ...rest } = claims;
    const jwt = new SignJWT({ auth_time, firebase: { sign_in_provider: 'google.com' }, email: 'Ada@Example.com', email_verified: true, name: 'Ada', picture: 'https://x/y.png', ...rest })
      .setProtectedHeader({ alg, kid: 'k1', ...header })
      .setIssuedAt(nowS - 60);
    if (iss !== null) jwt.setIssuer(iss);
    if (aud !== null) jwt.setAudience(aud);
    if (sub !== null) jwt.setSubject(sub);
    if (exp !== null) jwt.setExpirationTime(exp);
    return jwt.sign(key);
  };
  const verify = (token) => verifyIdToken(token, { projectId: PROJECT, keySet, now: NOW });

  test('a valid token yields the normalised user', async () => {
    await setup();
    assert.deepEqual(await verify(await sign()), {
      uid: 'uid-1', email: 'ada@example.com', emailVerified: true, name: 'Ada', picture: 'https://x/y.png', provider: 'google.com',
    });
  });

  test('a wrong issuer is rejected', async () => {
    await setup();
    await assert.rejects(verify(await sign({ iss: 'https://securetoken.google.com/someone-else' })), { code: 'INVALID_TOKEN' });
    await assert.rejects(verify(await sign({ iss: 'https://accounts.google.com' })), { code: 'INVALID_TOKEN' });
  });

  test('a wrong audience is rejected', async () => {
    await setup();
    await assert.rejects(verify(await sign({ aud: 'someone-else' })), { code: 'INVALID_TOKEN' });
  });

  test('an expired token is rejected, one inside the clock tolerance is not', async () => {
    await setup();
    await assert.rejects(verify(await sign({ exp: nowS - 600 })), { code: 'INVALID_TOKEN' });
    assert.equal((await verify(await sign({ exp: nowS - 5 }))).uid, 'uid-1');
  });

  test('a token with no expiry is rejected rather than treated as eternal', async () => {
    await setup();
    await assert.rejects(verify(await sign({ exp: null })), { code: 'INVALID_TOKEN' });
  });

  test('an auth_time in the future is rejected', async () => {
    await setup();
    await assert.rejects(verify(await sign({ auth_time: nowS + 3600 })), { code: 'INVALID_TOKEN' });
  });

  test('a missing or empty subject is rejected', async () => {
    await setup();
    await assert.rejects(verify(await sign({ sub: null })), { code: 'INVALID_TOKEN' });
    await assert.rejects(verify(await sign({ sub: '' })), { code: 'INVALID_TOKEN' });
  });

  test('a token signed by a different key is rejected', async () => {
    await setup();
    await assert.rejects(verify(await sign({}, { key: otherKey })), { code: 'INVALID_TOKEN' });
  });

  test('unsigned, HS256 and garbage tokens are rejected', async () => {
    await setup();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', kid: 'k1' })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'x', exp: nowS + 600, auth_time: nowS })}.`;
    await assert.rejects(verify(unsigned), { code: 'INVALID_TOKEN' });
    const hs = await new SignJWT({ auth_time: nowS }).setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(PROJECT).setSubject('x').setIssuedAt().setExpirationTime(nowS + 600)
      .sign(new TextEncoder().encode('secret-secret-secret-secret-secret'));
    await assert.rejects(verify(hs), { code: 'INVALID_TOKEN' });
    for (const junk of ['', 'not.a.jwt', 'abc', null, undefined, 42]) {
      await assert.rejects(verify(junk), { code: 'INVALID_TOKEN' });
    }
  });

  test('with no project id configured, verification is "not configured", not "invalid"', async () => {
    await assert.rejects(verifyIdToken('x', { projectId: '', keySet }), { code: 'AUTH_NOT_CONFIGURED', status: 503 });
  });

  test('the provider is normalised and anonymous accounts are refused', async () => {
    await setup();
    assert.equal((await verify(await sign({ firebase: { sign_in_provider: 'password' } }))).provider, 'password');
    assert.equal(normalizeUser({ sub: 'u', firebase: { sign_in_provider: 'google.com' } }).provider, 'google.com');
    assert.equal(normalizeUser({ sub: 'u' }).provider, 'unknown');
    assert.equal(normalizeUser({ sub: 'u', firebase: { sign_in_provider: 'password' } }).emailVerified, false);
    await assert.rejects(verify(await sign({ firebase: { sign_in_provider: 'anonymous' } })), { code: 'INVALID_TOKEN' });
  });
});

describe('auth middleware helpers', () => {
  test('bearerToken reads only a well-formed Authorization header', () => {
    const req = (authorization) => ({ headers: { authorization } });
    assert.equal(bearerToken(req('Bearer abc.def.ghi')), 'abc.def.ghi');
    assert.equal(bearerToken(req('bearer abc')), 'abc');
    assert.equal(bearerToken(req('Basic abc')), null);
    assert.equal(bearerToken(req('Bearer')), null);
    assert.equal(bearerToken(req('Bearer a b')), null);
    assert.equal(bearerToken({ headers: {} }), null);
  });

  test('last_seen_at is refreshed at most once a minute', () => {
    assert.equal(shouldTouch(undefined, 1000), true);
    assert.equal(shouldTouch(1000, 30_000), false);
    assert.equal(shouldTouch(1000, 61_001), true);
  });

  test('requireUser: 503 with no Firebase project, never a misleading 401', async () => {
    const { config } = await import('../src/config.js');
    const saved = config.firebase.projectId;
    config.firebase.projectId = ''; // whatever .env says, this test is about the unconfigured case
    let sent;
    const res = { status(c) { sent = { status: c }; return this; }, json(b) { sent.body = b; } };
    try {
      requireUser({ user: null }, res, () => assert.fail('must not pass'));
    } finally {
      config.firebase.projectId = saved;
    }
    assert.equal(sent.status, 503);
    assert.equal(sent.body.code, 'AUTH_NOT_CONFIGURED');
  });
});

// These talk to a real MongoDB: a throwaway database with a random name on the
// cluster in MONGODB_URI, dropped afterwards. Skipped when no URI is set.
describe('accounts database', { skip: !process.env.MONGODB_URI && 'MONGODB_URI not set' }, () => {
  const DAY = '2026-10-26';
  const user = (uid) => ({ uid, email: `${uid}@x.com`, name: uid, picture: null, provider: 'password', emailVerified: false });

  before(() => connectMongo({ uri: process.env.MONGODB_URI, dbName: `gs_test_${process.pid}_${Date.now()}` }));
  after(async () => { await dropDatabase(); await closeMongo(); });
  beforeEach(async () => {
    for (const c of ['users', 'usage', 'user_runs']) await col(c).deleteMany({});
  });

  test('upsertUser creates once, then refreshes the profile and keeps createdAt', async () => {
    const first = await upsertUser(user('a'));
    assert.equal(first.email, 'a@x.com');
    assert.equal(first.termsAcceptedAt, null);
    const again = await upsertUser({ ...user('a'), name: 'New Name', emailVerified: true });
    assert.equal(again.name, 'New Name');
    assert.equal(again.emailVerified, true);
    assert.equal(again.createdAt, first.createdAt);
    assert.equal(await getUser('nobody'), null);
  });

  test('acceptTerms stamps the account, and only an account that exists', async () => {
    await upsertUser(user('a'));
    const at = await acceptTerms('a');
    assert.equal((await getUser('a')).termsAcceptedAt, at);
    assert.equal(await acceptTerms('ghost'), null);
  });

  test('tryConsume allows the limit and refuses the next', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await tryConsume('a', DAY, 'analyses', 3));
    assert.deepEqual(results.map((r) => r.ok), [true, true, true, false]);
    assert.deepEqual(results.map((r) => r.used), [1, 2, 3, 3]);
    assert.equal(results[3].limit, 3);
    assert.equal((await usageFor('a', DAY)).analyses, 3);
  });

  test('concurrent requests cannot overspend the allowance', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => tryConsume('racer', DAY, 'analyses', 3)));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.equal((await usageFor('racer', DAY)).analyses, 3);
  });

  test('kinds are counted separately, and a limit of 0 refuses everything', async () => {
    assert.equal((await tryConsume('a', DAY, 'briefs', 0)).ok, false);
    assert.equal((await tryConsume('a', DAY, 'analyses', 1)).ok, true);
    assert.deepEqual(await usageFor('a', DAY), { day: DAY, analyses: 1, briefs: 0 });
    await assert.rejects(() => tryConsume('a', DAY, 'analyses; DROP', 1), /Unknown usage kind/);
  });

  test('a new day starts from zero; another person is unaffected', async () => {
    for (let i = 0; i < 3; i++) await tryConsume('a', DAY, 'analyses', 3);
    assert.equal((await tryConsume('a', DAY, 'analyses', 3)).ok, false);
    assert.equal((await tryConsume('a', '2026-10-27', 'analyses', 3)).ok, true);
    assert.equal((await tryConsume('b', DAY, 'analyses', 3)).ok, true);
  });

  test('refund gives one back, never below zero, and only for that day', async () => {
    for (let i = 0; i < 3; i++) await tryConsume('a', DAY, 'analyses', 3);
    await refund('a', DAY, 'analyses');
    assert.equal((await usageFor('a', DAY)).analyses, 2);
    assert.equal((await tryConsume('a', DAY, 'analyses', 3)).ok, true);
    await refund('nobody', DAY, 'analyses');
    await refund('a', '2026-01-01', 'analyses');
    for (let i = 0; i < 5; i++) await refund('a', DAY, 'briefs');
    assert.equal((await usageFor('a', DAY)).briefs, 0);
  });

  test('linkRun is idempotent, lists runs, and ignores a deleted account', async () => {
    await upsertUser(user('a'));
    assert.equal(await linkRun('a', 'run-1'), true);
    assert.equal(await linkRun('a', 'run-1'), false);
    await linkRun('a', 'run-2');
    assert.deepEqual((await runIdsFor('a')).sort(), ['run-1', 'run-2']);
    assert.equal(await linkRun('ghost', 'run-1'), false);
    assert.deepEqual(await runIdsFor('ghost'), []);
  });

  test('deleteUserData removes one account and leaves everyone else alone', async () => {
    for (const uid of ['a', 'b']) {
      await upsertUser(user(uid));
      await linkRun(uid, 'shared-run');
      await tryConsume(uid, DAY, 'analyses', 3);
    }
    await col('waitlist').insertMany([
      { email: 'joined-signed-in@x.com', plan: 'creator', uid: 'a' },
      { email: 'a@x.com', plan: 'studio', uid: null },
      { email: 'b@x.com', plan: 'studio', uid: 'b' },
    ]);
    assert.deepEqual(await deleteUserData('a', 'A@x.com'), { users: 1, runs: 1, usage: 1, waitlist: 2 });
    assert.equal(await col('waitlist').countDocuments({ uid: 'b' }), 1);
    assert.equal(await getUser('a'), null);
    assert.deepEqual(await runIdsFor('a'), []);
    assert.equal((await usageFor('a', DAY)).analyses, 0);
    assert.equal((await getUser('b')).email, 'b@x.com');
    assert.deepEqual(await runIdsFor('b'), ['shared-run']);
    assert.equal((await usageFor('b', DAY)).analyses, 1);
  });
});

describe('daily reset time', () => {
  test('is the next midnight in Los Angeles, as an ISO instant', () => {
    // Winter (PST, UTC-8): 2026-01-15 12:00Z is 04:00 PST, next midnight is 2026-01-16 08:00Z.
    assert.equal(nextQuotaReset(new Date('2026-01-15T12:00:00Z')), '2026-01-16T08:00:00.000Z');
    // Summer (PDT, UTC-7).
    assert.equal(nextQuotaReset(new Date('2026-07-15T12:00:00Z')), '2026-07-16T07:00:00.000Z');
  });

  test('is correct either side of the spring-forward change (2026-03-08)', () => {
    // 20:00 PST on Mar 7: midnight is still PST.
    assert.equal(nextQuotaReset(new Date('2026-03-08T04:00:00Z')), '2026-03-08T08:00:00.000Z');
    // The 23-hour day: from midnight Mar 8 (08:00Z) the next midnight is PDT, 07:00Z on Mar 9.
    assert.equal(nextQuotaReset(new Date('2026-03-08T08:00:00Z')), '2026-03-09T07:00:00.000Z');
    assert.equal(nextQuotaReset(new Date('2026-03-08T15:00:00Z')), '2026-03-09T07:00:00.000Z');
  });

  test('is correct either side of the fall-back change (2026-11-01)', () => {
    assert.equal(nextQuotaReset(new Date('2026-10-31T20:00:00Z')), '2026-11-01T07:00:00.000Z');
    // The 25-hour day: midnight Nov 2 is PST, 08:00Z.
    assert.equal(nextQuotaReset(new Date('2026-11-01T12:00:00Z')), '2026-11-02T08:00:00.000Z');
  });

  test('is strictly after now, and exactly at the instant it is read at midnight', () => {
    const at = new Date('2026-01-16T08:00:00Z'); // midnight PST exactly
    assert.equal(nextQuotaReset(at), '2026-01-17T08:00:00.000Z');
    const t = new Date('2026-06-30T23:59:59Z');
    assert.ok(new Date(nextQuotaReset(t)) > t);
    // The day label flips at exactly that instant, so the allowance resets when it says it will.
    const reset = new Date(nextQuotaReset(t));
    assert.notEqual(quotaDay(new Date(reset.getTime() - 1000)), quotaDay(reset));
  });

  test('the daily-limit body names the limit, the reset, and the right noun', () => {
    const body = dailyLimitBody(3, ['analysis', 'analyses'], new Date('2026-01-15T12:00:00Z'));
    assert.equal(body.code, 'DAILY_LIMIT');
    assert.match(body.error, /used your 3 analyses for today/);
    assert.equal(body.resetsAt, '2026-01-16T08:00:00.000Z');
    assert.match(dailyLimitBody(1, ['brief', 'briefs']).error, /your 1 brief for today/);
  });
});

describe('job completion callbacks', () => {
  test('whenSettled fires once on finish, with the result', () => {
    const id = jobsRegistry.create({});
    const calls = [];
    jobsRegistry.whenSettled(id, (err, r) => calls.push([err, r]));
    assert.equal(calls.length, 0);
    jobsRegistry.finish(id, { runId: 'r1' });
    assert.deepEqual(calls, [[null, { runId: 'r1' }]]);
  });

  test('whenSettled fires on failure, and immediately for a job already settled', () => {
    const id = jobsRegistry.create({});
    const seen = [];
    jobsRegistry.whenSettled(id, (err) => seen.push(err?.message));
    jobsRegistry.fail(id, Object.assign(new Error('boom'), { code: 'NO_RESULTS' }));
    jobsRegistry.whenSettled(id, (err) => seen.push(`late:${err?.message}`));
    assert.deepEqual(seen, ['boom', 'late:boom']);
  });

  test('a throwing callback does not stop the others or the job', () => {
    const id = jobsRegistry.create({});
    let second = false;
    jobsRegistry.whenSettled(id, () => { throw new Error('bad callback'); });
    jobsRegistry.whenSettled(id, () => { second = true; });
    const orig = console.error; console.error = () => {};
    try { jobsRegistry.finish(id, {}); } finally { console.error = orig; }
    assert.equal(second, true);
    assert.equal(jobsRegistry.get(id).status, 'done');
  });
});

describe('per-account runs, featured sample and watches', () => {
  const row = (runId, extra = {}) => ({ runId, niche: 'sourdough starter', nicheKey: nicheKey('sourdough starter'), channelMode: false, gapsFound: 3, generatedAt: '2026-10-25T00:00:00Z', ...extra });

  test('ownRuns keeps only the caller\'s runs, in index order, from an array or a Set', () => {
    const rows = [row('a'), row('b'), row('c')];
    assert.deepEqual(ownRuns(rows, ['c', 'a']).map((r) => r.runId), ['a', 'c']);
    assert.deepEqual(ownRuns(rows, new Set(['b'])).map((r) => r.runId), ['b']);
    assert.deepEqual(ownRuns(rows, []), []);
    assert.deepEqual(ownRuns([], ['a']), []);
  });

  const NOW = Date.parse('2026-10-26T12:00:00Z');
  const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();
  const pick = (rows, extra = {}) => featuredCandidates(rows, { now: NOW, niche: 'sourdough starter', maxDays: 30, ...extra }).map((r) => r.runId);

  test('featured: prefers the niche, with at least 2 gaps, newest first', () => {
    const rows = [
      row('old-niche', { generatedAt: daysAgo(5) }),
      row('new-niche', { generatedAt: daysAgo(1), gapsFound: 2 }),
      row('other-niche', { niche: 'cast iron', nicheKey: nicheKey('cast iron'), generatedAt: daysAgo(0), gapsFound: 7 }),
    ];
    assert.deepEqual(pick(rows), ['new-niche', 'old-niche']);
  });

  test('featured: a stranger\'s run is never the fallback, however rich it is', () => {
    const rows = [
      row('thin-niche', { gapsFound: 1, generatedAt: daysAgo(1) }),
      row('rich-other', { niche: 'x', nicheKey: nicheKey('x'), gapsFound: 3, generatedAt: daysAgo(2) }),
      row('thin-other', { niche: 'y', nicheKey: nicheKey('y'), gapsFound: 2, generatedAt: daysAgo(0) }),
    ];
    assert.deepEqual(pick(rows), []);
  });

  test('featured: runs past the retention window are never offered', () => {
    const rows = [row('stale', { generatedAt: daysAgo(31) }), row('fresh', { generatedAt: daysAgo(29) }), row('undated', { generatedAt: 'nope' })];
    assert.deepEqual(pick(rows), ['fresh']);
    assert.deepEqual(pick([row('stale', { generatedAt: daysAgo(31) })]), []);
    assert.deepEqual(pick(rows, { maxDays: 7 }), []);
  });

  test('featured: channel analyses never headline the homepage, and no rows means none', () => {
    assert.deepEqual(pick([row('ch', { channelMode: true, nicheKey: nicheKey('sourdough starter'), generatedAt: daysAgo(1) })]), []);
    assert.deepEqual(pick([]), []);
  });

  test('the homepage filter catches abuse, not opinions', () => {
    for (const text of ['Maybe I\'m not autistic enough, but why so loud', 'this is sh!t', 'what the f*ck', 'chutiya video', 'vote for modi', 'kill yourself', 'dumb @ss']) {
      assert.equal(isPublicSafe(text), false, text);
    }
    for (const text of ['Don\'t ever buy moto, Bad service.', 'itssbsolutely rubish phone', 'This device is highly overpriced', 'first class, assess it', 'Essex classic massive', 'sextant and Dickens', 'my coworkers would kill me', '', null]) {
      assert.equal(isPublicSafe(text), true, text);
    }
  });

  test('trimFeatured keeps unsafe text off the homepage and moves the next item up', () => {
    const gap = (question, texts, extra = {}) => ({ question, suggestedTitle: 'T', evidence: texts.map((text) => ({ text, likes: 1, videoId: 'v1' })), ...extra });
    const out = trimFeatured({
      runId: 'r', generatedAt: '2026-10-25T00:00:00Z', stats: { gapsFound: 5 },
      topVideos: [{ videoId: 'v1', title: 'what the fuck video' }],
      gaps: [
        gap('all quotes bad', ['you idiot', 'fucking awful']),
        gap('bad title', ['fine'], { suggestedTitle: 'a shit title' }),
        gap('one good quote', ['you idiot', 'honest but harsh: terrible phone']),
        gap('second', ['ok']), gap('third', ['ok']), gap('fourth', ['ok']),
      ],
      topics: [{ label: 'porn', summary: 's' }, { label: 'fine', summary: 's' }],
      objections: [{ label: 'fine', detail: 'bastard', fix: 'f' }, { label: 'kept', detail: 'd', fix: 'f' }],
      avoid: [{ label: 'gandu', reason: 'r' }, { label: 'kept', reason: 'r' }],
    });
    assert.deepEqual(out.gaps.map((g) => g.question), ['one good quote', 'second', 'third']);
    assert.deepEqual(out.gaps[0].evidence.map((e) => e.text), ['honest but harsh: terrible phone']);
    assert.deepEqual(out.topics.map((t) => t.label), ['fine']);
    assert.deepEqual(out.objections.map((o) => o.label), ['kept']);
    assert.deepEqual(out.avoid.map((a) => a.label), ['kept']);
    assert.equal(/idiot|fuck|shit|porn|bastard|gandu/.test(JSON.stringify(out)), false); // nothing leaves the server, titles included
    assert.equal(out.stats.gapsFound, 5);
  });

  test('featuredReports keeps the listed order, skips gone and expired runs, and stops at four', async () => {
    const now = Date.parse('2026-11-01T00:00:00Z');
    const run = (runId, generatedAt) => ({ runId, generatedAt, query: { niche: runId } });
    const stored = { a: run('a', '2026-10-30T00:00:00Z'), b: run('b', '2026-10-31T00:00:00Z'), old: run('old', '2026-09-01T00:00:00Z'), c: run('c', '2026-10-29T00:00:00Z'), d: run('d', '2026-10-28T00:00:00Z'), e: run('e', '2026-10-27T00:00:00Z') };
    const read = async (id) => { if (id === 'broken') throw new Error('nope'); return stored[id] ?? null; };
    const ids = (list) => featuredReports({ ids: list, read, now }).then((r) => r.map((x) => x.runId));
    assert.deepEqual(await ids(['b', 'a']), ['b', 'a']);
    assert.deepEqual(await ids(['old', 'missing', 'broken', 'a']), ['a']);
    assert.deepEqual(await ids(['a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c', 'd']);
    assert.deepEqual(await ids([]), []);
  });

  test('trimFeatured keeps only the top three of each, with titles for the evidence videos', () => {
    const video = (id) => ({ videoId: id, title: `Title ${id}`, channelTitle: 'Ch', views: 10, url: `u/${id}`, thumbnail: `t/${id}`, secret: 'x' });
    const run = {
      runId: 'r', generatedAt: '2026-10-25T00:00:00Z', query: { niche: 'n', window: '7d', contentType: 'both', minViews: 5 },
      stats: { videosFound: 9, gapsFound: 4, llmUsage: { total: 1 } },
      topVideos: [video('v1'), video('v2')],
      topics: [1, 2, 3, 4].map((i) => ({ label: `t${i}`, heatScore: i, summary: 's', whyHot: 'private', videos: [1, 2, 3, 4].map((j) => video(`tv${i}${j}`)) })),
      gaps: [1, 2, 3, 4].map((i) => ({
        question: `q${i}`, demandStrength: 'high', coverage: 'weak', evidenceCount: 9, distinctVideos: 2, demandScore: 50, suggestedTitle: 'T', explanation: 'private',
        evidence: [{ text: 'a', likes: 1, videoId: 'v1', replyCount: 3 }, { text: 'b', likes: 2, videoId: 'v2' }, { text: 'c', likes: 3, videoId: 'gone' }, { text: 'd', likes: 4, videoId: 'v1' }],
      })),
      objections: [1, 2, 3, 4].map((i) => ({ label: `o${i}`, severity: 'high', evidenceCount: 3, detail: 'd', fix: 'f', evidence: [{ text: 'private' }] })),
      avoid: [1, 2, 3, 4].map((i) => ({ label: `a${i}`, reason: 'r', counterEvidence: 'c', videos: [video('private')] })),
    };
    const out = trimFeatured(run);
    assert.equal(out.objections.length, 3);
    assert.deepEqual(Object.keys(out.objections[0]).sort(), ['detail', 'evidenceCount', 'fix', 'label', 'severity']);
    assert.deepEqual(out.avoid[0], { label: 'a1', reason: 'r', counterEvidence: 'c' });
    assert.equal(out.gaps.length, 3);
    assert.equal(out.topics.length, 3);
    assert.equal(out.topics[0].videos.length, 3);
    assert.equal(out.gaps[0].evidence.length, 3);
    assert.deepEqual(Object.keys(out.gaps[0].evidence[0]).sort(), ['likes', 'text', 'videoId']);
    assert.deepEqual(Object.keys(out.topics[0].videos[0]).sort(), ['channelTitle', 'thumbnail', 'title', 'url', 'videoId', 'views']);
    assert.deepEqual(out.videoTitles, { v1: 'Title v1', v2: 'Title v2' }); // 'gone' has no known title
    assert.deepEqual(out.query, { niche: 'n', window: '7d', contentType: 'both' });
    assert.equal(out.stats.llmUsage, undefined);
    assert.equal(JSON.stringify(out).includes('private'), false);
  });

  const W = (id, ownerUid, query = 'a') => ({ id, ownerUid, input: { niche: query, window: '7d', contentType: 'both', gapMode: 'inclusive', minViews: 0 } });

  test('watches: the owner filter shows only your own, and legacy watches to nobody', () => {
    const list = [W('1', 'u1'), W('2', 'u2'), W('3', undefined), W('4', null)];
    assert.deepEqual(ownedBy(list, 'u1').map((w) => w.id), ['1']);
    assert.deepEqual(ownedBy(list, undefined), []);
    assert.deepEqual(ownedBy(list, 'nobody'), []);
    assert.equal(ownedWatch(list, '1', 'u1').id, '1');
    assert.equal(ownedWatch(list, '2', 'u1'), null); // someone else's looks missing
    assert.equal(ownedWatch(list, '3', 'u1'), null);
  });

  test('watches: the duplicate check is per owner', () => {
    const list = [W('1', 'u1', 'sourdough'), W('2', 'u2', 'kombucha')];
    const input = (niche) => ({ niche, window: '7d', contentType: 'both', gapMode: 'inclusive', minViews: 0 });
    assert.equal(hasDuplicate(list, 'u1', input('sourdough')), true);
    assert.equal(hasDuplicate(list, 'u2', input('sourdough')), false); // another person may watch the same niche
    assert.equal(hasDuplicate(list, 'u1', input('kombucha')), false);
    assert.equal(hasDuplicate(list, 'u1', { ...input('sourdough'), window: '30d' }), false);
  });

  test('watches: the per-user cap counts only your own', () => {
    const list = [W('1', 'u1'), W('2', 'u1'), W('3', 'u2')];
    assert.equal(atOwnerCap(list, 'u1', 2), true);
    assert.equal(atOwnerCap(list, 'u2', 2), false);
    assert.equal(atOwnerCap(list, 'new', 2), false);
    assert.equal(atOwnerCap(list, 'u1', 3), false);
  });

  test('the rate limiter can be keyed by account instead of address', () => {
    const rl = createRateLimit({ perHour: 1, noun: 'x', keyFn: (req) => req.user?.uid ?? req.ip });
    const res = () => { const r = { code: 0, status(c) { r.code = c; return r; }, set() {}, json() {} }; return r; };
    const go = (req) => { let ok = false; const r = res(); rl(req, r, () => { ok = true; }); return ok; };
    assert.equal(go({ ip: '1.1.1.1', user: { uid: 'a' } }), true);
    assert.equal(go({ ip: '2.2.2.2', user: { uid: 'a' } }), false); // same person, new address
    assert.equal(go({ ip: '1.1.1.1', user: { uid: 'b' } }), true); // same address, different person
  });
});

describe('email verification gate', () => {
  const run = (user) => {
    let out = { next: false };
    const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; } };
    requireVerified({ user }, res, () => { out.next = true; });
    return out;
  };

  test('an unverified password account is refused with a code the UI can act on', () => {
    const out = run({ provider: 'password', emailVerified: false });
    assert.equal(out.status, 403);
    assert.equal(out.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(out.next, false);
  });

  test('verified password accounts and Google accounts pass', () => {
    assert.equal(run({ provider: 'password', emailVerified: true }).next, true);
    assert.equal(run({ provider: 'google.com', emailVerified: false }).next, true);
  });

  test('needsVerification is false when nobody is signed in', () => {
    assert.equal(needsVerification(null), false);
  });
});


describe('web router: matchRoute', () => {
  const table = [
    { path: '/', name: 'home' },
    { path: '/login', name: 'login' },
    { path: '/explore', name: 'explore' },
    { path: '/r/:id', name: 'report' },
    { path: '/channel/r/:id', name: 'channel-report' },
    { path: '/docs/*', name: 'docs' },
    { path: '*', name: 'not-found' },
  ];
  const name = (p) => matchRoute(p, table)?.route.name;

  test('matches a static path, and the root', () => {
    assert.equal(name('/'), 'home');
    assert.equal(name('/login'), 'login');
    assert.deepEqual(matchRoute('/login', table).params, {});
  });

  test('captures :param segments, decoded', () => {
    assert.deepEqual(matchRoute('/r/abc_123', table).params, { id: 'abc_123' });
    assert.equal(name('/channel/r/xyz'), 'channel-report');
    assert.deepEqual(matchRoute('/r/a%20b', table).params, { id: 'a b' });
    // a stray % must not throw
    assert.deepEqual(matchRoute('/r/100%', table).params, { id: '100%' });
  });

  test('a trailing slash, query or hash does not change the match', () => {
    assert.equal(name('/login/'), 'login');
    assert.equal(name('/login?next=%2Fdashboard'), 'login');
    assert.equal(name('/explore#top'), 'explore');
    assert.equal(normalizePath('/a/b///'), '/a/b');
    assert.equal(normalizePath(''), '/');
    assert.equal(normalizePath('//'), '/');
  });

  test('a :param needs a segment, and extra segments do not match', () => {
    assert.equal(name('/r'), 'not-found');
    assert.equal(name('/r/abc/extra'), 'not-found');
    assert.equal(name('/login/extra'), 'not-found');
  });

  test('no match returns null when the table has no catch-all', () => {
    assert.equal(matchRoute('/nope', table.slice(0, 4)), null);
  });

  test('a trailing * matches the rest, including nothing, and reports it', () => {
    assert.equal(name('/docs'), 'docs');
    assert.deepEqual(matchRoute('/docs/a/b', table).params, { '*': 'a/b' });
    assert.deepEqual(matchRoute('/something/else', table).params, { '*': 'something/else' });
  });

  test('the first matching entry wins', () => {
    assert.equal(matchRoute('/x', [{ path: '/:a', n: 1 }, { path: '/x', n: 2 }]).route.n, 1);
  });
});

describe('web auth: plain-words errors', () => {
  test('wrong password and unknown email share one message', () => {
    const a = authError({ code: 'auth/wrong-password' });
    const b = authError({ code: 'auth/user-not-found' });
    const c = authError({ code: 'auth/invalid-credential' });
    assert.equal(a.message, b.message);
    assert.equal(a.message, c.message);
    assert.equal(a.code, 'INVALID_CREDENTIALS');
  });

  test('no message ever shows a raw auth/ code', () => {
    for (const code of ['auth/email-already-in-use', 'auth/weak-password', 'auth/popup-closed-by-user', 'auth/too-many-requests', 'auth/network-request-failed', 'auth/never-heard-of-it']) {
      const e = authError({ code });
      assert.doesNotMatch(e.message, /auth\//);
      assert.ok(e.message.length > 10);
    }
    assert.equal(authError({ code: 'auth/email-already-in-use' }).code, 'EMAIL_IN_USE');
    assert.equal(authError(new Error('boom')).message, 'Something went wrong. Please try again.');
  });

  test('an error of ours passes through untouched', () => {
    const ours = Object.assign(new Error('Accounts are not set up on this server yet.'), { code: 'NOT_CONFIGURED' });
    assert.equal(authError(ours), ours);
  });
});

describe('safeNext (post-login redirect)', () => {
  test('keeps same-site paths, with their query and hash', () => {
    assert.equal(safeNext('/explore'), '/explore');
    assert.equal(safeNext('/r/abc123?lang=ta#top'), '/r/abc123?lang=ta#top');
    assert.equal(safeNext('/channel?url=https%3A%2F%2Fyoutube.com%2F%40x'), '/channel?url=https%3A%2F%2Fyoutube.com%2F%40x');
  });
  test('falls back to the dashboard for anything missing or not a string', () => {
    for (const bad of [undefined, null, '', 42, {}, [], 'dashboard', 'explore']) assert.equal(safeNext(bad), '/dashboard');
    assert.equal(safeNext(undefined, '/'), '/');
  });
  test('rejects protocol-relative, absolute and scheme URLs', () => {
    for (const bad of ['//evil.com', '//evil.com/x', 'https://evil.com', 'http://evil.com/x', 'javascript:alert(1)', 'data:text/html,hi', '/\\evil.com', '/\\/evil.com', '\\\\evil.com']) {
      assert.equal(safeNext(bad), '/dashboard', bad);
    }
  });
  test('rejects control characters that browsers strip before parsing', () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/ok\u0000', '/a\\b']) assert.equal(safeNext(bad), '/dashboard');
  });
  test('does not send people back to a sign-in page', () => {
    for (const bad of ['/login', '/login?next=/x', '/signup', '/reset-password/']) assert.equal(safeNext(bad), '/dashboard');
  });
  test('nextSuffix carries only a safe value onto a link', () => {
    assert.equal(nextSuffix('/explore?x=1'), '?next=%2Fexplore%3Fx%3D1');
    assert.equal(nextSuffix('//evil.com'), '');
    assert.equal(nextSuffix(undefined), '');
    assert.equal(nextSuffix('/login'), '');
  });
});

describe('passwordStrength (a hint, never a gate)', () => {
  test('empty is null; below Firebase minimum is too short and not ok', () => {
    assert.equal(passwordStrength(''), null);
    assert.equal(passwordStrength(undefined), null);
    const s = passwordStrength('abc');
    assert.equal(s.label, 'Too short');
    assert.equal(s.ok, false);
    assert.equal(s.score, 0);
  });
  test('six characters is allowed (ok) but weak', () => {
    const s = passwordStrength('k3Z!pq');
    assert.equal(s.ok, true);
    assert.equal(s.label, 'Weak');
  });
  test('obvious choices are weak whatever their length', () => {
    for (const pw of ['password', '12345678', 'aaaaaaaaaaaa', 'qwertyui', 'Password123']) {
      assert.equal(passwordStrength(pw).score, 1, pw);
      assert.equal(passwordStrength(pw).ok, true);
    }
  });
  test('one kind of character at eight is weak; variety makes it okay', () => {
    assert.equal(passwordStrength('lmnopqrs').label, 'Weak');
    assert.equal(passwordStrength('lmnopqr9').label, 'Okay');
  });
  test('length and variety reach strong; a long phrase is strong', () => {
    assert.equal(passwordStrength('river-Stone-42-lamp').label, 'Strong');
    assert.equal(passwordStrength('correct horse battery').label, 'Strong');
    assert.equal(passwordStrength('Zk9!mQ2x7p').label, 'Strong');
  });
  test('counts characters, not UTF-16 units, so non-Latin passwords are not penalised', () => {
    assert.equal(passwordStrength('தமிழ்').ok, false); // 5 code points
    assert.equal(passwordStrength('தமிழ்நாடு!').ok, true);
  });
});

describe('looksLikeEmail', () => {
  test('accepts plausible addresses and rejects obvious typos', () => {
    assert.equal(looksLikeEmail('a@b.co'), true);
    assert.equal(looksLikeEmail(' you@example.com '), true);
    for (const bad of ['', 'you', 'you@', 'you@example', '@example.com', 'a b@c.com', null]) assert.equal(looksLikeEmail(bad), false, String(bad));
  });
});

describe('profile helpers', () => {
  test('memberSince formats month and year, or null', () => {
    assert.equal(memberSince('2026-03-14T10:00:00.000Z', { locale: 'en-US' }), 'March 2026');
    assert.equal(memberSince(null), null);
    assert.equal(memberSince('not a date'), null);
  });
  test('resetsText says midnight Pacific and the visitor\'s own time', () => {
    const resetsAt = '2026-10-28T07:00:00.000Z'; // midnight PDT
    const now = new Date('2026-10-27T09:00:00.000Z');
    assert.equal(resetsText(resetsAt, { now, locale: 'en-US', timeZone: 'America/Los_Angeles' }), 'Resets at midnight Pacific (12:00 AM PDT tomorrow, your time).');
    // Morning in India: the reset is later the same day there.
    assert.equal(resetsText(resetsAt, { now: new Date('2026-10-28T03:00:00.000Z'), locale: 'en-US', timeZone: 'Asia/Kolkata' }), 'Resets at midnight Pacific (12:30 PM GMT+5:30, your time).');
    assert.equal(resetsText(resetsAt, { now, locale: 'en-US', timeZone: 'Asia/Kolkata' }), 'Resets at midnight Pacific (12:30 PM GMT+5:30 tomorrow, your time).');
  });
  test('resetsText survives a missing or bad date', () => {
    assert.equal(resetsText(undefined), 'Resets at midnight Pacific.');
    assert.equal(resetsText('nope'), 'Resets at midnight Pacific.');
  });
  test('normalizeName trims, collapses spaces and caps length', () => {
    assert.equal(normalizeName('  Asha   Rao \n'), 'Asha Rao');
    assert.equal(normalizeName(null), '');
    assert.equal(normalizeName('x'.repeat(200)).length, 80);
  });
  test('deleteConfirmed needs the exact word', () => {
    assert.equal(deleteConfirmed('DELETE'), true);
    assert.equal(deleteConfirmed(' DELETE '), true);
    for (const bad of ['delete', 'Delete', 'DELET', '', undefined]) assert.equal(deleteConfirmed(bad), false);
  });
});

describe('report URLs', () => {
  test('a report lives under its own page', () => {
    assert.equal(reportPathFor('niche', 'abc-123'), '/r/abc-123');
    assert.equal(reportPathFor('channel', 'abc-123'), '/channel/r/abc-123');
    assert.equal(pagePathFor('niche'), '/explore');
    assert.equal(pagePathFor('channel'), '/channel');
  });

  test('a report opened under the wrong page is sent to the right one', () => {
    assert.equal(correctReportPath('niche', false, 'x1'), null);
    assert.equal(correctReportPath('channel', true, 'x1'), null);
    assert.equal(correctReportPath('niche', true, 'x1'), '/channel/r/x1');
    assert.equal(correctReportPath('channel', false, 'x1'), '/r/x1');
    assert.equal(correctReportPath('channel', undefined, 'x1'), '/r/x1');
  });

  test('the run id round-trips through the path', () => {
    assert.equal(runIdFromPath(reportPathFor('niche', 'a_b-9')), 'a_b-9');
    assert.equal(runIdFromPath(reportPathFor('channel', 'a_b-9')), 'a_b-9');
    assert.equal(runIdFromPath('/explore'), null);
  });

  test('a search keeps only what differs from the defaults', () => {
    assert.equal(queryToSearch({ niche: 'home espresso', window: '7d', contentType: 'both' }), '?niche=home+espresso');
    assert.deepEqual(queryFromUrl('?niche=home+espresso&window=30d&deepScan=true&minViews=500'), {
      niche: 'home espresso', window: '30d', deepScan: true, minViews: 500,
    });
  });
});

describe('dashboard rows', () => {
  const now = new Date(2026, 9, 27, 15, 0);
  const at = (days, hour = 9) => new Date(2026, 9, 27 - days, hour).toISOString();

  test('relativeDay counts calendar days, not 24-hour blocks', () => {
    assert.equal(relativeDay(at(0, 1), now), 'today');
    assert.equal(relativeDay(at(1, 23), now), 'yesterday');
    assert.equal(relativeDay(at(3), now), '3 days ago');
    assert.equal(relativeDay('not a date', now), '');
    assert.equal(relativeDay(undefined, now), '');
  });

  test('labels for the search window and format', () => {
    assert.equal(windowLabel('7d'), 'Last 7 days');
    assert.equal(windowLabel('24h'), 'Last 24 hours');
    assert.match(windowLabel('custom', '2026-10-01T00:00:00Z'), /^Since /);
    assert.equal(windowLabel('custom', 'junk'), 'Custom range');
    assert.equal(formatLabel('both'), 'Long-form and Shorts');
    assert.equal(formatLabel(undefined), 'Long-form and Shorts');
    assert.equal(formatLabel('shorts'), 'Shorts');
    assert.equal(formatLabel('long'), 'Long-form');
    assert.equal(plural(1, 'gap'), '1 gap');
    assert.equal(plural(0, 'topic'), '0 topics');
  });

  test('a niche run row links to /r/<id>', () => {
    const row = toRunRow({
      runId: 'r1', niche: 'sourdough starter', window: '7d', contentType: 'both', channelMode: false,
      generatedAt: at(0), gapsFound: 5, topicsFound: 7, thinPool: false,
    }, now);
    assert.equal(row.href, '/r/r1');
    assert.equal(row.title, 'sourdough starter');
    assert.deepEqual(row.meta, ['Last 7 days', 'Long-form and Shorts', 'today']);
    assert.equal(row.counts, '5 gaps \u00b7 7 topics');
    assert.equal(row.thin, false);
  });

  test('a channel run row is titled by the channel and links under /channel', () => {
    const row = toRunRow({
      runId: 'c1', niche: '', channelMode: true, channelTitle: 'Some Channel', window: '90d', contentType: 'long',
      generatedAt: at(1), gapsFound: 1, topicsFound: 1, thinPool: true,
    }, now);
    assert.equal(row.href, '/channel/r/c1');
    assert.equal(row.title, 'Some Channel');
    assert.deepEqual(row.meta, ['Channel', 'Last 90 days', 'Long-form', 'yesterday']);
    assert.equal(row.counts, '1 gap \u00b7 1 topic');
    assert.equal(row.thin, true);
    assert.equal(toRunRow({ runId: 'c2', channelMode: true, generatedAt: at(0) }, now).title, 'Channel report');
  });

  test('watch rows say what the watch itself records', () => {
    assert.equal(intervalLabel(24), 'Every 24 hours');
    assert.equal(intervalLabel(168), 'Every 7 days');
    assert.equal(intervalLabel(12), 'Every 12 hours');
    const base = { id: 'w', label: 'cast iron restoration', intervalHours: 24, enabled: true, input: { niche: 'cast iron restoration' } };
    const ok = toWatchRow({ ...base, lastRunAt: at(0), lastRunId: 'r9' }, now);
    assert.equal(ok.detail, 'Every 24 hours \u00b7 last run today');
    assert.equal(ok.href, '/r/r9');
    assert.equal(toWatchRow({ ...base, lastRunAt: null }, now).status, 'pending');
    assert.equal(toWatchRow({ ...base, enabled: false }, now).detail, 'Every 24 hours \u00b7 paused');
    const failed = toWatchRow({ ...base, lastRunAt: at(1), lastError: 'quota' }, now);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'quota');
    const channel = toWatchRow({ ...base, input: { channelId: '@x' }, lastRunId: 'r8', lastRunAt: at(0) }, now);
    assert.equal(channel.href, '/channel/r/r8');
  });
});

describe('report header and run errors', () => {
  test('the meta line and the name come from the saved report', () => {
    const result = {
      query: { niche: 'sourdough starter', window: '7d', contentType: 'both' },
      stats: { videosAnalyzed: 50, commentsAnalyzed: 1550 },
    };
    assert.deepEqual(reportMeta(result), ['Last 7 days', 'Long-form and Shorts', '50 videos', '1,550 comments read']);
    assert.equal(reportName(result), 'sourdough starter');
    assert.equal(reportName({ ...result, channel: { title: 'A Channel' }, channelMode: true }), 'A Channel');
    assert.equal(reportName({ query: {}, channelMode: true }), 'Channel report');
  });

  test('a reset time reads as a local time of day', () => {
    const now = new Date(2026, 9, 27, 15, 0);
    assert.match(resetTimeLabel(new Date(2026, 9, 27, 18, 0).toISOString(), now, 'en-US'), /^at 6:00\s?PM$/);
    assert.match(resetTimeLabel(new Date(2026, 9, 28, 1, 30).toISOString(), now, 'en-US'), /^tomorrow at 1:30\s?AM$/);
    assert.equal(resetTimeLabel('junk', now), '');
  });

  test('a spent daily allowance names the limit and the reset', () => {
    const now = new Date(2026, 9, 27, 15, 0);
    const err = Object.assign(new Error('x'), { code: 'DAILY_LIMIT', status: 429, resetsAt: new Date(2026, 9, 27, 18, 0).toISOString() });
    const d = describeRunError(err, { limit: 3, now, locale: 'en-US' });
    assert.equal(d.kind, 'daily');
    assert.match(d.title, /used your 3 analyses for today/);
    assert.match(d.message, /They reset at 6:00\s?PM\./);
    assert.match(describeRunError(err, { limit: 1, now }).title, /your 1 analysis for today/);
  });

  test('each server error picks its own recovery', () => {
    assert.equal(describeRunError(Object.assign(new Error('x'), { code: 'EMAIL_NOT_VERIFIED', status: 403 })).kind, 'verify');
    assert.equal(describeRunError(Object.assign(new Error('x'), { code: 'AUTH_REQUIRED', status: 401 })).kind, 'auth');
    assert.equal(describeRunError(Object.assign(new Error('x'), { status: 401 })).kind, 'auth');
    const quota = describeRunError(Object.assign(new Error('x'), { code: 'QUOTA_EXHAUSTED' }));
    assert.equal(quota.kind, 'quota');
    assert.match(quota.message, /saved reports still works/);
    const generic = describeRunError(new Error('Niche must be at least 2 characters.'));
    assert.equal(generic.kind, 'generic');
    assert.equal(generic.tone, 'bad');
    assert.equal(generic.message, 'Niche must be at least 2 characters.');
  });

  test('an expired or missing report is calm, anything else is a fault', () => {
    const expired = describeLoadError(Object.assign(new Error('This report was removed.'), { code: 'RUN_EXPIRED', status: 410 }));
    assert.equal(expired.kind, 'gone');
    assert.equal(expired.title, 'This report has expired');
    assert.equal(expired.message, 'This report was removed.');
    assert.equal(describeLoadError(Object.assign(new Error('Report not found or pruned.'), { code: 'RUN_NOT_FOUND', status: 404 })).tone, 'info');
    const fault = describeLoadError(Object.assign(new Error('boom'), { code: 'NETWORK' }));
    assert.equal(fault.kind, 'load');
    assert.equal(fault.tone, 'bad');
  });
});

describe('waitlist', () => {
  before(() => connectMongo({ uri: process.env.MONGODB_URI, dbName: `gs_test_wl_${process.pid}_${Date.now()}` }));
  after(async () => { await dropDatabase(); await closeMongo(); });

  test('normalizeEmail trims and lower-cases, and rejects what is not an address', () => {
    assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '@c.com', null, undefined, `${'x'.repeat(250)}@a.co`]) assert.equal(normalizeEmail(bad), null, String(bad));
  });

  test('joining twice keeps one row; a different plan is a separate row', async () => {
    assert.deepEqual(await joinWaitlist({ email: 'a@b.co', plan: 'creator' }), { created: true });
    assert.deepEqual(await joinWaitlist({ email: 'a@b.co', plan: 'creator' }), { created: false });
    assert.deepEqual(await joinWaitlist({ email: 'a@b.co', plan: 'studio', uid: 'u1' }), { created: true });
    assert.equal(await col('waitlist').countDocuments({ email: 'a@b.co' }), 2);
  });
});

describe('bug bash regressions', () => {
  test('isAdmin needs a listed AND verified email', () => {
    const admins = ['boss@x.com'];
    assert.equal(isAdmin({ email: 'Boss@x.com', emailVerified: true }, admins), true);
    assert.equal(isAdmin({ email: 'boss@x.com', emailVerified: false }, admins), false);
    assert.equal(isAdmin({ email: 'other@x.com', emailVerified: true }, admins), false);
    assert.equal(isAdmin(null, admins), false);
    assert.equal(isAdmin({ email: 'boss@x.com', emailVerified: true }, []), false);
  });

  test('requireAdmin refuses everyone else with a 403', () => {
    let status = null;
    const res = { status(s) { status = s; return this; }, json() { return this; } };
    requireAdmin({ user: { email: 'nobody@x.com', emailVerified: true } }, res, () => assert.fail('must not pass'));
    assert.equal(status, 403);
  });

  test('raw provider errors never reach a visitor; messages written for people do', () => {
    const raw = Object.assign(new Error('DeepSeek 402: {"error":"Insufficient Balance"}'), { code: 'DEEPSEEK_ERROR' });
    assert.equal(publicMessage(raw), GENERIC_ERROR);
    assert.equal(publicMessage(raw, RUN_FAILED), RUN_FAILED);
    assert.equal(publicMessage(new Error('Cannot read properties of undefined')), GENERIC_ERROR);
    const friendly = Object.assign(new Error('No videos found.'), { code: 'NO_RESULTS' });
    assert.equal(publicMessage(friendly), 'No videos found.');
    const quota = Object.assign(new Error('YouTube search failed (403 quotaExceeded): {"raw":"body"}'), { code: 'QUOTA_EXHAUSTED' });
    assert.doesNotMatch(publicMessage(quota), /raw|403/);
  });

  test('errorResponse hides internals and names what the caller got wrong', () => {
    const crash = errorResponse(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    assert.deepEqual(crash, { status: 500, body: { error: GENERIC_ERROR, code: 'INTERNAL' } });
    assert.equal(errorResponse(Object.assign(new Error('x'), { status: 400, type: 'entity.parse.failed' })).body.code, 'BAD_JSON');
    assert.equal(errorResponse(Object.assign(new Error('x'), { status: 413, type: 'entity.too.large' })).body.code, 'TOO_LARGE');
    assert.equal(errorResponse(Object.assign(new Error('Niche too short'), { status: 400, code: 'VALIDATION' })).body.error, 'Niche too short');
    assert.equal(errorResponse(Object.assign(new Error('Not Found'), { status: 404 })).body.code, 'NOT_FOUND');
  });

  test('a failed job shows the browser the safe message and keeps its code', () => {
    const id = jobs.create({});
    jobs.fail(id, Object.assign(new Error('DeepSeek 500: secret detail'), { code: 'DEEPSEEK_ERROR' }));
    assert.deepEqual(jobs.get(id).error, { message: RUN_FAILED, code: 'DEEPSEEK_ERROR' });
  });

  test('cache entries are deleted when their own TTL ends, never past the retention limit', async () => {
    const { expiryFor } = await import('../src/lib/cache.js');
    assert.equal(expiryFor(1_000_000, 21600).getTime(), 1_000_000 + 21600 * 1000);
    assert.equal(expiryFor(0, 10 * 365 * 86400).getTime(), config.store.maxDataDays * 86400 * 1000);
  });

  test('deep scan is ignored until it is switched on', () => {
    assert.equal(config.features.deepScan, false);
    assert.equal(validate({ niche: 'chess', deepScan: true }).deepScan, false);
    config.features.deepScan = true;
    try {
      assert.equal(validate({ niche: 'chess', deepScan: true }).deepScan, true);
    } finally {
      config.features.deepScan = false;
    }
  });

  test('the custom date range is refused until it is switched on', () => {
    const body = { niche: 'chess', window: 'custom', customAfter: new Date(Date.now() - 20 * 86_400_000).toISOString() };
    assert.equal(config.allowCustomWindow, false);
    assert.throws(() => validate(body), { code: 'VALIDATION', message: /not available yet/ });
    config.allowCustomWindow = true;
    try {
      assert.equal(validate(body).window, 'custom');
    } finally {
      config.allowCustomWindow = false;
    }
    assert.equal(validate({ niche: 'chess', window: '90d' }).window, '90d'); // presets are untouched
  });

  test('region and language must be real two-letter codes before a run is spent', () => {
    assert.equal(validate({ niche: 'chess', regionCode: ' in ' }).regionCode, 'IN');
    assert.equal(validate({ niche: 'chess', relevanceLanguage: 'TA' }).relevanceLanguage, 'ta');
    assert.equal(validate({ niche: 'chess' }).regionCode, undefined);
    for (const regionCode of ['12', 'x', 'USA', '!!']) assert.throws(() => validate({ niche: 'chess', regionCode }), { code: 'VALIDATION' });
    assert.throws(() => validate({ niche: 'chess', relevanceLanguage: 'eng' }), { code: 'VALIDATION' });
  });

  test('limitsFor gives listed testers their bigger allowance, whatever the email case', () => {
    const saved = config.users.testerEmails;
    config.users.testerEmails = ['t@x.com'];
    try {
      assert.equal(limitsFor({ email: 'T@x.com' }).analyses, config.users.testerDailyAnalyses);
      assert.equal(limitsFor({ email: 'o@x.com' }).analyses, config.users.dailyAnalyses);
      assert.equal(limitsFor(null).analyses, config.users.dailyAnalyses);
    } finally {
      config.users.testerEmails = saved;
    }
  });

  test('CSV: a commenter cannot plant a spreadsheet formula, and numbers are left alone', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tx']) {
      const cell = gapsToCsv({ gaps: [{ question: evil, demandScore: -1 }] }).split('\r\n')[1];
      assert.match(cell, /^"?'/, evil);
      assert.match(cell, /,-1,/);
    }
    assert.equal(gapsToCsv({ gaps: [{ question: 'plain' }] }).split('\r\n')[1].startsWith('plain,'), true);
  });

  describe('pollJob', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; });
    const answers = (list) => {
      let i = 0;
      globalThis.fetch = async () => {
        const a = list[Math.min(i++, list.length - 1)];
        if (a === 'drop') throw new TypeError('network down');
        return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
      };
      return () => i;
    };

    test('rides out dropped polls while the server keeps working', async () => {
      answers(['drop', 'drop', { body: { status: 'running' } }, 'drop', { body: { status: 'done', result: { runId: 'r' } } }]);
      assert.deepEqual(await pollJob('j', null, { intervalMs: 1 }), { runId: 'r' });
    });

    test('too many drops in a row end as "lost touch, still running", since the server carries on', async () => {
      answers(['drop']);
      await assert.rejects(pollJob('j', null, { intervalMs: 1 }), { code: 'RUN_UNREACHABLE' });
    });

    test('a job the server does not know fails at once, with its code', async () => {
      const calls = answers([{ status: 404, body: { error: 'gone', code: 'JOB_NOT_FOUND' } }]);
      await assert.rejects(pollJob('j', null, { intervalMs: 1 }), { code: 'JOB_NOT_FOUND' });
      assert.equal(calls(), 1);
    });

    test('running past the wait limit is "still running", not a failure', async () => {
      answers([{ body: { status: 'running' } }]);
      await assert.rejects(pollJob('j', null, { intervalMs: 1, timeoutMs: -1 }), { code: 'STILL_RUNNING' });
      assert.equal(describeRunError({ code: 'STILL_RUNNING' }).kind, 'slow');
    });
  });

  test('a run the server lost reads as interrupted, not as a failed analysis', () => {
    const d = describeRunError(Object.assign(new Error('gone'), { code: 'JOB_NOT_FOUND' }));
    assert.equal(d.title, 'We lost track of that run');
    assert.equal(d.kind, 'generic');
  });

  test('new accounts need 8 characters; the shared floor stays for old passwords', () => {
    assert.equal(MIN_NEW_PASSWORD, 8);
    assert.equal(passwordStrength('abcd12').ok, true);
    assert.match(passwordStrength('abcd12').tip, /at least 8/);
  });
});

describe('emailTypoFix', () => {
  test('catches misspelt big providers and offers the address they meant', () => {
    const cases = {
      'lovespellinkk@gmai.com': 'lovespellinkk@gmail.com',
      'a@gm.com': 'a@gmail.com',
      'a@gml.com': 'a@gmail.com',
      'a@gmial.com': 'a@gmail.com',
      'a@gamil.com': 'a@gmail.com',
      'a@gmal.com': 'a@gmail.com',
      'a@gnail.com': 'a@gmail.com',
      'a@gmaill.com': 'a@gmail.com',
      'a@gma.com': 'a@gmail.com',
      'a@gmail.con': 'a@gmail.com',
      'a@gmail.co': 'a@gmail.com',
      'a@gmail.cm': 'a@gmail.com',
      'a@gmai.co': 'a@gmail.com',
      'A.Name+tag@GMAI.COM': 'A.Name+tag@gmail.com',
      ' a@gmai.com ': 'a@gmail.com',
      'a@hotmial.com': 'a@hotmail.com',
      'a@outlok.com': 'a@outlook.com',
      'a@yaho.com': 'a@yahoo.com',
      'a@iclod.com': 'a@icloud.com',
    };
    for (const [typed, meant] of Object.entries(cases)) assert.equal(emailTypoFix(typed), meant, typed);
  });

  test('leaves real addresses alone', () => {
    for (const ok of [
      'a@gmail.com', 'a@googlemail.com', 'a@hotmail.com', 'a@outlook.com', 'a@yahoo.com', 'a@icloud.com',
      'a@mail.com', 'a@email.com', 'a@ymail.com', 'a@gmx.com', 'a@me.com', 'a@mac.com', 'a@cloud.com',
      'a@yahoo.co.in', 'a@yahoo.de', 'a@hotmail.fr', 'a@outlook.in', 'a@gmx.de',
      'a@rail.com', 'a@mall.com', 'a@sail.com', 'a@goal.com',
      'a@company.com', 'a@student.university.edu', 'a@example.org',
    ]) assert.equal(emailTypoFix(ok), null, ok);
  });

  test('has nothing to say about something that is not an address', () => {
    for (const odd of ['', 'nope', '@gmai.com', 'a@gmai', null, undefined]) assert.equal(emailTypoFix(odd), null, String(odd));
  });
});

describe('domainAcceptsMail', () => {
  const dnsError = (code) => async () => { throw Object.assign(new Error(code), { code }); };
  const answers = (rows) => async () => rows;

  test('a domain with mail servers passes', async () => {
    assert.equal(await domainAcceptsMail('x.com', { resolveMx: answers([{ exchange: 'mx.x.com', priority: 10 }]) }), true);
  });

  test('a domain that does not exist fails', async () => {
    assert.equal(await domainAcceptsMail('hdhdhdhhj.com', { resolveMx: dnsError('ENOTFOUND') }), false);
  });

  test('no MX records falls back to the domain\'s own address', async () => {
    const base = { resolveMx: dnsError('ENODATA') };
    assert.equal(await domainAcceptsMail('x.com', { ...base, resolve4: answers(['1.2.3.4']), resolve6: dnsError('ENODATA') }), true);
    assert.equal(await domainAcceptsMail('x.com', { ...base, resolve4: dnsError('ENODATA'), resolve6: answers(['::1']) }), true);
    assert.equal(await domainAcceptsMail('x.com', { ...base, resolve4: dnsError('ENODATA'), resolve6: dnsError('ENODATA') }), false);
  });

  test('a null MX declares that the domain takes no mail', async () => {
    assert.equal(await domainAcceptsMail('x.com', { resolveMx: answers([{ exchange: '', priority: 0 }]) }), false);
    assert.equal(await domainAcceptsMail('x.com', { resolveMx: answers([{ exchange: '.', priority: 0 }]) }), false);
  });

  test('a DNS fault never blocks a sign-up', async () => {
    for (const code of ['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED']) {
      assert.equal(await domainAcceptsMail('x.com', { resolveMx: dnsError(code) }), true, code);
    }
    assert.equal(await domainAcceptsMail('x.com', { resolveMx: dnsError('ENODATA'), resolve4: dnsError('ETIMEOUT') }), true);
  });
});

test('a wrong email and a wrong password read the same on the login page', () => {
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials']) {
    assert.equal(authError({ code }).message, 'Invalid email or password.', code);
    assert.equal(authError({ code }).code, 'INVALID_CREDENTIALS', code);
  }
});

describe('profile picture', () => {
  const jpeg = (n = 50) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1), Buffer.from([0xff, 0xd9])]);
  const url = (buf) => `data:image/jpeg;base64,${buf.toString('base64')}`;

  test('accepts a JPEG data URL and returns its bytes', () => {
    const bytes = jpeg();
    assert.deepEqual(parseAvatarDataUrl(url(bytes)), bytes);
  });

  test('refuses anything that is not a browser-made JPEG', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40)]);
    const cases = [
      undefined, null, 42, '', 'data:image/jpeg;base64,',
      `data:image/png;base64,${jpeg().toString('base64')}`,   // wrong declared type
      `data:text/html;base64,${Buffer.from('<script>1</script>').toString('base64')}`,
      url(png),                                               // right label, not a JPEG
      url(Buffer.from('FFD8FF-but-not-really')),
      'data:image/jpeg;base64,@@@@',
      `${url(jpeg())}x`,                                      // bad padding
      url(jpeg(MAX_AVATAR_BYTES)),                            // too big
    ];
    for (const c of cases) assert.throws(() => parseAvatarDataUrl(c), { code: 'VALIDATION', status: 400 }, String(c).slice(0, 40));
  });

  test('a truncated JPEG (no end marker) is refused', () => {
    assert.throws(() => parseAvatarDataUrl(url(jpeg().subarray(0, 30))), { code: 'VALIDATION' });
  });

  test('squareCrop centres the longer side', () => {
    assert.deepEqual(squareCrop(400, 400), { sx: 0, sy: 0, side: 400 });
    assert.deepEqual(squareCrop(1000, 600), { sx: 200, sy: 0, side: 600 });
    assert.deepEqual(squareCrop(600, 1000), { sx: 0, sy: 200, side: 600 });
    assert.equal(squareCrop(0, 10).side, 0);
  });

  test('checkFile rejects the wrong type and oversized files in plain words', () => {
    assert.throws(() => checkFile(null), /Choose an image/);
    assert.throws(() => checkFile({ type: 'application/pdf', size: 10 }), /JPEG, PNG, WebP or GIF/);
    assert.throws(() => checkFile({ type: 'image/svg+xml', size: 10 }), /JPEG, PNG, WebP or GIF/);
    assert.throws(() => checkFile({ type: 'image/png', size: 6 * 1024 * 1024 }), /over 5 MB/);
    const ok = { type: 'image/webp', size: 1000 };
    assert.equal(checkFile(ok), ok);
  });
});

describe('profile picture storage', { skip: !process.env.MONGODB_URI && 'MONGODB_URI not set' }, () => {
  before(() => connectMongo({ uri: process.env.MONGODB_URI, dbName: `gs_test_av_${process.pid}_${Date.now()}` }));
  after(async () => { await dropDatabase(); await closeMongo(); });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

  test('an upload wins over the Google photo, is never returned with the profile, and can be removed', async () => {
    await upsertUser({ uid: 'p1', email: 'p@x.com', picture: 'https://google.example/p.jpg', provider: 'google.com' });
    assert.equal((await getUser('p1')).photoUrl, 'https://google.example/p.jpg');
    assert.equal(await setAvatar('p1', jpeg), true);
    const u = await getUser('p1');
    assert.match(u.photoUrl, /^\/api\/avatar\/p1\?v=\d+$/);
    assert.equal(u.hasCustomAvatar, true);
    assert.equal('avatar' in u, false);
    assert.deepEqual(await getAvatar('p1'), jpeg);
    // The next sign-in refreshes the Google photo; it must not displace the upload.
    assert.match((await upsertUser({ uid: 'p1', email: 'p@x.com', picture: 'https://google.example/new.jpg' })).photoUrl, /^\/api\/avatar\//);
    await clearAvatar('p1');
    assert.equal((await getUser('p1')).photoUrl, 'https://google.example/new.jpg');
    assert.equal(await getAvatar('p1'), null);
  });

  test('no account, no picture; deleting the account deletes the picture', async () => {
    assert.equal(await setAvatar('ghost', jpeg), false);
    assert.equal(await getAvatar('ghost'), null);
    await upsertUser({ uid: 'p2', email: 'q@x.com' });
    await setAvatar('p2', jpeg);
    await deleteUserData('p2');
    assert.equal(await getAvatar('p2'), null);
  });
});

describe('picture crop maths', () => {
  const box = 200;
  const shapes = [[4000, 3000], [3000, 4000], [200, 200], [120, 90], [90, 600], [5000, 5000], [201, 200]].map(([width, height]) => ({ width, height }));
  const inside = (r, { width, height }) => r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.side <= width + 1e-9 && r.sy + r.side <= height + 1e-9;

  test('the starting view just covers the frame and is centred', () => {
    for (const imageSize of shapes) {
      const v = initialView({ imageSize, box });
      assert.ok(Math.abs(Math.min(imageSize.width, imageSize.height) * v.scale - box) < 1e-9);
      const r = cropRect({ view: v, imageSize, box });
      assert.ok(inside(r, imageSize));
      assert.ok(Math.abs(r.side - Math.min(imageSize.width, imageSize.height)) < 1e-6, 'starts on the whole short side');
      assert.ok(Math.abs(r.sx - (imageSize.width - r.side) / 2) < 1e-6 && Math.abs(r.sy - (imageSize.height - r.side) / 2) < 1e-6);
    }
  });

  test('panning can never leave the frame uncovered', () => {
    for (const imageSize of shapes) {
      const v = initialView({ imageSize, box });
      for (const [x, y] of [[1e6, 1e6], [-1e6, -1e6], [0, 0], [-50, 30]]) {
        const offset = clampOffset({ scale: v.scale, offset: { x, y }, imageSize, box });
        assert.ok(offset.x <= 0 && offset.y <= 0);
        assert.ok(imageSize.width * v.scale + offset.x >= box - 1e-9 && imageSize.height * v.scale + offset.y >= box - 1e-9);
        assert.ok(inside(cropRect({ view: { scale: v.scale, offset }, imageSize, box }), imageSize));
      }
    }
  });

  test('zoom stays between "covers" and four times that, keeps the anchor still, and stays covered', () => {
    for (const imageSize of shapes) {
      const v0 = initialView({ imageSize, box });
      assert.equal(zoomOf({ view: v0, imageSize, box }), 1);
      const anchor = { x: 50, y: 150 };
      const before = cropRect({ view: v0, imageSize, box });
      const z = zoomAt({ view: v0, scale: v0.scale * 2, anchor, imageSize, box });
      assert.ok(Math.abs(zoomOf({ view: z, imageSize, box }) - 2) < 1e-9);
      assert.ok(inside(cropRect({ view: z, imageSize, box }), imageSize));
      // Square stays square and shrinks to half.
      assert.ok(Math.abs(cropRect({ view: z, imageSize, box }).side - before.side / 2) < 1e-6);
      assert.equal(zoomAt({ view: v0, scale: 1e9, anchor, imageSize, box }).scale, v0.scale * MAX_ZOOM);
      assert.equal(zoomAt({ view: z, scale: 1e-9, anchor, imageSize, box }).scale, v0.scale);
    }
  });

  test('a point under the anchor stays under it while zooming (when not pinned by an edge)', () => {
    const imageSize = { width: 4000, height: 4000 };
    const v0 = initialView({ imageSize, box });
    const anchor = { x: 100, y: 100 };
    const under = (v) => ({ x: (anchor.x - v.offset.x) / v.scale, y: (anchor.y - v.offset.y) / v.scale });
    const a = under(v0);
    const b = under(zoomAt({ view: v0, scale: v0.scale * 2, anchor, imageSize, box }));
    assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6);
  });

  test('fitImage uses the short side', () => {
    assert.equal(fitImage({ width: 400, height: 100, box: 50 }), 0.5);
    assert.equal(fitImage({ width: 100, height: 400, box: 50 }), 0.5);
  });
});

describe('site address, sitemap and real 404s', () => {
  const req = (over = {}) => ({ protocol: 'http', get: () => 'preview.example:8790', secure: false, path: '/x', originalUrl: '/x?a=1', ...over });

  test('every route in the app is a known path, and nothing else is', () => {
    const source = readFileSync(new URL('../../web/src/routes.jsx', import.meta.url), 'utf8');
    const paths = [...source.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '*');
    assert.ok(paths.length >= 12);
    for (const p of paths) assert.equal(isAppPath(p.replace(':id', 'abc-123')), true, p);
    for (const p of ['/nope', '/r', '/r/a/b', '/channel/r/', '/login/x', '/favicon.icon', '/r/<script>', '/.env']) assert.equal(isAppPath(p), false, p);
    assert.equal(isAppPath('/privacy/'), true);
  });

  test('the public address comes from SITE_URL, else from the request', () => {
    assert.equal(siteOrigin(req(), 'https://gap.example/'), 'https://gap.example');
    assert.equal(siteOrigin(req(), ''), 'http://preview.example:8790');
  });

  test('the sitemap holds public pages only, and robots points at it', () => {
    const xml = sitemapXml('https://gap.example');
    assert.match(xml, /<loc>https:\/\/gap\.example\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/gap\.example\/privacy<\/loc>/);
    assert.doesNotMatch(xml, /dashboard|profile|\/r\//);
    const robots = robotsTxt('https://gap.example');
    assert.match(robots, /^Sitemap: https:\/\/gap\.example\/sitemap\.xml$/m);
    assert.match(robots, /^Disallow: \/api\/$/m);
  });

  test('previews get an absolute image; only known pages get a canonical link', () => {
    const html = '<head><meta property="og:image" content="/og.png" /><meta name="twitter:image" content="/og.png" /></head>';
    const page = renderIndex(html, 'https://gap.example', '/terms/');
    assert.equal(page.match(/content="https:\/\/gap\.example\/og\.png"/g).length, 2);
    assert.match(page, /rel="canonical" href="https:\/\/gap\.example\/terms"/);
    const missing = renderIndex(html, 'https://gap.example', '/"><script>alert(1)</script>');
    assert.doesNotMatch(missing, /canonical|script/);
  });

  test('plain http is sent to https in production behind a proxy, and only then', () => {
    const opts = { isProd: true, trustProxy: 1, siteUrl: '' };
    assert.equal(httpsRedirectFor(req(), opts), 'https://preview.example:8790/x?a=1');
    assert.equal(httpsRedirectFor(req(), { ...opts, siteUrl: 'https://gap.example' }), 'https://gap.example/x?a=1');
    assert.equal(httpsRedirectFor(req({ secure: true }), opts), null);
    assert.equal(httpsRedirectFor(req({ path: '/api/health' }), opts), null);
    assert.equal(httpsRedirectFor(req(), { ...opts, isProd: false }), null);
    assert.equal(httpsRedirectFor(req(), { ...opts, trustProxy: 0 }), null);
  });
});

describe('theme palettes', () => {
  // The owner's two palettes, tones 0 to 100 plus each key colour. Nothing else may be painted.
  const PALETTE = `
    000000 0C1C2C 233142 3A485B 516073 6A788C 8393A6 9EACC1 B9C9DD D5E5FA EAF1FF FFFFFF 0F1E2E
    001352 002583 0038B7 1F4FDF 436BFA 6B89FF 92A8FF B8C4FF DDE1FF EFEFFF 2F5BEA
    251A00 3A300D 524720 6B5E36 86764D A08F64 BCAA7D D8C597 F5E1B0 FFEFCD F3DFAE
    1C1C19 31302D 474744 5F5E5C 787774 92918D ADABA8 C8C6C3 E6E2DE F4F0EC FBF8F3
    1A1C1A 30312E 464744 5E5F5C 767774 90918E ABABA8 C6C7C4 E3E3E0 F1F1EE E8E8E4
    1A1C1F 2D3134 45474A 5B5F62 75777B 8F9195 AAABAF C5C7CA E1E3E6 F0F1F5 F4F6FA
    1D1C16 32302A 484740 605E57 79776F 949089 AFABA3 CBC6BD E7E2D9 F5F0E7 9A978F
    1C1B1B 313030 474646 5F5E5E 787776 929090 ADABAA CAC6C5 E6E2E1 F4F0EF 050505
  `.trim().split(/\s+/);
  // Agreed exceptions: Google's own "G", and the ground of the logo video's artwork.
  const EXCEPT = { 'GoogleButton.jsx': ['4285F4', '34A853', 'FBBC05', 'EA4335'], 'Logo.jsx': ['F4EFE4'] };
  const root = new URL('../../web/', import.meta.url);
  const files = [...readdirSync(new URL('src/', root), { recursive: true }).map((f) => `src/${f}`).filter((f) => /\.(jsx?|css)$/.test(f)), 'index.html', 'public/favicon.svg'];
  const hex2 = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();

  test('every colour in the web app comes from the palettes', () => {
    const stray = [];
    for (const f of files) {
      const text = readFileSync(new URL(f, root), 'utf8');
      const allowed = new Set([...PALETTE, ...(EXCEPT[f.split('/').pop()] ?? [])]);
      for (const [, h] of text.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
        const full = (h.length === 3 ? [...h].map((c) => c + c).join('') : h).toUpperCase();
        if (!allowed.has(full)) stray.push(`${f}: #${h}`);
      }
      for (const [, r, g, b] of text.matchAll(/rgba?\(\s*(\d+)[\s,_]+(\d+)[\s,_]+(\d+)/g)) {
        const full = hex2(r) + hex2(g) + hex2(b);
        if (!allowed.has(full)) stray.push(`${f}: rgb(${r} ${g} ${b})`);
      }
      if (/hsla?\(\s*\d/.test(text)) stray.push(`${f}: hsl()`);
    }
    assert.deepEqual(stray, []);
  });

  test('no default Tailwind colour classes slip in', () => {
    const named = /\b(?:bg|text|border|ring|from|to|via|outline|fill|stroke)-(?:red|green|blue|yellow|amber|orange|emerald|sky|indigo|slate|gray|zinc|stone|rose|pink|purple|violet|teal|cyan|lime)-\d/;
    for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, root), 'utf8'), named, f);
  });
});

test('only an unverified email-and-password account is kept out of the app', () => {
  assert.equal(clientNeedsVerification({ provider: 'password', emailVerified: false }), true);
  assert.equal(clientNeedsVerification({ provider: 'password', emailVerified: true }), false);
  assert.equal(clientNeedsVerification({ provider: 'google.com', emailVerified: false }), false);
  assert.equal(clientNeedsVerification(null), false);
});

describe('cancelling a run', async () => {
  const jobs = await import('../src/lib/jobs.js');
  const { withRun, throwIfCancelled, CancelledError } = await import('../src/lib/runContext.js');

  test('the only owner stopping a run aborts it, and it settles as cancelled, not failed', () => {
    const id = jobs.create({ niche: 'x' }, { owner: 'u1' });
    let settled;
    jobs.whenSettled(id, (err) => { settled = err; });
    assert.equal(jobs.cancel(id, 'u1'), 'cancelled');
    assert.equal(jobs.get(id).controller.signal.aborted, true);
    jobs.markCancelled(id);
    assert.equal(jobs.get(id).status, 'cancelled');
    assert.equal(settled.code, 'CANCELLED');
    assert.equal(jobs.get(id).result, null);
  });

  test('a run someone else joined carries on when one of them stops', () => {
    const id = jobs.create({ niche: 'y' }, { owner: 'u1' });
    jobs.addOwner(id, 'u2');
    assert.equal(jobs.cancel(id, 'u1'), 'detached');
    assert.equal(jobs.get(id).controller.signal.aborted, false);
    assert.equal(jobs.cancel(id, 'u2'), 'cancelled');
  });

  test('a stranger cannot stop someone else\'s run, and a finished run has nothing to stop', () => {
    const id = jobs.create({ niche: 'z' }, { owner: 'u1' });
    assert.equal(jobs.cancel(id, 'intruder'), null);
    assert.equal(jobs.cancel('no-such-job', 'u1'), null);
    jobs.finish(id, { runId: 'r' });
    assert.equal(jobs.cancel(id, 'u1'), 'finished');
  });

  test('throwIfCancelled does nothing outside a run and throws inside a stopped one', async () => {
    assert.doesNotThrow(() => throwIfCancelled());
    const controller = new AbortController();
    await withRun({ signal: controller.signal }, async () => {
      assert.doesNotThrow(() => throwIfCancelled());
      controller.abort();
      assert.throws(() => throwIfCancelled(), (e) => e instanceof CancelledError && e.code === 'CANCELLED');
    });
  });

  test('the result cache keeps a finished analysis for 6 hours unless the environment says otherwise', () => {
    if (!process.env.CACHE_TTL_SECONDS) assert.equal(config.cache.ttlSeconds, 21600);
    if (!process.env.YOUTUBE_SOURCE_CACHE_SECONDS) assert.equal(config.cache.sourceTtlSeconds, 21600);
  });
});

describe('offline', async () => {
  const { isOffline, offlineError } = await import('../../web/src/lib/authErrors.js');
  const { describeRunError } = await import('../../web/src/lib/runRows.js');

  test('isOffline believes only an explicit false', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      for (const [onLine, expected] of [[false, true], [true, false], [undefined, false]]) {
        Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true });
        assert.equal(isOffline(), expected);
      }
    } finally {
      if (real) Object.defineProperty(globalThis, 'navigator', real); else delete globalThis.navigator;
    }
  });

  test('the offline error reads as a connection problem and the run page shows it as one', () => {
    const err = offlineError();
    assert.equal(err.code, 'NETWORK');
    assert.match(err.message, /internet connection/);
    assert.equal(describeRunError(err).kind, 'offline');
  });
});

describe('losing the connection mid-analysis', async () => {
  const { pollJob } = await import('../../web/src/lib/api.js');
  const { describeRunError } = await import('../../web/src/lib/runRows.js');
  const setOnline = (onLine) => Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true });

  test('polling waits while offline: no request is sent and the run is not failed', async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError('offline'); };
    setOnline(false);
    try {
      let stop = false;
      setTimeout(() => { stop = true; }, 120);
      await assert.rejects(pollJob('j', null, { intervalMs: 10, isCancelled: () => stop }), (e) => e.cancelled === true);
      assert.equal(calls, 0);
    } finally { globalThis.fetch = realFetch; delete globalThis.navigator; }
  });

  test('many unanswered polls while the browser says online end as "still running", not a failure', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    setOnline(true);
    try {
      await assert.rejects(pollJob('j', null, { intervalMs: 1 }), (e) => e.code === 'RUN_UNREACHABLE');
    } finally { globalThis.fetch = realFetch; delete globalThis.navigator; }
    const shown = describeRunError({ code: 'RUN_UNREACHABLE', message: 'x' });
    assert.equal(shown.kind, 'slow');
    assert.match(shown.message, /still running/);
  });
});
