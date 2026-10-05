import { FC } from 'react';
import { Post as PostProps } from '../../types/feed';
import { YoutubeEmbed } from './YoutubeEmbed';
import styles from './Feed.module.css';

interface PostComponentProps {
  post: PostProps;
  isLiked?: boolean;
  likeCount?: number;
  reblogCount?: number;
  onToggleLike?: (id: number) => void;
  onReblog?: (id: number) => void;
  onShare?: (id: number) => void;
  onSelectTag?: (tag: string) => void;
}

// Procedural tags based on post content
const getTagsForPost = (post: PostProps): string[] => {
  const tags: string[] = [];
  if (post.artist) tags.push('music', post.artist.toLowerCase().replace(/\s+/g, ''));
  if (post.youtubeInfo) tags.push('video', 'soundtrack');
  if (post.title) {
    const words = post.title.toLowerCase().split(/\s+/).slice(0, 2);
    words.forEach((w) => {
      const clean = w.replace(/[^a-z0-9]/g, '');
      if (clean.length > 3) tags.push(clean);
    });
  }
  tags.push('thoughts', 'journal');
  return Array.from(new Set(tags)).slice(0, 4);
};

export const Post: FC<PostComponentProps> = ({
  post,
  isLiked = false,
  likeCount = (post.id * 3) % 47 + 12,
  reblogCount = (post.id * 2) % 23 + 4,
  onToggleLike,
  onReblog,
  onShare,
  onSelectTag,
}) => {
  const tags = getTagsForPost(post);
  const notesCount = likeCount + reblogCount;

  return (
    <article className={styles.feedPost}>
      <header className={styles.postHeader}>
        <div className={styles.authorTrack}>
          <span className={styles.authorAvatar} aria-hidden="true">
            S
          </span>
          <div className={styles.authorMeta}>
            <span className={styles.authorName}>Shugmi Shumunov</span>
            <span className={styles.reblogNote}>Entry {post.id}</span>
          </div>
        </div>
        <span className={styles.postTypeBadge}>
          {post.youtubeInfo ? 'Video' : post.artist ? 'Music' : 'Thought'}
        </span>
      </header>

      {/* Post Body */}
      <div className={styles.postBody}>
        {post.title && <h3 className={styles.postTitle}>{post.title}</h3>}

        {post.artist && (
          <div className={styles.postArtist}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span>{post.artist}</span>
          </div>
        )}

        {post.content && (
          <div className={styles.postContent}>
            {post.content
              .trim()
              .split(/\n\s*\n/)
              .map((paragraph, pIdx) => {
                const lines = paragraph.split('\n');
                return (
                  <p key={pIdx} className={styles.contentPara}>
                    {lines.map((line, lIdx) => (
                      <span key={lIdx}>
                        {line}
                        {lIdx < lines.length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                );
              })}
          </div>
        )}
      </div>

      {/* Media: Image or YouTube Video */}
      {post.image && (
        <div className={styles.mediaFrame}>
          <img src={post.image} alt={post.title || 'Post image'} />
        </div>
      )}

      {post.youtubeInfo && (
        <div className={styles.mediaFrame}>
          <YoutubeEmbed
            title={post.title}
            videoId={post.youtubeInfo.videoId}
            youtubeLink={post.youtubeInfo.videoLink}
          />
        </div>
      )}

      <div className={styles.tagsRow}>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className={styles.tagPill}
            onClick={() => onSelectTag?.(t)}
          >
            #{t}
          </button>
        ))}
      </div>

      {/* Tumblr Action Bar */}
      <div className={styles.postActionBar}>
        <span className={styles.notesCount}>{notesCount} notes</span>

        <div className={styles.actionButtons}>
          {/* Share Button */}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onShare?.(post.id)}
            title="Copy post link"
            aria-label="Share post"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Reblog Button */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.reblogBtn}`}
            onClick={() => onReblog?.(post.id)}
            title="Reblog to your feed"
            aria-label="Reblog post"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span>{reblogCount}</span>
          </button>

          {/* Like Button */}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.likeBtn} ${isLiked ? styles.liked : ''}`}
            onClick={() => onToggleLike?.(post.id)}
            title={isLiked ? 'Unlike' : 'Like'}
            aria-label="Like post"
          >
            <svg viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{likeCount}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
