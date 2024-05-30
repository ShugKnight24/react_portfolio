import { FC, useState } from 'react';
import { FeedProps, Post } from '../../types/feed';
import { postsArray } from '../../data/feedData';
import { Link } from 'react-router-dom';

// TODO: Based off of the current implementation, consider the following:
// Style the component differently
// Style the posts differently
// Style the load more button

export const Feed: FC<FeedProps> = ({ truncate }) => {
  // Allow users to create their own posts for fun?
  const [posts, setPosts] = useState<Post[]>(postsArray);

  const displayedPosts = truncate ? posts.slice(0, truncate) : posts;

  return (
    <div>
      {!posts.length && <p>No posts to display</p>}
      {!truncate && <h1>Feed</h1>}
      {displayedPosts.map((post) => (
        <div key={post.id}>
          <h3>{post.title}</h3>
          <p>{post.content}</p>
        </div>
      ))}
      {truncate && posts.length > truncate && (
        <Link to="/feed">
          <button>Load More</button>
        </Link>
      )}
    </div>
  );
}
