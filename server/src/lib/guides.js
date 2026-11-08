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
    updated: '8 November 2026',
    intro: 'A content gap is a question viewers keep asking that no video in your niche answers well yet. This guide shows how to find those gaps by hand, how to tell a real gap from a crowded topic, and how to turn one into a video worth making.',
    sections: [
      {
        h2: 'What a content gap is',
        p: [
          'A content gap is the distance between what viewers want to know and what the videos on a topic actually tell them. It is not the same as a keyword gap. A keyword gap starts from what people type into a search box. A content gap starts from what viewers say after they have already watched something and still could not get the answer.',
          'For example, in a sourdough niche, lots of videos show how to feed a starter. A gap might be the question viewers keep leaving under those videos: why does my starter smell like nail polish remover, and is it dead? Plenty of people ask, and few videos answer it directly.',
          'You may have seen content gap analysis for websites, which compares your existing content with competitor content and the search volume behind each keyword. On YouTube, the same idea works better from the comments: search volume shows what people type, while comments show what they still could not get from the videos that exist.',
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
          'Start by choosing a narrow niche and listing ten to twenty recent videos in it that are doing well. Look at your own channel, your closest competitors, and the videos YouTube keeps recommending for the topic. The competitor analysis guide shows how to pick those channels.',
          'Open the comments on each one and read them, sorted by top and by newest. Write down every question that is not answered in the video, plus every phrase like “I still don’t understand” or “can you make a video on”. Keep the wording as written.',
          'Next, group the notes. The same question showing up under different videos, or from different people under one video, is the first sign of a gap. Finally, take each repeated question and search for it on YouTube yourself. If the top results answer it clearly and recently, it is not a gap. If they answer a nearby question, or answer it badly, it is.',
        ],
      },
      {
        h2: 'A worked example',
        p: [
          'Say your channel is about home espresso. You list fifteen recent videos in the niche that are doing well: beginner setups, grinder reviews, latte art. Reading their comments, you notice the same complaint again and again, in different words: “my shots taste sour even though I followed the recipe exactly”. It shows up under the setup videos and the grinder videos alike.',
          'You search for it on YouTube. The top results explain grind size in general, and a few mention sour shots in passing, but none starts from the viewer’s situation: the same recipe, a new bag of beans, and suddenly sour coffee. That is a gap. A video built around that exact situation, answering it in the first minute, speaks to people who have already said they need it.',
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
        h2: 'Common mistakes',
        p: [
          'The most common mistake is treating one loud comment as demand. A single passionate question is a lead, not a gap, until other people ask it too. The second is counting praise as interest: “great video” tells you people enjoyed it, not what they still need.',
          'Another is copying the question but not adding an angle. If your video answers the same thing in the same way as the existing ones, it does not fill a gap. The last is waiting too long. A gap closes when someone else answers it, so a real one is worth filming soon.',
        ],
      },
      {
        h2: 'A quick checklist before you film',
        p: [
          'Before you commit to a gap, check five things. More than one person asked it. You can write the title from the question. The top search results do not answer it clearly. You can answer it with some authority. And you can answer it in the first minute of the video. If all five are true, film it.',
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
      { href: '/guides/youtube-competitor-analysis', label: 'Study what works for your competitors' },
    ],
  },

  '/guides/youtube-video-ideas-from-comments': {
    file: 'guide-youtube-video-ideas-from-comments',
    title: 'Find YouTube Video Ideas in the Comments',
    description: 'How to mine YouTube comments for video ideas: what to look for, how to tell real demand from noise, and how to turn a question into a title.',
    h1: 'How to find YouTube video ideas in the comments',
    updated: '8 November 2026',
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
          'Start with your own recent videos, since those viewers already like what you make. Then move to the top videos in your niche and to the channels your viewers also watch. Pick videos with plenty of comments, because a handful of replies tells you very little. On your own YouTube channel, YouTube Studio shows the comments from all your videos in one place, so you do not have to open them one by one.',
          'Sort by top comments first, because they show what other viewers agreed with. Then sort by newest to catch what people are asking now.',
        ],
      },
      {
        h2: 'How to come up with YouTube video ideas when you are stuck',
        p: [
          'When the comments on your own videos run dry, widen the net. Read the comments on a rival’s best recent videos, especially the ones that did far better than that channel usually does. The competitor analysis guide shows how to spot them. Those comments come from viewers who already care about your topic.',
          'Next, type your topic into the YouTube search box and read the suggestions that appear as you type. They are phrased the way viewers phrase things. Keep any suggestion that matches a question you have seen in the comments, because two sources agreeing is a stronger sign than either one alone.',
          'Finally, go back to the comments on your own older videos. Questions people asked a year ago may still be unanswered, and you already have the audience that asked them.',
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
        h2: 'A worked example',
        p: [
          'Say you run a houseplant channel. Under several of your repotting videos, viewers write things like “leaves started turning yellow a week after I repotted it” and “same thing happened to my monstera, did I kill it?”, and other viewers reply “same”. That is one question, asked many ways, by people who want to save the plant.',
          'In their words, the title might be “Yellow Leaves After Repotting: What It Means and What to Do”. The one-sentence promise: why leaves turn yellow after a repot, and what to check before you panic. That sentence fits, so it is a video, not just a topic.',
        ],
      },
      {
        h2: 'How to research a video idea before you film',
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
      { href: '/guides/youtube-competitor-analysis', label: 'Study what works for your competitors' },
      { href: '/guides/youtube-video-ideas-to-get-subscribers', label: 'Video ideas to get subscribers' },
    ],
  },

  '/guides/youtube-competitor-analysis': {
    file: 'guide-youtube-competitor-analysis',
    title: 'YouTube Competitor Analysis: How to Do It, Step by Step',
    description: 'How to do a YouTube competitor analysis: find the rival videos that beat their own average, what viewers still ask under them, and what to make next.',
    h1: 'YouTube competitor analysis: see what works for rivals, then make what they missed',
    updated: '8 November 2026',
    intro: 'A YouTube competitor analysis is a close look at the channels your viewers already watch: which of their videos work, why they work, and what those videos still leave out. This guide shows how to do one by hand, what to look at, what to ignore, and how to turn what you find into a video of your own.',
    sections: [
      {
        h2: 'Pick the right competitors',
        p: [
          'Choose three to five YouTube competitors in your exact niche. The most useful ones are a little bigger than you, about the size you want to be next, because what works for them is within reach. A huge channel in a neighbouring topic is a poor guide: its views often come from its name, not from the video.',
          'Include at least one channel that grew recently. A channel that took off in the last year shows what viewers want now, while an older channel’s best videos may reflect a niche that has since moved on.',
        ],
      },
      {
        h2: 'Find the videos that beat their own average',
        p: [
          'Do not start from a channel’s most viewed videos. Start from the ones that did far better than that channel usually does. For example, if a channel’s recent uploads tend to get around 20,000 views and one got 200,000, that video probably reached well past its regular viewers. Something about its topic or angle pulled new people in. A channel’s top performing videos by total views mostly show its oldest hits; the outliers show what is pulling viewers in now.',
          'Look at each channel’s last twenty or thirty uploads, note the usual view count, and circle anything at several times that number. Write down the topic and the angle, not just the title. “Beginner mistakes” or “what I wish I knew” is an angle you can use in your own niche; the exact title is not.',
          'Give new videos time. A video posted two days ago has not had its chance yet, so compare videos that have been up for at least a few weeks.',
        ],
      },
      {
        h2: 'Read the comments under their best videos',
        p: [
          'The comments on a rival’s outlier tell you two things: what viewers liked enough to say so, and what the video did not answer. The second list is your opening. Note every unanswered question and every comment like “still confused about” or “can you do one on”, in the viewer’s own words.',
          'When the same question appears under more than one rival’s video, it is a strong sign of a content gap: a question nobody in the niche answers well yet. The content gap guide shows how to confirm one before you film.',
        ],
      },
      {
        h2: 'Compare titles, thumbnails and formats',
        p: [
          'Line up the winning videos and look for patterns. Do the titles promise an outcome, name a mistake, or use a number? Are the thumbnails a face, a before and after, or a single object? Are the winners long tutorials, short answers or Shorts? Note the pattern, not the wording. Copying a title or thumbnail closely rarely works and can get you in trouble.',
          'Notice what they stopped making, too. A series that ended while its comments still ask for more is a request nobody is meeting.',
        ],
      },
      {
        h2: 'Decide what to make, and what to skip',
        p: [
          'Make a video when viewers are asking, a rival’s video shows the topic has demand, and the existing answers leave something out. Skip a topic when several strong, recent videos already cover it well and you have nothing new to add. A competitor’s success tells you there is demand. It does not tell you there is room.',
          'Aim to be different, not a copy. The best result of a competitor analysis is a video that answers the question the rival’s viewers were left with, in your own voice.',
        ],
      },
      {
        h2: 'What to look for in a YouTube competitor analysis tool',
        p: [
          'Doing this by hand works, but it takes hours across several channels. If you use a tool, check three things. It should work from public YouTube data, so nobody has to connect their account. It should compare a video with its own channel’s usual numbers, not only with the biggest channels. And it should show the real comments behind every idea, so you can check the demand yourself instead of trusting a score.',
        ],
      },
      {
        h2: 'Keep it going',
        p: [
          'Competitors keep publishing and viewers keep asking. A short review every few weeks, covering their new uploads, the outliers among them and the questions under those, keeps your list of ideas current. Keep your notes in one place: the video, the angle, the repeated question, and whether you made something from it. Over time, these notes become a content strategy built on what viewers asked for, which is steadier channel growth than chasing whatever went viral last week.',
        ],
      },
      {
        h2: 'Doing it faster with Gapstronaut',
        p: [
          'Gapstronaut does the reading for you. Paste a competitor’s channel, or type a niche, and it reads the comments under the videos that are working. It lists the questions nobody has answered, each linked to the real comment it came from, along with topics to skip and a script brief to start from. When you type a niche, it also marks the videos that did far better than their own channel’s usual numbers.',
          'It is free while in beta, with no card needed, and you get three new reports a day. Reopening a saved report is always free.',
        ],
      },
    ],
    ctas: [
      { href: '/signup', label: 'Create a free account' },
      { href: '/sample-report', label: 'See a sample report' },
      { href: '/guides/youtube-content-gap-analysis', label: 'Next: run a content gap analysis' },
      { href: '/guides/youtube-video-ideas-from-comments', label: 'Find video ideas in the comments' },
    ],
  },
  '/guides/youtube-video-ideas-to-get-subscribers': {
    file: 'guide-youtube-video-ideas-to-get-subscribers',
    title: 'YouTube Video Ideas to Get Subscribers (15 to Try)',
    description: '15 YouTube video ideas to get subscribers: ideas that answer what viewers already ask, start a viewing habit, and give people a reason to come back.',
    h1: 'YouTube video ideas to get subscribers: 15 to try, and how to pick yours',
    updated: '8 November 2026',
    intro: 'Views come from one good video. Subscribers come from viewers deciding they want the next one too. These 15 ideas are built around that: most start from something viewers already ask for, and all of them give viewers a reason to come back. Each comes with an example title from one sample niche, home baking, so you can see how it might look.',
    sections: [
      {
        h2: 'Why some videos win subscribers and others only win views',
        p: [
          'Viewers tend to subscribe when a video solves something for them and makes it clear there is more where that came from. A one-off viral clip can bring thousands of views and few subscribers, because nothing promises a next time. A video that answers a real question, from a channel that obviously answers questions like it, gives people a reason to press the button.',
          'So the best ideas do two jobs: they meet a need viewers have already said out loud, and they point to what comes next.',
        ],
      },
      {
        h2: 'Ideas that answer what viewers ask',
        p: [
          '1. The unanswered question: find a question that keeps coming up in the comments in your niche and that no video answers clearly, then answer it in the first minute. People who searched for it and found you are likely to want your next answer too. Example: “Why your sourdough comes out flat, and how to fix it”.',
          '2. Part two of your most requested video: if viewers keep asking for a follow-up, make it. They have told you they want more. Example: “Sourdough part two: the shaping you asked about”.',
          '3. The fix-it video: people arrive stuck and leave helped, which builds trust. Example: “Why your cookies spread, and how to stop it”.',
          '4. Beginner mistakes: list the mistakes newcomers in your niche make, using the problems viewers describe in comments. Example: “Bread mistakes beginners make, and how to avoid them”.',
          '5. The FAQ roundup: answer the ten questions you get asked most, one after another. It is quick to make, and each answer can lead into a fuller video later. Example: “Your ten most asked baking questions, answered”.',
        ],
      },
      {
        h2: 'Ideas that start a habit',
        p: [
          '6. A numbered series: a challenge, a build or a course in episodes. Episode one gives viewers a reason to subscribe, because they want episode two. Example: “Thirty days of sourdough: day one”.',
          '7. Progress updates: document a goal over weeks. Viewers who care about the outcome subscribe to see it. Example: “Learning to laminate dough: week four”.',
          '8. A regular roundup: a monthly look at what changed in your niche gives people a reason to come back on a schedule. Example: “What changed in home baking this month”.',
        ],
      },
      {
        h2: 'Ideas that borrow proven demand',
        p: [
          '9. Your take on a rival’s standout topic: when a video does far better than its channel usually does, the topic has pull. Cover it from a different angle, or answer what its comments say it left out. Example: if a rival’s no-knead bread video took off, “No-knead bread, tested three ways”.',
          '10. You asked, I tested: take a question viewers argue about and test it on camera. Example: “You asked, I tested: does cold proofing make better bread?”.',
          '11. The myth test: pick a common claim in your niche and check whether it holds up. Example: “Do you really need to sift flour? I tested it”.',
          '12. The comparison viewers keep asking for: “X or Y?” debates in comments are ready-made titles. Example: “Instant yeast or sourdough starter: which should you start with?”.',
        ],
      },
      {
        h2: 'Ideas that show who is behind the channel',
        p: [
          '13. Your setup or process: viewers who like your results want to see how you get them. Faceless channels can show the process or the workspace instead. Example: “My whole baking setup, and what I would skip”.',
          '14. The long-term review: an honest look at something after months of real use. Example: “My stand mixer after a year of weekly bread”.',
          '15. What I would do if I started again: your hard-won advice for someone at the start. It works in most niches. Example: “If I started baking bread again, I would do this”.',
        ],
      },
      {
        h2: 'How to pick the right idea for your channel',
        p: [
          'Do not try all fifteen. Start with the ones your viewers are already asking for: the comments on your recent videos and on the best recent videos in your niche will tell you, and the guide to finding video ideas in the comments shows how to read them.',
          'Pick ideas you can keep making. A series you abandon after two episodes teaches viewers not to wait for you.',
        ],
      },
      {
        h2: 'Make the reason to subscribe obvious',
        p: [
          'Say what the channel is for, in one sentence, somewhere in the video. Viewers subscribe to a promise, not just a video.',
          'End by pointing at the next video, not at the subscribe button alone. When the next video answers the question this one raised, the click feels natural.',
        ],
      },
      {
        h2: 'Finding these ideas faster with Gapstronaut',
        p: [
          'The hard part of most ideas above is knowing what viewers are asking. Gapstronaut reads the comments under the videos that are working in your niche, or on a channel you paste. It lists the questions nobody has answered, each linked to the real comment it came from, along with topics to skip and a script brief to start from.',
          'It is free while in beta, with no card needed, and you get three new reports a day. Reopening a saved report is always free.',
        ],
      },
    ],
    ctas: [
      { href: '/signup', label: 'Create a free account' },
      { href: '/sample-report', label: 'See a sample report' },
      { href: '/guides/youtube-video-ideas-from-comments', label: 'Find video ideas in the comments' },
      { href: '/guides/youtube-competitor-analysis', label: 'YouTube competitor analysis' },
    ],
  },
};

export const GUIDE_PATHS = Object.keys(GUIDES);
