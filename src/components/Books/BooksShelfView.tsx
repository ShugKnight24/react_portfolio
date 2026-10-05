import { CSSProperties, FC, MouseEvent, useEffect, useId, useRef, useState } from 'react';
import { sound } from '../arcade/audio/audioSynth';
import { HeadphonesIcon, StoryIcon } from '../arcade/icons/ArcadeIcons';
import styles from './BooksShelfView.module.css';

export interface ShelfBookItem {
  name: string;
  author: string;
  imgSrc?: string;
  readNo?: number;
  audioBook?: boolean;
  listenNo?: number;
  rating?: number;
  synopsis?: string;
  quotes?: string[];
  takeaway?: string;
}

export interface ShelfCategory {
  categoryName: string;
  index: number;
  bookList: ShelfBookItem[];
}

interface BooksShelfViewProps {
  categories: ShelfCategory[];
  activeCategoryIndex?: number | null;
  onSelectCategory?: (index: number | null) => void;
}

// Deep leather bindings harmonized with the codex palette; titles are always gold foil.
const SPINE_LEATHERS = [
  '#5a1a17', // oxblood
  '#1f3a2a', // forest
  '#1b2640', // navy
  '#4a2f1c', // umber
  '#3a1d30', // aubergine
  '#23393a', // verdigris
  '#6a2a1a', // rust calf
];

const hashString = (value: string) => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const spineStyle = (book: ShelfBookItem, catIdx: number, bookIdx: number) => {
  const seed = hashString(`${book.name}|${book.author}`);
  const height = 210 + ((book.name.length * 7) % 36);
  const width = 38 + ((book.author?.length || 10) % 18);
  const leather = SPINE_LEATHERS[(catIdx * 7 + bookIdx + seed) % SPINE_LEATHERS.length];
  // A few volumes lean on their neighbour; never the first on a shelf.
  const leans = bookIdx > 0 && seed % 7 === 0;
  return {
    leans,
    style: {
      '--spine-w': `${width}px`,
      '--spine-h': `${height}px`,
      '--spine': leather,
    } as CSSProperties,
  };
};

// Curated philosophical profiles & quotes for prominent volumes
export interface BookInsights {
  philosophy: string;
  axiom: string;
  takeaways: string[];
  quote: string;
}

