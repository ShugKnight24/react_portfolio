import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Photo, webp } from '../../data/photos';
import styles from './Gallery.module.css';

interface GalleryProps {
  photos: Photo[];
  /** Used in the lightbox label, e.g. "Luna" */
  label?: string;
}

const Icons = {
  close: (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  prev: (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  next: (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  ),
};

const pad = (n: number) => String(n).padStart(2, '0');

// Thumbs are saved at 900px on the long edge, full images at up to 2000px
const THUMB_EDGE = 900;
const thumbWidth = ({ width, height }: Photo) => {
  const longEdge = Math.max(width, height);
  return longEdge <= THUMB_EDGE ? width : Math.round((width * THUMB_EDGE) / longEdge);
};

const GRID_SIZES = '(max-width: 640px) 50vw, (max-width: 1100px) 45vw, 30vw';

export const Gallery: FC<GalleryProps> = ({ photos, label = 'Photo' }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  const openLightbox = (index: number, trigger: HTMLElement) => {
    lastTrigger.current = trigger;
    setSelectedIndex(index);
  };

  const closeLightbox = useCallback(() => {
    setSelectedIndex(null);
    lastTrigger.current?.focus();
  }, []);

  const step = useCallback(
    (delta: number) =>
      setSelectedIndex((current) =>
        current === null ? current : (current + delta + photos.length) % photos.length
      ),
    [photos.length]
  );

  const isOpen = selectedIndex !== null;

  // Lock scroll, focus the dialog and listen for keys while the lightbox is open
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeLightbox, step]);

  // Switching tabs swaps the list underneath an open lightbox
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= photos.length) setSelectedIndex(null);
  }, [photos.length, selectedIndex]);

  const current: Photo | undefined = selectedIndex !== null ? photos[selectedIndex] : undefined;

  return (
    <>
      <ol className={styles.masonry}>
        {photos.map((photo, index) => {
          const isVideo = photo.kind === 'video';
          return (
            <li key={photo.id} className={styles.item}>
              <figure className={styles.figure}>
                <button
                  type="button"
                  className={styles.frame}
                  onClick={(e) => openLightbox(index, e.currentTarget)}
                  aria-label={`${isVideo ? 'Play clip' : 'Open photo'} ${index + 1}: ${photo.alt}`}
                >
                  <picture>
                    {/* Browsers with WebP get the lighter thumb; the rest keep the JPEG set */}
                    <source type="image/webp" srcSet={webp(photo.thumb)} />
                    <img
                      src={photo.thumb}
                      srcSet={
                        isVideo
                          ? undefined
                          : `${photo.thumb} ${thumbWidth(photo)}w, ${photo.src} ${photo.width}w`
                      }
                      sizes={isVideo ? undefined : GRID_SIZES}
                      width={photo.width}
                      height={photo.height}
                      alt=""
                      loading={index < 3 ? 'eager' : 'lazy'}
                      fetchPriority={index < 2 ? 'high' : undefined}
                      decoding="async"
                    />
                  </picture>
                  {isVideo && (
                    <span className={styles.badge} aria-hidden="true">
                      {Icons.play}
                      Clip
                    </span>
                  )}
                  <span className={styles.corners} aria-hidden="true" />
                </button>
                <figcaption className={styles.caption}>
                  <span className={styles.frameNo}>{pad(index + 1)}</span>
                  <span className={styles.captionText}>{photo.caption ?? photo.alt}</span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>

      {current &&
        selectedIndex !== null &&
        // Portal to body so the sticky header's stacking context cannot sit above the viewer
        createPortal(
          <div
            ref={dialogRef}
            className={styles.lightbox}
            onClick={closeLightbox}
            role="dialog"
            aria-modal="true"
            aria-label={`${label} ${selectedIndex + 1} of ${photos.length}`}
            tabIndex={-1}
          >
            <figure className={styles.lightboxFigure} onClick={(e) => e.stopPropagation()}>
              {current.kind === 'video' ? (
                <video
                  key={current.src}
                  src={current.src}
                  poster={current.poster}
                  width={current.width}
                  height={current.height}
                  className={styles.lightboxImage}
                  aria-label={current.alt}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  key={current.src}
                  src={current.src}
                  width={current.width}
                  height={current.height}
                  alt={current.alt}
                  className={styles.lightboxImage}
                />
              )}
              <figcaption className={styles.lightboxCaption}>
                <span className={styles.frameNo}>
                  {pad(selectedIndex + 1)} / {pad(photos.length)}
                </span>
                <span className={styles.captionText}>{current.caption ?? current.alt}</span>
                {current.kind !== 'video' && (
                  <a
                    href={current.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fullSize}
                  >
                    Full size
                  </a>
                )}
              </figcaption>
            </figure>

            <button
              type="button"
              className={styles.close}
              onClick={closeLightbox}
              aria-label="Close viewer"
            >
              {Icons.close}
            </button>
            <button
              type="button"
              className={`${styles.nav} ${styles.prev}`}
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous"
            >
              {Icons.prev}
            </button>
            <button
              type="button"
              className={`${styles.nav} ${styles.next}`}
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next"
            >
              {Icons.next}
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
