import { FC } from 'react';
import { BookContentInterface } from '../../types/books';
import { HeadphonesIcon } from '../arcade/icons/ArcadeIcons';
import { getBookInsights } from './BooksShelfView';
import styles from './BookCatalogView.module.css';

export const BookContent: FC<BookContentInterface> = ({
  allCategories,
  currentCategory,
  currentlySelectedBook,
}) => {
  const currentCat = allCategories[currentCategory];
  if (!currentCat || !currentCat.bookList || !currentCat.bookList[currentlySelectedBook]) {
    return null;
  }

  const currentBook = currentCat.bookList[currentlySelectedBook];
  const altText = `${currentBook.name} by ${currentBook.author}`;
  const insights = getBookInsights(
    currentBook.name,
    currentBook.author || 'Author',
    currentCat.categoryName
  );

  return (
    <article className={styles.bookInspectorCard}>
      <div className={styles.inspectorCoverColumn}>
        <div className={styles.inspectorCover}>
          <img className={styles.hardcoverCover} src={currentBook.imgSrc} alt={altText} />
        </div>

        {(currentBook.readNo && currentBook.readNo > 1) || currentBook.audioBook ? (
          <div className={styles.statusBadgesRow}>
            {currentBook.readNo && currentBook.readNo > 1 ? (
              <span className={styles.inspectorBadge}>Read {currentBook.readNo} times</span>
            ) : null}
            {currentBook.audioBook && (
              <span className={styles.inspectorBadge}>
                <HeadphonesIcon size={11} /> Audiobook
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.inspectorDossierColumn}>
        <header className={styles.inspectorMetaHeader}>
          <p className={styles.categoryTagPlaque}>
            {currentCat.categoryName} &middot; No. {currentlySelectedBook + 1}
          </p>
          <h3 className={styles.inspectorBookTitle}>{currentBook.name}</h3>
          <p className={styles.inspectorBookAuthor}>by {currentBook.author}</p>
        </header>

        <blockquote className={styles.axiomCallout}>
          <span className={styles.axiomLabel}>Axiom</span>
          <p className={styles.axiomQuote}>&ldquo;{insights.axiom}&rdquo;</p>
        </blockquote>

        <section className={styles.overviewBlock}>
          <h4 className={styles.blockLabel}>What it&rsquo;s about</h4>
          <p className={styles.overviewText}>{insights.philosophy}</p>
        </section>

        {insights.takeaways && insights.takeaways.length > 0 && (
          <section className={styles.takeawaysSection}>
            <h4 className={styles.blockLabel}>Key takeaways</h4>
            <ul className={styles.takeawaysList}>
              {insights.takeaways.map((takeaway, idx) => (
                <li key={idx} className={styles.takeawayItem}>
                  {takeaway}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
};
