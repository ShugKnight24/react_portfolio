import { FC, useState } from 'react';
import { FeedProps, Post } from '../../types/feed';
import { postsArray } from '../../data/feedData';
import { Link } from 'react-router-dom';

// More long term
// TODO: Based off of the current implementation, consider the following:
// Style the component differently
// Style the posts differently
// Style the load more button

export const Feed: FC<FeedProps> = ({ truncate }) => {
  // Allow users to create their own posts for fun
  const [posts, setPosts] = useState<Post[]>(postsArray);

  const displayedPosts = truncate ? posts.slice(0, truncate) : posts;

  return (
    <div>
      {!posts.length && <p>No posts to display</p>}
      {!truncate ? <h1>Feed</h1> : <h2>Feed</h2>}
      {displayedPosts.map((post) => (
        // TODO: Create a post subcomponent to display the posts
        // Handle any additional logic there
        <div key={post.id}>
          <h3>{post.title}</h3>
          {post.content && post.content.split('\n').map((line, index) => (
            (line !== '' && line.trim() !== '') && <p key={index}>{line}</p>
          ))}
          {/* In futurue use type or other indicator to differently render and style */}
          {post.artist && <p>{post.artist}</p>}
          {post.song && <p>{post.song}</p>}
          {post.albumArt && <img src={post.albumArt} alt={post.album} />}
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
