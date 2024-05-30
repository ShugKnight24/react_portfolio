export interface FeedProps {
  truncate?: number;
}

// TODO: Way to have different posts - songs, albums, artists, movies, media, image, games, travel, comics, etc.
// create a base interface / type that can be extended
export interface Post {
  artist?: string;
  album?: string;
  albumArt?: string;
  content?: string;
  id: number;
  song?: string;
  title?: string;
  // image: src string?
  // date: timestamp or formated string?
  // type: non text content? - differentially render & style content based on type...
}
