import { Post } from '../types/feed';

export const postsArray: Post[] = [
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
  }
];
