import { FC, useState } from 'react';
import { FeedProps, FeedPost } from '../../types/feed';
import { postsArray } from '../../data/feedData';
import { Link } from 'react-router-dom';

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
          return (
            <div key={post.id} className="post book-post">
              <h3>{post.title}</h3>
              {post.blockquote && <p>{post.blockquote}</p>}
              {post.author && <p>{post.author}</p>}
              {post.book && <p>{post.book}</p>}
              <hr />
            </div>
          );
        } else if ('artist' in post && 'album' in post) {
          return (
            <div key={post.id} className="post music-post">
              <h3>{post.title}</h3>
              {post.artist && <p>{post.artist}</p>}
              {post.song && <p>{post.song}</p>}
              {post.albumArt && <img className="album-art" src={post.albumArt} alt={post.album} />}
              {post.youtubeLink && (
                <a
                  href={post.youtubeLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Watch on YouTube
                </a>
              )}
              <hr />
            </div>
          );
        } else {
          return (
            <div key={post.id} className="post">
              {post.title && <h3>{post.title}</h3>}
              {post.artist && <p>{post.artist}</p>}
              {post.content && post.content.split('\n').map((line, index) => (
                (line !== '' && line.trim() !== '') && <p key={index}>{line}</p>
              ))}
              {post.youtubeLink && (
                <a
                  href={post.youtubeLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Watch on YouTube
                </a>
              )}
              <hr />
            </div>
          );
        }
      })}
      {truncate && posts.length > truncate && (
        <Link to="/feed">
          <button>Load More Posts</button>
        </Link>
      )}
    </div>
  );
}
