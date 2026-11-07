/**
 * The public how-to guides: one source for the page the browser draws (web/src/pages/Guide.jsx)
 * and the plain-HTML snapshot crawlers read (seoPages.js), so the two can never drift.
 *
 * Rules for this copy: advice a creator can use with or without the product; no figures we cannot
 * back; nothing about how Gapstronaut works inside (models, scoring, quotas, caching). When a guide
 * changes, bump `updated` here and the matching entry in SITEMAP_LASTMOD (site.js).
 * Titles must not contain apostrophes (a test compares them with web/src/routes.jsx).
 */

export const GUIDES = {
  '/guides/youtube-content-gap-analysis': {
    file: 'guide-youtube-content-gap-analysis',
    title: 'YouTube Content Gap Analysis: A Simple Guide',
    description: 'How to run a YouTube content gap analysis: find the questions viewers keep asking that no video in your niche answers well yet.',
    h1: 'YouTube content gap analysis: find what your viewers still can’t get',
    updated: '7 November 2026',
    intro: 'A content gap is a question viewers keep asking that no video in your niche answers well yet. This guide shows how to find those gaps by hand, how to tell a real gap from a crowded topic, and how to turn one into a video worth making.',
    sections: [
      {
        h2: 'What a content gap is',
        p: [
          'A content gap is the distance between what viewers want to know and what the videos on a topic actually tell them. It is not the same as a keyword gap. A keyword gap starts from what people type into a search box. A content gap starts from what viewers say after they have already watched something and still could not get the answer.',
          'For example, in a sourdough niche, lots of videos show how to feed a starter. A gap might be the question viewers keep leaving under those videos: why does my starter smell like nail polish remover, and is it dead? Plenty of people ask, and few videos answer it directly.',
        ],
      },
      {
        h2: 'Why comments are the best place to look',
        p: [
          'Comments sit under videos that already have an audience, so the people writing them are exactly the people you want to reach. They write in their own words, which are the words you should use in a title. And they show what the video failed to cover, which a view count never will.',
          'Guessing what to film means betting a week of work on your own hunch. Reading the comments first turns that into a bet on something viewers have already said out loud.',
        ],
      },
      {
        h2: 'How to run a content gap analysis by hand',
        p: [
          'Start by choosing a narrow niche and listing ten to twenty recent videos in it that are doing well. Look at your own channel, your closest competitors, and the videos YouTube keeps recommending for the topic.',
          'Open the comments on each one and read them, sorted by top and by newest. Write down every question that is not answered in the video, plus every phrase like “I still don’t understand” or “can you make a video on”. Keep the wording as written.',
          'Next, group the notes. The same question showing up under different videos, or from different people under one video, is the first sign of a gap. Finally, take each repeated question and search for it on YouTube yourself. If the top results answer it clearly and recently, it is not a gap. If they answer a nearby question, or answer it badly, it is.',
        ],
      },
      {
        h2: 'How to tell a real gap from a crowded topic',
        p: [
          'A real gap is repeated, specific and unanswered. Repeated means more than one person asked, ideally under more than one video. Specific means you could write the video title from the question. Unanswered means a viewer who searches for it does not land on a video that solves it.',
          'A crowded topic looks different. Many strong videos already cover it, the questions in the comments are about small details, or the loudest comments are praise and jokes rather than people who are stuck. Comments that only say thanks are not demand.',
          'It also helps to check who is asking. A question from viewers who clearly want to do the thing, and cannot, is worth more than idle curiosity from someone who is just passing by.',
        ],
      },
      {
        h2: 'Turning a gap into a video',
        p: [
          'Use the viewers’ own words in the title, and answer the question in the first minute rather than saving it for the end. People who searched for a specific problem leave quickly when the answer is buried.',
          'Keep the scope tight. A gap is usually one question, not a whole topic, so a short, direct video often serves it better than a long overview. When you publish, reply to the people who asked. It tells them the video exists and gives them a reason to come back.',
        ],
      },
      {
        h2: 'Which topics to skip',
        p: [
          'Gap analysis is as useful for what not to film. If a question is already answered well by several recent videos and you have nothing new to add, skip it, even when the demand is real. Demand alone is not enough. You need demand that nobody is meeting.',
          'Skip questions you cannot answer with some authority too. A gap you cannot fill honestly is just a risk of a weak video.',
        ],
      },
      {
        h2: 'Doing it faster with Gapstronaut',
        p: [
          'Reading hundreds of comments by hand is slow. Gapstronaut does that reading for you: type a niche, or paste a channel, and it reads the comments under the videos that are working. It lists the questions nobody has answered, each one linked to the real comment it came from, along with topics to skip and a script brief to start from.',
          'It is free while in beta, with no card needed, and you get three new reports a day. A report takes about a minute and a half, and reopening a saved one is always free.',
        ],
      },
    ],
    ctas: [
      { href: '/signup', label: 'Create a free account' },
      { href: '/sample-report', label: 'See a sample report' },
      { href: '/guides/youtube-video-ideas-from-comments', label: 'Next: find video ideas in the comments' },
    ],
  },

  '/guides/youtube-video-ideas-from-comments': {
    file: 'guide-youtube-video-ideas-from-comments',
    title: 'Find YouTube Video Ideas in the Comments',
    description: 'How to mine YouTube comments for video ideas: what to look for, how to tell real demand from noise, and how to turn a question into a title.',
    h1: 'How to find YouTube video ideas in the comments',
    updated: '7 November 2026',
    intro: 'The comments under a video are a free list of what viewers want next. This guide shows where to look, which comments are worth saving, which to ignore, and how to turn a question into a title you can film this week.',
    sections: [
      {
        h2: 'Why comments are an idea list',
        p: [
          'Every comment is a viewer telling you something they wanted and did not get. Some are questions, some are requests, some are complaints about a missing step. Together they are a to-do list written by your audience.',
          'The same is true of videos that are not yours. The comments on a competitor’s best video show you what that video left out, and that is what you can make.',
        ],
      },
      {
        h2: 'Where to look first',
        p: [
          'Start with your own recent videos, since those viewers already like what you make. Then move to the top videos in your niche and to the channels your viewers also watch. Pick videos with plenty of comments, because a handful of replies tells you very little.',
          'Sort by top comments first, because they show what other viewers agreed with. Then sort by newest to catch what people are asking now.',
        ],
      },
      {
        h2: 'Comments worth saving',
        p: [
          'Save direct questions: “how do I…”, “why does…”, “what happens if…”. Save requests such as “can you make a video on…” or “please do part two”. Save comments that describe being stuck, like “I followed this and it still doesn’t work”.',
          'Pay special attention to a comment that other people have replied to with “same” or a thumbs up. That is a small vote for the idea, written by the people you are trying to reach.',
        ],
      },
      {
        h2: 'Comments to ignore',
        p: [
          'Skip praise, jokes, spam and self-promotion. They are pleasant but they are not ideas. Skip one-off questions that only apply to a single person’s situation, unless the same situation keeps coming up.',
          'Be careful with very specific complaints about the video itself, such as audio levels or editing. They are worth fixing, but they are notes on this video, not a new one.',
        ],
      },
      {
        h2: 'From a comment to a title',
        p: [
          'Keep the viewer’s wording. If people write “starter smells like nail polish”, a title that says exactly that will match what the next person types. Add the outcome the viewer wants, such as how to fix it, and keep it short enough to read at a glance.',
          'Then write one sentence that says what the video will answer. If you cannot, the idea is still a topic, not a video. Narrow it until one sentence fits.',
        ],
      },
      {
        h2: 'Check before you film',
        p: [
          'Search for the question yourself. If the first results answer it clearly, look for an angle they missed, or move on. If they answer something close but not the question, you have found the gap.',
          'Look at a few of the videos that came up. Are they recent? Do their own comments still ask the same thing? If viewers are still asking under the best existing answer, the answer is not working for them, and there is room for yours.',
        ],
      },
      {
        h2: 'Keep a running list',
        p: [
          'Ideas from comments do not expire quickly, but the best ones are the ones you act on. Keep a simple list with the question as written, the video it came from, and how many people repeated it. Review it before each planning session and film the one that is most repeated and least answered.',
        ],
      },
      {
        h2: 'A twenty-minute weekly routine',
        p: [
          'You do not need a big research day. Once a week, open the comments on your three most recent videos and the three best-performing videos from channels you admire. Spend ten minutes reading, saving every repeated question and every request as you go.',
          'Spend the next ten minutes sorting what you saved. Cross out anything already answered by a recent video, circle the questions that appear more than once, and pick one to turn into a title. By the end you have a next video chosen from what viewers asked, instead of what you happened to feel like making.',
        ],
      },
      {
        h2: 'Let Gapstronaut do the reading',
        p: [
          'If reading every comment feels like too much, Gapstronaut does it for you. Give it a niche or a channel and it reads the comments under the videos that are working, then shows the questions nobody has answered with each one linked to the real comment behind it. You can see a sample report before signing up.',
        ],
      },
    ],
    ctas: [
      { href: '/signup', label: 'Create a free account' },
      { href: '/sample-report', label: 'See a sample report' },
      { href: '/guides/youtube-content-gap-analysis', label: 'Next: run a content gap analysis' },
    ],
  },
};

export const GUIDE_PATHS = Object.keys(GUIDES);
