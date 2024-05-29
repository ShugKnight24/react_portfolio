import { useState } from 'react';
import { Post } from '../../types/feed';
import { postsArray } from '../../data/feedData';

// TODO: display posts differently between /feed & /landing or /
// Based on the path, or based on a prop...
// Style the component differently
// Style the posts differently
// Truncate the number of posts in the landing page and add a "view more" button

export const Feed = () => {
  // Allow users to create their own posts for fun?
  const [posts, setPosts] = useState<Post[]>(postsArray);

  return (
    <div>
      <h2>Feed</h2>
      {posts.map((post) => (
        <div key={post.id}>
          <h3>{post.title}</h3>
          <p>{post.content}</p>
        </div>
      ))}
    </div>
  );
}
