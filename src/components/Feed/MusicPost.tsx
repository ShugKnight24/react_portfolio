import { FC, useState } from 'react';
import { MusicPost as MusicPostProps } from '../../types/feed';
import { YoutubeEmbed } from './YoutubeEmbed';
import { sound } from '../arcade/audio/audioSynth';
import styles from './Feed.module.css';

interface MusicPostComponentProps {
  post: MusicPostProps;
  isLiked?: boolean;
  likeCount?: number;
  reblogCount?: number;
  onToggleLike?: (id: number) => void;
  onReblog?: (id: number) => void;
  onShare?: (id: number) => void;
  onSelectTag?: (tag: string) => void;
}

export const MusicPost: FC<MusicPostComponentProps> = ({
  post,
  isLiked = false,
  likeCount = (post.id * 5) % 53 + 15,
  reblogCount = (post.id * 3) % 27 + 6,
  onToggleLike,
  onReblog,
  onShare,
  onSelectTag,
}) => {
  const [isPlayingSynth, setIsPlayingSynth] = useState(false);

  const handlePlayAudioPreview = () => {
    if (isPlayingSynth) {
      setIsPlayingSynth(false);
      return;
    }

    setIsPlayingSynth(true);
    sound.playPowerUp();

    // Play a short synth musical sequence
    setTimeout(() => sound.playCoin(), 300);
    setTimeout(() => sound.playJump(), 600);
    setTimeout(() => setIsPlayingSynth(false), 2400);
  };

  const tags = [
    'music',
    'soundtrack',
    post.artist ? post.artist.toLowerCase().replace(/\s+/g, '') : 'tracks',
    'heavyrotation',
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
            <span className={styles.reblogNote}>Entry {post.id} &middot; now spinning</span>
          </div>
        </div>
        <span className={styles.postTypeBadge}>Music</span>
      </header>

      {/* Vinyl Deck Card */}
      <div className={styles.musicCardDeck}>
        <div className={`${styles.vinylRecord} ${isPlayingSynth ? styles.spinning : ''}`}>
          <div className={styles.vinylCenter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>

        <div className={styles.musicMeta}>
          <span className={styles.songTitle}>{post.song || post.title || 'Unknown Track'}</span>
          <span className={styles.artistName}>by {post.artist || 'Featured Artist'}</span>

          <div className={styles.audioSynthBar}>
            <button
              type="button"
              className={styles.playSynthBtn}
              onClick={handlePlayAudioPreview}
            >
              {isPlayingSynth ? 'Pause preview' : 'Play preview'}
            </button>

            {isPlayingSynth && (
              <div className={styles.soundWaveVisualizer}>
                <div className={styles.waveBar} />
                <div className={styles.waveBar} />
                <div className={styles.waveBar} />
                <div className={styles.waveBar} />
                <div className={styles.waveBar} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Album Art if present */}
      {post.albumArt && (
        <div className={styles.mediaFrame}>
          <img src={post.albumArt} alt={post.song || 'Album art'} />
        </div>
      )}

      {/* Post Content / Lyrics */}
      <div className={styles.postBody}>
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

      {/* YouTube Embed if present */}
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
          {/* Share */}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onShare?.(post.id)}
            title="Copy track link"
            aria-label="Share track"
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
