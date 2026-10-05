import { FC, useRef } from 'react';
import { BookBarInterface } from '../../types/books';
import { sound } from '../arcade/audio/audioSynth';
import { HeadphonesIcon } from '../arcade/icons/ArcadeIcons';
import styles from './BookCatalogView.module.css';

export const BookBar: FC<BookBarInterface> = ({
  allCategories,
  currentCategory,
  currentlySelectedBook,
  updateBookState,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const currentlySelectedCategory = allCategories[currentCategory];
  if (!currentlySelectedCategory) return null;

  const currentCatName = currentlySelectedCategory.categoryName;
  const bookList = currentlySelectedCategory.bookList;

  const handleScroll = (direction: 'left' | 'right') => {
    sound.playBeep(480, 0.03);
    if (trackRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      trackRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.bookRibbonContainer}>
      <div className={styles.ribbonHeader}>
        <h2 className={styles.ribbonCategoryTitle}>{currentCatName}</h2>
        <span className={styles.ribbonCount}>
          {bookList.length} {bookList.length === 1 ? 'volume' : 'volumes'}
        </span>
        <div className={styles.ribbonControls}>
          <button
            type="button"
            className={styles.scrollArrowBtn}
            onClick={() => handleScroll('left')}
            aria-label="Scroll books left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.scrollArrowBtn}
            onClick={() => handleScroll('right')}
            aria-label="Scroll books right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.bookRibbonTrack} ref={trackRef} onClick={updateBookState}>
        {bookList.map((bookInCat, index) => {
          const isSelected = index === currentlySelectedBook;
          const altText = `${bookInCat.name} by ${bookInCat.author}`;

          return (
            <div
              key={index}
              data-book-index={index}
              className={`${styles.bookRibbonCard} ${isSelected ? styles.selected : ''}`}
            >
              <div className={styles.bookThumbWrapper} data-book-index={index}>
                <img
                  className={`book-bar-book-image ${styles.bookThumbImg}`}
                  src={bookInCat.imgSrc}
                  alt={altText}
                  data-book-index={index}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                />
                {bookInCat.readNo && bookInCat.readNo > 1 ? (
                  <span className={styles.bookThumbBadge}>{bookInCat.readNo}x</span>
                ) : null}
                {bookInCat.audioBook && (
                  <span className={styles.bookThumbAudio} title="Audiobook available">
                    <HeadphonesIcon size={11} />
                  </span>
                )}
              </div>
              <span className={styles.bookThumbTitle} title={bookInCat.name}>
                {bookInCat.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
