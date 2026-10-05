import { FC } from 'react';
import { YoutubeEmbedProps } from '../../types/feed';
import styles from './Feed.module.css';

export const YoutubeEmbed: FC<YoutubeEmbedProps> = ({ title, videoId, youtubeLink }) => {
  return (
    <div className={styles.youtubeCard}>
      <div className={styles.youtubeResponsiveWrapper}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title || 'YouTube Video Embed'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={styles.youtubeIframe}
        />
      </div>
      {youtubeLink && (
        <div className={styles.youtubeFooter}>
          <a
            href={youtubeLink}
            target="_blank"
            rel="noreferrer"
            className={styles.youtubeExternalLink}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span>Watch on YouTube</span>
          </a>
        </div>
      )}
    </div>
  );
};