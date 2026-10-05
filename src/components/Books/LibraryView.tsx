import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { sound } from '../arcade/audio/audioSynth';
import { HeadphonesIcon } from '../arcade/icons/ArcadeIcons';
import { ShelfBookItem, ShelfCategory, spineStyle } from './BooksShelfView';
import shelf from './BooksShelfView.module.css';
import { LibraryReader } from './LibraryReader';
import { ReadingNook } from './ReadingNook';
import styles from './LibraryView.module.css';
import { prefersReducedMotion, useMediaQuery } from './useMediaQuery';

interface LibraryViewProps {
  /** Every category, unfiltered: the room always shows the whole collection. */
  categories: ShelfCategory[];
  /** Whether a book matches the page search and filters. */
  isMatch: (book: ShelfBookItem) => boolean;
  isFiltering: boolean;
}

interface PlacedBook {
  book: ShelfBookItem;
  key: string;
  catIdx: number;
  bookIdx: number;
}

interface Bay {
  catIdx: number;
  rows: PlacedBook[][];
}

interface OpenBook {
  book: ShelfBookItem;
  key: string;
  categoryName: string;
  leather: string;
  from: { x: number; y: number };
}

const PER_ROW = 7;
const ROWS_PER_BAY = 3;
/** Phones: books per shelf, and how many shelves show before a long case folds away. */
const PER_ROW_MOBILE = 7;
const MOBILE_SHELVES = 3;
const PULL_MS = 460;
const CLOSE_MS = 380;

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export const LibraryView: FC<LibraryViewProps> = ({ categories, isMatch, isFiltering }) => {
  const idPrefix = useId();
  const mobile = useMediaQuery('(max-width: 720px)');

  const roomRef = useRef<HTMLElement>(null);
  const roomTitleRef = useRef<HTMLHeadingElement>(null);
  const caseRefs = useRef<(HTMLDivElement | null)[]>([]);
  const spineRefs = useRef(new Map<string, HTMLButtonElement>());
  const timers = useRef<number[]>([]);

  const [zoomed, setZoomed] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [pulledKey, setPulledKey] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<OpenBook | null>(null);
  const [closing, setClosing] = useState(false);

  // Each category is a bookcase: bays of three shelves standing side by side on wide
  // screens (wrapping onto a new line when the room runs out), and a single column of
  // shelves on phones. Everything flows with the page, so the page scroll does all the work.
  const { cases, bays, spineOrder } = useMemo(() => {
    const allBays: Bay[] = [];
    const order: string[] = [];
    const caseList = categories.map((cat, catIdx) => {
      const placed: PlacedBook[] = cat.bookList.map((book, bookIdx) => {
        const key = `${catIdx}-${bookIdx}`;
        return { book, key, catIdx, bookIdx };
      });
      const perBay = mobile ? Infinity : PER_ROW * ROWS_PER_BAY;
      const bayChunks = mobile ? [placed] : chunk(placed, perBay);
      if (bayChunks.length === 0) bayChunks.push([]);
      let shelfCount = 0;
      const bayIndexes = bayChunks.map((books) => {
        const rows = chunk(books, mobile ? PER_ROW_MOBILE : PER_ROW);
        // Big cases keep full three shelf bays; small ones get just enough shelves (two at least).
        const minRows = mobile ? 1 : bayChunks.length > 1 ? ROWS_PER_BAY : 2;
        while (rows.length < minRows) rows.push([]);
        shelfCount += rows.length;
        allBays.push({ catIdx, rows });
        return allBays.length - 1;
      });
      const matchCount = cat.bookList.filter(isMatch).length;
      const collapsible = mobile && shelfCount > MOBILE_SHELVES;
      return { cat, catIdx, bayIndexes, matchCount, collapsible };
    });
    // Arrow keys walk the spines in reading order, skipping any tucked away shelves.
    caseList.forEach(({ catIdx, bayIndexes, collapsible }) => {
      const open = !collapsible || isFiltering || expanded.has(catIdx);
      bayIndexes.forEach((b) =>
        allBays[b].rows.forEach((row, r) => {
          if (open || r < MOBILE_SHELVES) row.forEach((p) => order.push(p.key));
        })
      );
    });
    return { cases: caseList, bays: allBays, spineOrder: order };
  }, [categories, isMatch, isFiltering, mobile, expanded]);

  const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

  // ---- Keyboard ------------------------------------------------------------
  const onRoomKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const spineKey = (e.target as HTMLElement).dataset?.spine;
    if (!spineKey) return;
    const i = spineOrder.indexOf(spineKey);
    let next = -1;
    if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'ArrowLeft') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = spineOrder.length - 1;
    if (next < 0 || next >= spineOrder.length) return;
    e.preventDefault();
    spineRefs.current.get(spineOrder[next])?.focus();
  };

  // ---- Opening a book ------------------------------------------------------
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const takeDown = (placed: PlacedBook, leather: string, button: HTMLButtonElement) => {
    if (pulledKey || openBook) return;
    sound.playPowerUp();
    const r = button.getBoundingClientRect();
    const from = {
      x: r.left + r.width / 2 - window.innerWidth / 2,
      y: r.top + r.height / 2 - window.innerHeight / 2,
    };
    setPulledKey(placed.key);
    later(
      () =>
        setOpenBook({
          book: placed.book,
          key: placed.key,
          categoryName: categories[placed.catIdx].categoryName,
          leather,
          from,
        }),
      prefersReducedMotion() ? 0 : PULL_MS
    );
  };

  const closeBook = useCallback(() => {
    if (!openBook || closing) return;
    sound.playBeep();
    setClosing(true);
    const key = openBook.key;
    later(
      () => {
        setOpenBook(null);
        setClosing(false);
        setPulledKey(null);
        spineRefs.current.get(key)?.focus();
      },
      prefersReducedMotion() ? 0 : CLOSE_MS
    );
  }, [openBook, closing]);

  // ---- Render --------------------------------------------------------------
  const instructionsId = `${idPrefix}-instructions`;

  // Glide the page down to a bookcase and hand keyboard focus to its first book.
  const jumpToCase = (catIdx: number) => {
    sound.playBeep();
    caseRefs.current[catIdx]?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    const first = categories[catIdx]?.bookList.length ? `${catIdx}-0` : null;
    if (first) spineRefs.current.get(first)?.focus({ preventScroll: true });
  };

  const browseShelves = () => {
    roomRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    roomTitleRef.current?.focus({ preventScroll: true });
  };

  const toggleCase = (catIdx: number) => {
    sound.playBeep();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catIdx)) next.delete(catIdx);
      else next.add(catIdx);
      return next;
    });
  };

  const renderSpine = (placed: PlacedBook) => {
    const { book, key, catIdx, bookIdx } = placed;
    const hasRereads = !!book.readNo && book.readNo > 1;
    const { leans, style } = spineStyle(book, catIdx, bookIdx);
    const leather = (style as Record<string, string>)['--spine'];
    const matched = isMatch(book);
    const slotClass = [
      shelf.spineSlot,
      styles.slot,
      leans && !mobile ? shelf.leaning : '',
      pulledKey === key ? styles.pulled : '',
      isFiltering && !matched ? styles.dimmed : '',
      isFiltering && matched ? styles.matched : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <li key={key} className={slotClass} style={style}>
        <button
          type="button"
          ref={(el) => {
            if (el) spineRefs.current.set(key, el);
            else spineRefs.current.delete(key);
          }}
          data-spine={key}
          className={`${shelf.spine} ${styles.spine}`}
          aria-label={`${book.name} by ${book.author}`}
          onClick={(e) => takeDown(placed, leather, e.currentTarget)}
        >
          <span className={shelf.spineBand} aria-hidden="true" />
          <span className={shelf.spineLabel} aria-hidden="true">
            <span className={shelf.spineTitle}>{book.name}</span>
            <span className={shelf.spineAuthor}>{book.author}</span>
          </span>
          <span className={shelf.spineEmblem} aria-hidden="true">
            {book.audioBook ? (
              <HeadphonesIcon size={11} />
            ) : hasRereads ? (
              <span className={shelf.rereadMark}>{book.readNo}x</span>
            ) : (
              <span className={shelf.foilDiamond} />
            )}
          </span>
          <span className={shelf.spineBand} aria-hidden="true" />
          {hasRereads ? <span className={shelf.ribbon} aria-hidden="true" /> : null}
        </button>
      </li>
    );
  };

  const renderDecor = (bayIdx: number, rowIdx: number, empty: boolean) => {
    const pick = (bayIdx * 2 + rowIdx) % 3;
    return (
      <li className={`${styles.decor} ${empty ? styles.decorEmpty : ''}`} aria-hidden="true">
        {pick === 0 || empty ? (
          <span className={styles.lyingStack}>
            <span />
            <span />
            <span />
          </span>
        ) : null}
        {pick === 1 ? <span className={styles.hourglass} /> : null}
        {pick === 2 || (empty && pick !== 1) ? <span className={styles.candle} /> : null}
      </li>
    );
  };

  return (
    <div className={`${styles.library} ${zoomed ? styles.zoomed : ''}`}>
      <ReadingNook compact={mobile} onBrowse={browseShelves} />

      <section
        ref={roomRef}
        className={styles.roomSection}
        aria-labelledby={`${idPrefix}-room-title`}
        aria-describedby={instructionsId}
      >
        <div className={styles.libraryHead}>
          <div>
            <h2
              id={`${idPrefix}-room-title`}
              ref={roomTitleRef}
              tabIndex={-1}
              className={styles.libraryTitle}
            >
              The reading room
            </h2>
            <p id={instructionsId} className={styles.libraryHint}>
              {mobile
                ? 'Tap a spine to take the book down and read it at the table.'
                : 'Pick a bookcase to jump to it, or just keep scrolling. Select a spine to take the book down and read it at the table. On a book, the arrow keys move along the shelf.'}
            </p>
          </div>

          <div className={styles.roomControls}>
            <nav className={styles.caseIndex} aria-label="Bookcases">
              {cases.map(({ cat, catIdx, matchCount }) => (
                <button
                  key={cat.categoryName}
                  type="button"
                  className={styles.caseIndexBtn}
                  onClick={() => jumpToCase(catIdx)}
                >
                  {cat.categoryName}
                  <span className={styles.caseIndexCount}>
                    {isFiltering ? `${matchCount}/${cat.bookList.length}` : cat.bookList.length}
                  </span>
                </button>
              ))}
            </nav>
            {!mobile ? (
              <button
                type="button"
                className={styles.zoomBtn}
                aria-pressed={zoomed}
                onClick={() => {
                  sound.playBeep();
                  setZoomed((z) => !z);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="20" y1="20" x2="16.2" y2="16.2" />
                  {zoomed ? null : <line x1="11" y1="8" x2="11" y2="14" />}
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                {zoomed ? 'Step back' : 'Look closer'}
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.room} onKeyDown={onRoomKeyDown}>
          <div className={styles.track}>
            {cases.map(({ cat, catIdx, bayIndexes, matchCount, collapsible }) => {
              const headingId = `${idPrefix}-case-${catIdx}`;
              const shelvesId = `${idPrefix}-shelves-${catIdx}`;
              const noMatches = isFiltering && matchCount === 0;
              const open = !collapsible || isFiltering || expanded.has(catIdx);
              return (
                <div key={cat.categoryName} className={styles.caseGroup}>
                  <div className={styles.pilaster} aria-hidden="true">
                    <span className={styles.sconce} />
                  </div>
                  <div
                    ref={(el) => {
                      caseRefs.current[catIdx] = el;
                    }}
                    className={`${styles.bookcase} ${noMatches ? styles.caseDimmed : ''}`}
                    role="group"
                    aria-labelledby={headingId}
                  >
                    <div className={styles.crown}>
                      <span className={styles.pictureLight} aria-hidden="true" />
                      <h3 id={headingId} className={styles.plate}>
                        {cat.categoryName}
                      </h3>
                      <span className={styles.plateCount}>
                        {isFiltering
                          ? `${matchCount} of ${cat.bookList.length} match`
                          : `${cat.bookList.length} ${cat.bookList.length === 1 ? 'volume' : 'volumes'}`}
                      </span>
                    </div>
                    <div id={shelvesId} className={styles.bays}>
                      {bayIndexes.map((bayIdx) => (
                        <div key={bayIdx} className={styles.bay}>
                          {bays[bayIdx].rows.map((row, rowIdx) =>
                            open || rowIdx < MOBILE_SHELVES ? (
                              <div key={rowIdx} className={styles.shelfRow}>
                                <ul className={styles.rowList}>
                                  {row.map(renderSpine)}
                                  {!mobile && row.length < 5
                                    ? renderDecor(bayIdx, rowIdx, row.length === 0)
                                    : null}
                                </ul>
                                <div className={`${shelf.plank} ${styles.plank}`} aria-hidden="true" />
                              </div>
                            ) : null
                          )}
                        </div>
                      ))}
                    </div>
                    {collapsible && !isFiltering ? (
                      <button
                        type="button"
                        className={styles.moreBtn}
                        aria-expanded={open}
                        aria-controls={shelvesId}
                        onClick={() => toggleCase(catIdx)}
                      >
                        {open ? 'Fewer shelves' : `Show all ${cat.bookList.length}`}
                      </button>
                    ) : null}
                    <div className={styles.plinth} aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.floor} aria-hidden="true">
            <span className={styles.rug} />
            <span className={`${styles.rug} ${styles.rugWide}`} />
          </div>
        </div>
      </section>

      {openBook
        ? createPortal(
            <LibraryReader
              book={openBook.book}
              categoryName={openBook.categoryName}
              leather={openBook.leather}
              from={openBook.from}
              closing={closing}
              single={mobile}
              reducedMotion={prefersReducedMotion()}
              onClose={closeBook}
            />,
            document.body
          )
        : null}
    </div>
  );
};

export default LibraryView;