// Hand-written notes for specific volumes; null when a volume has none.
export const getCuratedBookInsights = (name: string): BookInsights | null => {
  const n = name.toLowerCase();

  if (n.includes('meditations')) {
    return {
      philosophy:
        "A private journal Marcus Aurelius kept while running an empire from a tent. Mostly him reminding himself he can't control what happens, only how he responds. Still a work in progress for the rest of us.",
      axiom: 'The impediment to action advances action. What stands in the way becomes the way.',
      takeaways: [
        'Strip external events of their subjective narratives to see them objectively.',
        'Accept mortality daily (Memento Mori) to prioritize what genuinely matters.',
        'Discipline of desire: want only what is within your sphere of control.',
      ],
      quote:
        '"You have power over your mind - not outside events. Realize this, and you will find strength."',
    };
  }

  if (n.includes('war of art')) {
    return {
      philosophy:
        'Pressfield on Resistance, the thing that makes you reorganize your desk instead of doing the work. His fix is unglamorous: show up every day, whether you feel like it or not.',
      axiom: 'The professional loves her work. She is invested in it. But she does not forget that the work is not her.',
      takeaways: [
        'Resistance increases in proportion to the importance of the work.',
        'The amateur works when inspired; the pro clocks in on schedule and stays till the whistle.',
        'Mastery is unsexy, repetitive, and requires absolute focus.',
      ],
      quote:
        '"The most important thing about art is to work. Nothing else matters except sitting down every day and trying."',
    };
  }

  if (n.includes('daily stoic')) {
    return {
      philosophy:
        'One short Stoic reading a day from Epictetus, Seneca and Marcus Aurelius. Small enough to actually keep up with, which is more than I can say for most of my habits.',
      axiom: 'Control your perceptions, direct your actions properly, willingly accept what is outside your control.',
      takeaways: [
        'Pause before reacting, even when production is on fire.',
        'Amor Fati: Do not merely bear necessity, but love it.',
        'Ego is the enemy in both success and adversity.',
      ],
      quote:
        '"First say to yourself what you would be; and then do what you have to do."',
    };
  }

  if (n.includes('alchemist')) {
    return {
      philosophy:
        'A short fable about a shepherd chasing a dream across the desert. The point is that the trip is what changes you. Reads in an afternoon, sticks around for years.',
      axiom: 'When we strive to become better than we are, everything around us becomes better too.',
      takeaways: [
        'Pay acute attention to omens and compounding feedback loops.',
        'Fear of suffering is worse than the suffering itself.',
        'The trip itself is usually where the good stuff is.',
      ],
      quote:
        '"It\'s the possibility of having a dream come true that makes life interesting."',
    };
  }

  if (n.includes('as a man thinketh')) {
    return {
      philosophy:
        'A tiny book with one big idea: your habits of thought shape your character and, eventually, your circumstances. Takes about an hour to read and a lot longer to practice.',
      axiom: 'Mind is the Master power that molds and makes, and Man is Mind.',
      takeaways: [
        'Guard the gate of your mind against cynical decay and aimless distraction.',
        'Serenity is the crown jewel of wisdom and self-mastery.',
        'Circumstances do not make the man; they reveal him to himself.',
      ],
      quote:
        '"They themselves are makers of themselves by virtue of the thoughts which they choose and encourage."',
    };
  }

  if (n.includes('can\'t hurt me')) {
    return {
      philosophy:
        "Goggins on getting through things most people would quit. His claim is that when your mind says you're done, you're at about 40%. Mostly I use it to finish the last set.",
      axiom: 'You are in danger of living a life so soft and comfortable that you will die without realizing your potential.',
      takeaways: [
        'The Accountability Mirror: Radical honesty with yourself every morning.',
        'Callus your mind through deliberate physical and mental friction.',
        'Take souls: Out-work, out-prepare, and dominate through relentless stamina.',
      ],
      quote:
        '"Do not stop when you are tired. Stop when you are done."',
    };
  }

  if (n.includes('deep work')) {
    return {
      philosophy:
        "Newport's case that focused, uninterrupted work is getting rare, which makes it worth more. Convincing enough to make me feel bad about my notifications.",
      axiom: 'Clarity about what matters provides clarity about what does not.',
      takeaways: [
        'Ritualize deep work blocks with zero network notifications.',
        'Embrace boredom; training focus requires withdrawing from constant dopamine hits.',
        'Drain the shallows: ruthlessly minimize non-essential logistical overhead.',
      ],
      quote:
        '"If you don\'t produce, you won\'t thrive - no matter how skilled or talented you are."',
    };
  }

  return null;
};

export const getBookInsights = (name: string, author: string, category: string): BookInsights => {
  const curated = getCuratedBookInsights(name);
  if (curated) return curated;

  // Procedural fallback tailored to author and category
  return {
    philosophy: `A ${category.toLowerCase()} pick by ${author}. I haven't written proper notes for this one yet, so for now it's on the shelf because it earned the spot.`,
    axiom: 'Notes pending. The book says it better than I would anyway.',
    takeaways: [
      'Notes still live in my head, not on the page.',
      'Ask me about it and I will probably talk too long.',
      'If it is on this shelf, it was worth the time.',
    ],
    quote: 'No favorite passage saved for this one yet.',
  };
};

