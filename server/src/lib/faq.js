/**
 * The homepage questions: one source for the section people see (web/src/components/home/Sections.jsx)
 * and the snapshot crawlers read (seoPages.js). Plain answers only: what the product does for a creator,
 * never how it works inside. Keep every figure true ("3 new reports a day", "about a minute and a half").
 */
export const FAQ = [
  {
    q: 'What is Gapstronaut?',
    a: 'Gapstronaut is a free tool for YouTube creators that finds the videos your audience is still asking for. Type a niche or paste a channel, and it reads the comments under videos that are already doing well, then lists the questions nobody has answered, each one linked to the real comment it came from. You also get topics to skip and a script brief to start from.',
  },
  { q: 'What is a content gap?', a: 'A question viewers keep asking in the comments that no video in the niche answers well yet.' },
  { q: 'Who is it for?', a: 'YouTubers deciding what to film next, from small channels to agencies researching a niche.' },
  { q: 'Can I analyse a competitor’s channel?', a: 'Yes. Paste a channel instead of a niche.' },
  { q: 'Where does the data come from?', a: 'Public YouTube videos and comments, read through YouTube’s official API. Gapstronaut uses YouTube API Services and is not affiliated with YouTube.' },
  { q: 'What does it cost?', a: 'It is free during the beta, with no card needed. You get 3 new reports a day, and reopening a saved report is always free.' },
  { q: 'How long does a report take?', a: 'About a minute and a half.' },
  { q: 'Are my reports private?', a: 'Yes. They belong to your account and you can delete any report. The Privacy Policy has the details.' },
];
