export interface FeedProps {
  truncate?: number;
}

export interface Post {
  id: number;
  title?: string;
  content?: string;
  // image: src string?
  // date: timestamp or formated string?
  // type: non text content?
}