export const BooksShelfView: FC<BooksShelfViewProps> = ({
  categories,
  activeCategoryIndex,
  onSelectCategory,
}) => {
  const shelfIdPrefix = useId();
  const [internalCategory, setInternalCategory] = useState<number | null>(
    typeof activeCategoryIndex === 'number' ? activeCategoryIndex : null
  );

  const [selectedBook, setSelectedBook] = useState<{
    book: ShelfBookItem;
    categoryName: string;
  } | null>(null);

  const [modalClosing, setModalClosing] = useState(false);
  const [activePage, setActivePage] = useState<1 | 2>(1);

  const shelfRefs = useRef<Record<string, HTMLUListElement | null>>({});
  const lastSpineRef = useRef<HTMLButtonElement | null>(null);

  const effectiveCategory =
    typeof activeCategoryIndex !== 'undefined' ? activeCategoryIndex : internalCategory;

  const totalBooksCount = categories.reduce((sum, cat) => sum + cat.bookList.length, 0);

  // Determine which categories to render
  const displayedCategories =
    effectiveCategory !== null && effectiveCategory >= 0 && effectiveCategory < categories.length
      ? [categories[effectiveCategory]]
      : categories;

  const handleCategoryClick = (index: number | null) => {
    sound.playBeep();
    setInternalCategory(index);
    onSelectCategory?.(index);
  };

  const handleInspectBook = (
    book: ShelfBookItem,
    categoryName: string,
    e?: MouseEvent<HTMLButtonElement>
  ) => {
    if (e) lastSpineRef.current = e.currentTarget;
    sound.playPowerUp();
    setSelectedBook({ book, categoryName });
    setActivePage(1);
    setModalClosing(false);
  };

  const handleCloseModal = () => {
    sound.playBeep();
    setModalClosing(true);
    setTimeout(() => {
      setSelectedBook(null);
      setModalClosing(false);
      lastSpineRef.current?.focus({ preventScroll: false });
    }, 380);
  };

  useEffect(() => {
    if (!selectedBook) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBook]);

  const handlePageTurn = (page: 1 | 2) => {
    sound.playCoin();
    setActivePage(page);
  };

  const handleScrollShelf = (key: string, direction: -1 | 1) => {
    const el = shelfRefs.current[key];
    if (!el) return;
    sound.playJump();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };


  return (
    <div className={styles.booksShelfView}>
      <div className={styles.libraryHead}>
        <h2 className={styles.libraryTitle}>The shelf, but digital</h2>
        <p className={styles.librarySub}>Pick a book to see what I got out of it, give or take.</p>
      </div>

      <nav className={styles.shelfIndex} aria-label="Shelves">
        <button
          type="button"
          className={styles.indexBtn}
          aria-pressed={effectiveCategory === null}
          onClick={() => handleCategoryClick(null)}
        >
          <span>All shelves</span>
          <span className={styles.indexCount}>{totalBooksCount}</span>
        </button>
        {categories.map((cat, idx) => (
          <button
            key={cat.categoryName}
            type="button"
            className={styles.indexBtn}
            aria-pressed={effectiveCategory === idx}
            onClick={() => handleCategoryClick(idx)}
          >
            <span>{cat.categoryName}</span>
            <span className={styles.indexCount}>{cat.bookList.length}</span>
          </button>
        ))}
      </nav>

      <div className={styles.bookcase}>
        {displayedCategories.map((cat, catIdx) => {
          const headingId = `${shelfIdPrefix}-${catIdx}`;
          return (
            <section key={cat.categoryName} className={styles.shelf} aria-labelledby={headingId}>
              <header className={styles.shelfHead}>
                <h3 id={headingId} className={styles.shelfTitle}>
                  {cat.categoryName}
                </h3>
                <span className={styles.shelfCount}>
                  {cat.bookList.length} {cat.bookList.length === 1 ? 'volume' : 'volumes'}
                </span>
              </header>

              <div className={styles.shelfBay}>
                {cat.bookList.length === 0 ? (
                  <p className={styles.shelfEmpty}>Nothing on this shelf matches. Try another search.</p>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.shelfScrollBtn} ${styles.scrollLeft}`}
                      onClick={() => handleScrollShelf(cat.categoryName, -1)}
                      aria-label={`Scroll ${cat.categoryName} shelf left`}
                      tabIndex={-1}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>

                    <ul
                      ref={(el) => {
                        shelfRefs.current[cat.categoryName] = el;
                      }}
                      className={styles.spineRow}
                    >
                      <li className={`${styles.bookend} ${styles.bookendLeft}`} aria-hidden="true" />
                      {cat.bookList.map((book, bookIdx) => {
                        const hasRereads = !!book.readNo && book.readNo > 1;
                        const { leans, style } = spineStyle(book, catIdx, bookIdx);
                        return (
                          <li
                            key={`${book.name}-${bookIdx}`}
                            className={`${styles.spineSlot} ${leans ? styles.leaning : ''}`}
                            style={style}
                          >
                            <button
                              type="button"
                              className={styles.spine}
                              onClick={(e) => handleInspectBook(book, cat.categoryName, e)}
                              aria-label={`${book.name} by ${book.author}`}
                            >
                              <span className={styles.spineBand} aria-hidden="true" />
                              <span className={styles.spineLabel} aria-hidden="true">
                                <span className={styles.spineTitle}>{book.name}</span>
                                <span className={styles.spineAuthor}>{book.author}</span>
                              </span>
                              <span className={styles.spineEmblem} aria-hidden="true">
                                {book.audioBook ? (
                                  <HeadphonesIcon size={12} />
                                ) : hasRereads ? (
                                  <span className={styles.rereadMark}>{book.readNo}x</span>
                                ) : (
                                  <span className={styles.foilDiamond} />
                                )}
                              </span>
                              <span className={styles.spineBand} aria-hidden="true" />
                              {hasRereads ? (
                                <span className={styles.ribbon} aria-hidden="true" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                      <li className={`${styles.bookend} ${styles.bookendRight}`} aria-hidden="true" />
                    </ul>

                    <button
                      type="button"
                      className={`${styles.shelfScrollBtn} ${styles.scrollRight}`}
                      onClick={() => handleScrollShelf(cat.categoryName, 1)}
                      aria-label={`Scroll ${cat.categoryName} shelf right`}
                      tabIndex={-1}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </>
                )}
                <div className={styles.plank} aria-hidden="true" />
              </div>
            </section>
          );
        })}
      </div>

      {selectedBook && (
        <div className={styles.bookModalBackdrop} onClick={handleCloseModal}>
          <div
            className={styles.bookStage}
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedBook.book.name} by ${selectedBook.book.author}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={handleCloseModal}
              aria-label="Close volume"
              autoFocus
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className={`${styles.tome} ${modalClosing ? styles.bookClosing : styles.bookOpening}`}>
              {(() => {
                const insights = getBookInsights(
                  selectedBook.book.name,
                  selectedBook.book.author,
                  selectedBook.categoryName
                );

                return (
                  <div className={styles.tomeSpread}>
                    <div className={styles.tomePageLeft}>
                      <div className={styles.tomeCover}>
                        <span
                          className={styles.coverFallback}
                          data-title={selectedBook.book.name}
                          data-author={selectedBook.book.author}
                          aria-hidden="true"
                        >
                          <StoryIcon size={34} className={styles.fallbackIcon} />
                        </span>
                        {selectedBook.book.imgSrc ? (
                          <img
                            src={selectedBook.book.imgSrc}
                            alt={selectedBook.book.name}
                            className={styles.coverImg}
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                      </div>

                      <div className={styles.colophon}>
                        {selectedBook.book.audioBook && (
                          <span className={styles.badge}>
                            <HeadphonesIcon size={12} /> Audiobook edition
                          </span>
                        )}
                        {selectedBook.book.readNo && selectedBook.book.readNo > 1 ? (
                          <span className={styles.badge}>Read {selectedBook.book.readNo} times</span>
                        ) : null}
                        {selectedBook.book.listenNo ? (
                          <span className={styles.badge}>Listened {selectedBook.book.listenNo}x</span>
                        ) : null}
                        <span className={styles.categoryStamp}>{selectedBook.categoryName}</span>
                      </div>
                    </div>

                    <div className={styles.tomePageRight}>
                      <div>
                        <div className={styles.parchmentHeader}>
                          <p className={styles.parchmentCategory}>{selectedBook.categoryName}</p>
                          <h2 className={styles.parchmentTitle}>{selectedBook.book.name}</h2>
                          <p className={styles.parchmentAuthor}>by {selectedBook.book.author}</p>
                        </div>

                        <div key={activePage} className={styles.parchmentPageBody}>
                          {activePage === 1 ? (
                            <>
                              <div className={styles.readingSection}>
                                <h4 className={styles.sectionLabel}>What it&rsquo;s about</h4>
                                <p className={styles.sectionProse}>{insights.philosophy}</p>
                              </div>
                              <blockquote className={styles.callout}>
                                <span className={styles.calloutTag}>Axiom</span>
                                <p className={styles.calloutQuote}>{insights.axiom}</p>
                              </blockquote>
                            </>
                          ) : (
                            <>
                              <div className={styles.readingSection}>
                                <h4 className={styles.sectionLabel}>Key takeaways</h4>
                                <ul className={styles.takeawayPoints}>
                                  {insights.takeaways.map((point, i) => (
                                    <li key={i}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                              <blockquote className={styles.callout}>
                                <span className={styles.calloutTag}>Excerpt</span>
                                <p className={styles.calloutQuote}>{insights.quote}</p>
                              </blockquote>
                            </>
                          )}
                        </div>
                      </div>

                      <div className={styles.parchmentFooterBar}>
                        <div className={styles.pageTurnerGroup}>
                          <button
                            type="button"
                            className={styles.pageTurnBtn}
                            onClick={() => handlePageTurn(activePage === 1 ? 2 : 1)}
                          >
                            {activePage === 1 ? 'Turn page' : 'Previous page'}
                          </button>
                          <span className={styles.pageIndicator}>Page {activePage} of 2</span>
                        </div>
                        <button type="button" className={styles.shelfReturnBtn} onClick={handleCloseModal}>
                          Return to shelf
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BooksShelfView;
