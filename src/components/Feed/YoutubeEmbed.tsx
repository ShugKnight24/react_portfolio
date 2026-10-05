import { FC, useState } from 'react';
import { YoutubeEmbedProps } from '../../types/feed';
import styles from './Feed.module.css';

// The YouTube player is ~500 KB of script plus tracking cookies, so each card starts as a
// thumbnail and only swaps in the (privacy-enhanced) player once the visitor presses play.
export const YoutubeEmbed: FC<YoutubeEmbedProps> = ({ title, videoId, youtubeLink }) => {
  const [playing, setPlaying] = useState(false);
  // Removed or private videos have no thumbnail; show the dark card and play button instead
  const [thumbMissing, setThumbMissing] = useState(false);
  const label = title || 'YouTube video';

  return (
    <div className={styles.youtubeCard}>
      <div className={styles.youtubeResponsiveWrapper}>
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            title={label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.youtubeIframe}
          />
        ) : (
          <button
            type="button"
            className={styles.youtubeFacade}
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${label}`}
          >
            {!thumbMissing && (
              <img
                src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                alt=""
                width={480}
                height={360}
                loading="lazy"
                decoding="async"
                onError={() => setThumbMissing(true)}
              />
            )}
            <svg className={styles.youtubePlay} viewBox="0 0 68 48" aria-hidden="true">
              <path
                d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                fill="#f00"
              />
              <path d="M45 24 27 14v20" fill="#fff" />
            </svg>
          </button>
        )}
      </div>
      {youtubeLink && (
        <div className={styles.youtubeFooter}>
          <a
            href={youtubeLink}
            target="_blank"
            rel="noreferrer"
            className={styles.youtubeExternalLink}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span>Watch on YouTube</span>
          </a>
        </div>
      )}
    </div>
  );
};
