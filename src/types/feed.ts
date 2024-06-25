export interface FeedProps {
  truncate?: number;
}

// TODO: Create additional posts for different content types
export interface Post {
  id: number;
  title?: string;
  content?: string;
  artist?: string;
  youtubeInfo?: YoutubeInfo;
  image?: string;
  // date: timestamp or formated string?
  // type: non text content? - differentially render & style content based on type...
}

export interface BookPost extends Post {
  author?: string;
  book?: string;
  blockquote?: string;
}

export interface MusicPost extends Post {
  album?: string;
  albumArt?: string;
  song?: string;
}

export type FeedPost = Post | BookPost | MusicPost;

export interface YoutubeEmbedProps {
  title?: string;
  videoId: string;
  youtubeLink: string;
}

interface YoutubeInfo {
  videoId: string;
  videoLink: string;
}
