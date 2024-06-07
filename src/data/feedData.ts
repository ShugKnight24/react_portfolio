import { FeedPost } from '../types/feed';

export const postsArray: FeedPost[] = [
  {
    id: 9,
    title: 'The Path',
    content: `
      "For wide is the gate and broad is the road that leads to destruction,
      and many enter through it.
      But small is the gate and narrow the road that leads to life,
      and only a few find it."
      I will find it
    `
  },
  {
    id: 8,
    title: 'Astartes',
    content: `
      Come on, you apes! You wanna live forever?
      Everybody fights, no one quits.
      OoRah!
    `,
    artist: 'Syama Pedersen',
    youtubeLink: 'https://www.youtube.com/watch?v=azVeFAETUyM'
  },
  {
    id: 7,
    title: '6/6/24',
    content: `
      6/6/6
      Mark of the beast
    `,
  },
  {
    id: 6,
    title: 'The world is a mirror',
    blockquote: `I weep for Narcissus, but I never noticed that Narcissus was beautiful.
      I weep because, each time he knelt beside my banks, I could see, in the depths of his eyes, my own beauty reflected.
    `,
    author: 'Paulo Coelho',
    book: 'The Alchemist',
  },
  {
    id: 5,
    title: 'I call on my angels & they say...',
    content: `
      Ye of so little faith
      Don't doubt it, don't doubt it
      Victory is in your veins
      You know it, You know it
      You will not negotiate
      Fight it, just fight it
      Be transformed!
    `,
    artist: 'State of Mine',
    song: 'Rise',
    album: 'Devil in Disguise',
    albumArt: './img/feed/state_of_mine_devil_in_disguise.jpg',
    youtubeLink: 'https://www.youtube.com/watch?v=0lNpmPRjN-0'
  },
  {
    id: 4,
    title: 'The only mountain I have to climb is myself',
  },
  {
    id: 3,
    title: 'I have no enemies, there is only one',
  },
  {
    id: 2,
    title: 'Let me in before you go',
    content: `
      I know that it's hard to change
      Don't cut me just because you're scared
    `,
  },
  {
    id: 1,
    title: 'Even if it makes me blind',
    content: `I just want to see the light`,
    artist: 'San Holo',
    song: 'Light',
    album: 'Light',
    albumArt: './img/feed/san_holo_light.jpg',
    youtubeLink: 'https://www.youtube.com/watch?v=uOFTqVi-qp4'
  }
];
