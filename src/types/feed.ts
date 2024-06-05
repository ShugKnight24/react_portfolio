export interface FeedProps {
  truncate?: number;
}

// TODO: Create additional posts for different content types
interface Post {
  id: number;
  title?: string;
  content?: string;
  // image: src string?
  // date: timestamp or formated string?
  // type: non text content? - differentially render & style content based on type...
}

interface BookPost extends Post {
  author?: string;
  book?: string;
  blockquote?: string;
}

interface MusicPost extends Post {
  artist?: string;
  album?: string;
  albumArt?: string;
  song?: string;
}

export type FeedPost = Post | BookPost | MusicPost;
