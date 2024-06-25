import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { postsArray } from '../../data/feedData';
import { FeedPost, FeedProps } from '../../types/feed';
import { BookPost } from './BookPost';
import { MusicPost } from './MusicPost';
import { Post } from './Post';

// Create a grid system that displays the posts in rows and columns that adjusts
// the layout based on the height of the content

export const Feed: FC<FeedProps> = ({ truncate }) => {
  // Allow users to create their own posts for fun
  const [posts, setPosts] = useState<FeedPost[]>(postsArray);

  const displayedPosts = truncate ? posts.slice(0, truncate) : posts;

  return (
    <div className="feed">
      {!posts.length && <p>No posts to display</p>}
      {!truncate ? <h1>Feed</h1> : <h2>Feed</h2>}
      <hr />
      {/* TODO: Create subcomponent that handles differential rendering */}
      {displayedPosts.map((post) => {
        if ('author' in post && 'book' in post) {
          return <BookPost key={post.id} post={post} />;
        } else if ('albumart' in post && 'song' in post) {
          return <MusicPost key={post.id} post={post} />;
        } else {
          return <Post key={post.id} post={post} />;
        }
      })}
      {truncate && posts.length > truncate && (
        <Link to="/feed">
          <button>Load More Posts</button>
        </Link>
      )}
    </div>
  );
};
