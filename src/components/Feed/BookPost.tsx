import { FC } from 'react';
import { BookPost as BookPostProps } from '../../types/feed';
import styles from './Feed.module.css';

interface BookPostComponentProps {
  post: BookPostProps;
  isLiked?: boolean;
  likeCount?: number;
  reblogCount?: number;
  onToggleLike?: (id: number) => void;
  onReblog?: (id: number) => void;
  onShare?: (id: number) => void;
  onSelectTag?: (tag: string) => void;
}

export const BookPost: FC<BookPostComponentProps> = ({
  post,
  isLiked = false,
  likeCount = (post.id * 4) % 61 + 18,
  reblogCount = (post.id * 2) % 31 + 8,
  onToggleLike,
  onReblog,
  onShare,
  onSelectTag,
}) => {
  const tags = [
    'quotes',
    'philosophy',
    post.author ? post.author.toLowerCase().replace(/\s+/g, '') : 'stoicism',
    'mindset',
  ];

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
            <span className={styles.reblogNote}>Entry {post.id} &middot; from the archive</span>
          </div>
        </div>
        <span className={styles.postTypeBadge}>Quote</span>
      </header>

      {/* Post Body: Stylized Quote Block */}
      <div className={styles.postBody}>
        {post.blockquote ? (
          <blockquote className={styles.quoteBlock}>
            <p className={styles.quoteText}>&ldquo;{post.blockquote}&rdquo;</p>
            {post.author && (
              <cite className={styles.quoteSource}>
                {post.author}
                {post.book ? <span className={styles.quoteBook}>, {post.book}</span> : null}
              </cite>
            )}
          </blockquote>
        ) : post.content ? (
          <blockquote className={styles.quoteBlock}>
            <p className={styles.quoteText}>&ldquo;{post.content}&rdquo;</p>
            {post.author && (
              <cite className={styles.quoteSource}>
                {post.author}
                {post.book ? <span className={styles.quoteBook}>, {post.book}</span> : null}
              </cite>
            )}
          </blockquote>
        ) : null}

        {post.blockquote && post.content && (
          <div className={styles.postContent}>
            {post.content
              .trim()
              .split(/\n\s*\n/)
              .map((para, idx) => (
                <p key={idx} className={styles.contentPara}>{para}</p>
              ))}
          </div>
        )}
      </div>

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
          {/* Share */}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onShare?.(post.id)}
            title="Copy quote link"
            aria-label="Share quote"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Reblog */}
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

          {/* Like */}
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
