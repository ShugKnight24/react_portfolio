import {
  CSSProperties,
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sound } from '../arcade/audio/audioSynth';
import { HeadphonesIcon, StoryIcon } from '../arcade/icons/ArcadeIcons';
import { getCuratedBookInsights, ShelfBookItem } from './BooksShelfView';
import styles from './LibraryView.module.css';

type LeafKind =
  'cover' | 'endpaper' | 'title' | 'record' | 'why' | 'takeaways' | 'excerpt' | 'finis' | 'blank';

interface Leaf {
  kind: LeafKind;
  label: string;
}

export interface LibraryReaderProps {
  book: ShelfBookItem;
  categoryName: string;
  leather: string;
  /** Offset of the spine from the viewport centre, so the book can fly out of the shelf. */
  from: { x: number; y: number };
  closing: boolean;
  single: boolean;
  reducedMotion: boolean;
  onClose: () => void;
}

const TURN_MS = 700;

export const LibraryReader: FC<LibraryReaderProps> = ({
  book,
  categoryName,
  leather,
  from,
  closing,
  single,
  reducedMotion,
  onClose,
}) => {
  const titleId = useId();
  const hintId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const turnTimer = useRef<number | undefined>(undefined);

  const insights = useMemo(() => getCuratedBookInsights(book.name), [book.name]);
  const rereads = !!book.readNo && book.readNo > 1;

  const leaves = useMemo<Leaf[]>(() => {
    const list: Leaf[] = [
      { kind: 'cover', label: 'Cover' },
      { kind: 'endpaper', label: 'Ex libris' },
      { kind: 'title', label: 'Title page' },
      { kind: 'record', label: 'Reading record' },
    ];
    if (insights) {
      list.push(
        { kind: 'why', label: 'Why it matters' },
        { kind: 'takeaways', label: 'Key takeaways' },
        { kind: 'excerpt', label: 'A passage to keep' }
      );
    }
    list.push({ kind: 'finis', label: 'Finis' });
    // A spread shows leaves 2s-1 and 2s, so keep the count odd to end on a full spread.
    if (list.length % 2 === 0) list.push({ kind: 'blank', label: 'Back endpaper' });
    return list;
  }, [insights]);

  const spreadCount = Math.floor(leaves.length / 2) + 1;
  const maxPos = single ? leaves.length - 1 : spreadCount - 1;

  const [pos, setPos] = useState(0);
  const [turn, setTurn] = useState<1 | -1 | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Clamp when switching between single-page and spread layouts.
  useEffect(() => {
    setPos((p) => Math.min(p, maxPos));
  }, [maxPos]);

  const describe = useCallback(
    (p: number) => {
      const total = leaves.length - 1;
      if (single) {
        return p === 0 ? 'Cover' : `Page ${p} of ${total}: ${leaves[p].label}`;
      }
      if (p === 0) return 'Cover';
      return `Pages ${2 * p - 1} and ${2 * p} of ${total}: ${leaves[2 * p - 1].label}, ${leaves[2 * p].label}`;
    },
    [leaves, single]
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      if (turn !== null) return;
      const next = pos + dir;
      if (next < 0 || next > maxPos) return;
      sound.playCoin();
      if (reducedMotion) {
        setPos(next);
        setAnnouncement(describe(next));
        return;
      }
      setTurn(dir);
      turnTimer.current = window.setTimeout(() => {
        setPos(next);
        setTurn(null);
        setAnnouncement(describe(next));
      }, TURN_MS);
    },
    [turn, pos, maxPos, reducedMotion, describe]
  );

  useEffect(() => () => window.clearTimeout(turnTimer.current), []);

  // Focus the dialog on open; lock page scroll behind the table.
  useEffect(() => {
    dialogRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (closing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, closing]);

  // Keep Tab inside the dialog.
  const trapFocus = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
  };

  const renderLeaf = (leaf: Leaf | null | undefined): ReactNode => {
    if (!leaf) return null;
    switch (leaf.kind) {
      case 'cover':
        return (
          <div className={styles.coverFace}>
            <div className={styles.coverFrame}>
              <span className={styles.coverTitle}>{book.name}</span>
              <StoryIcon size={30} className={styles.coverIcon} />
              <span className={styles.coverAuthor}>{book.author}</span>
            </div>
            {book.imgSrc ? (
              <img
                className={styles.coverArt}
                src={book.imgSrc}
                alt=""
                draggable={false}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
          </div>
        );
      case 'endpaper':
        return (
          <div className={styles.endpaper}>
            <div className={styles.bookplate}>
              <span className={styles.bookplateKicker}>Ex libris</span>
              <span className={styles.bookplateRule} aria-hidden="true" />
              <span className={styles.bookplateShelf}>Shelved in {categoryName}</span>
            </div>
          </div>
        );
      case 'title':
        return (
          <div className={`${styles.leafBody} ${styles.titleLeaf}`}>
            <p className={styles.leafKicker}>{categoryName}</p>
            <h3 className={styles.titleLeafTitle}>{book.name}</h3>
            <span className={styles.fleuron} aria-hidden="true" />
            <p className={styles.titleLeafAuthor}>by {book.author}</p>
            <div className={styles.markerList}>
              {rereads ? <span className={styles.marker}>Reread {book.readNo} times</span> : null}
              {book.audioBook ? (
                <span className={styles.marker}>
                  <HeadphonesIcon size={12} aria-hidden="true" /> Audiobook
                </span>
              ) : null}
            </div>
          </div>
        );
      case 'record':
        return (
          <div className={styles.leafBody}>
            <h3 className={styles.leafHeading}>Reading record</h3>
            <dl className={styles.record}>
              <div>
                <dt>Shelf</dt>
                <dd>{categoryName}</dd>
              </div>
              {book.readNo ? (
                <div>
                  <dt>Times read</dt>
                  <dd>{book.readNo === 1 ? 'Once' : `${book.readNo} times`}</dd>
                </div>
              ) : null}
              {book.audioBook ? (
                <div>
                  <dt>Format</dt>
                  <dd>Audiobook</dd>
                </div>
              ) : null}
              {book.listenNo ? (
                <div>
                  <dt>Listened</dt>
                  <dd>{book.listenNo === 1 ? 'Once' : `${book.listenNo} times`}</dd>
                </div>
              ) : null}
            </dl>
            {rereads ? (
              <p className={styles.leafNote}>
                The red ribbon means I keep coming back to this one: {book.readNo} reads and
                counting.
              </p>
            ) : null}
            {!insights ? (
              <p className={styles.leafNote}>
                No notes in the margins yet. I was busy reading.
              </p>
            ) : null}
          </div>
        );
      case 'why':
        return (
          <div className={styles.leafBody}>
            <h3 className={styles.leafHeading}>Why it stuck</h3>
            <p className={styles.leafProse}>{insights?.philosophy}</p>
            <blockquote className={styles.leafCallout}>
              <p>{insights?.axiom}</p>
            </blockquote>
          </div>
        );
      case 'takeaways':
        return (
          <div className={styles.leafBody}>
            <h3 className={styles.leafHeading}>Key takeaways</h3>
            <ul className={styles.leafList}>
              {insights?.takeaways.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        );
      case 'excerpt':
        return (
          <div className={`${styles.leafBody} ${styles.excerptLeaf}`}>
            <h3 className={styles.leafHeading}>A passage to keep</h3>
            <blockquote className={styles.excerptQuote}>
              <p>{insights?.quote}</p>
            </blockquote>
          </div>
        );
      case 'finis':
        return (
          <div className={`${styles.leafBody} ${styles.finisLeaf}`}>
            <span className={styles.fleuron} aria-hidden="true" />
            <p className={styles.finisWord}>Finis</p>
            <p className={styles.leafNote}>Close the book to return it to its shelf.</p>
          </div>
        );
      default:
        return <div className={styles.endpaper} />;
    }
  };

  const pageClass = (leaf: Leaf | null | undefined, side: 'left' | 'right' | 'single') => {
    const sideClass =
      side === 'left' ? styles.pageLeft : side === 'right' ? styles.pageRight : styles.pageSingle;
    const kindClass =
      leaf?.kind === 'cover'
        ? styles.pageCover
        : leaf?.kind === 'endpaper' || leaf?.kind === 'blank'
          ? styles.pageEnd
          : '';
    return `${styles.page} ${sideClass} ${kindClass}`;
  };

  const page = (leaf: Leaf | null | undefined, side: 'left' | 'right' | 'single', num?: number) =>
    leaf ? (
      <div className={pageClass(leaf, side)}>
        {renderLeaf(leaf)}
        {num && leaf.kind !== 'cover' && leaf.kind !== 'blank' && leaf.kind !== 'endpaper' ? (
          <span className={styles.folio} aria-hidden="true">
            {num}
          </span>
        ) : null}
      </div>
    ) : (
      <div className={`${styles.page} ${styles.pageEmpty}`} />
    );

  const leftOf = (s: number) => (s <= 0 ? null : leaves[2 * s - 1]);
  const rightOf = (s: number) => leaves[2 * s] ?? { kind: 'blank' as const, label: '' };

  let content: ReactNode;
  let closedShift = false;
  if (single) {
    const target = turn === 1 ? pos + 1 : pos;
    content = (
      <>
        {page(leaves[target], 'single', target)}
        {turn !== null ? (
          <div
            className={`${styles.leaf} ${styles.leafSingle} ${turn === 1 ? styles.turnFwd : styles.turnBack}`}
            aria-hidden="true"
          >
            <div className={styles.leafFront}>
              {page(leaves[turn === 1 ? pos : pos - 1], 'single')}
            </div>
            <div className={styles.leafBack}>
              <div className={`${styles.page} ${styles.pageEnd} ${styles.pageSingle}`} />
            </div>
          </div>
        ) : null}
      </>
    );
  } else {
    const left = turn === -1 ? leftOf(pos - 1) : leftOf(pos);
    const right = turn === 1 ? rightOf(pos + 1) : rightOf(pos);
    const leftNum = turn === -1 ? 2 * (pos - 1) - 1 : 2 * pos - 1;
    const rightNum = turn === 1 ? 2 * (pos + 1) : 2 * pos;
    closedShift = (turn === null ? pos : pos + turn) === 0;
    const front = turn === 1 ? rightOf(pos) : rightOf(pos - 1);
    const back = turn === 1 ? leftOf(pos + 1) : leftOf(pos);
    content = (
      <>
        {page(left, 'left', leftNum)}
        {page(right, 'right', rightNum)}
        {turn !== null ? (
          <div
            className={`${styles.leaf} ${turn === 1 ? styles.turnFwd : styles.turnBack}`}
            aria-hidden="true"
          >
            <div className={styles.leafFront}>{page(front, 'right')}</div>
            <div className={styles.leafBack}>{page(back, 'left')}</div>
          </div>
        ) : null}
      </>
    );
  }

  const bookStyle = {
    '--from-x': `${from.x}px`,
    '--from-y': `${from.y}px`,
    '--leather': leather,
    '--turn-ms': `${TURN_MS}ms`,
  } as CSSProperties;

  return (
    <div
      className={`${styles.readerOverlay} ${closing ? styles.overlayOut : ''}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={styles.readerDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {book.name} by {book.author}
        </h2>
        <p id={hintId} className="sr-only">
          Use the Left and Right arrow keys or the page buttons to turn pages. Press Escape to
          return the book to its shelf.
        </p>

        <div className={styles.readingTable} aria-hidden="true">
          <div className={styles.tableTop} />
          <div className={styles.tableLamp}>
            <span className={styles.tableLampShade} />
            <span className={styles.tableLampStem} />
            <span className={styles.tableLampBase} />
          </div>
          <div className={styles.tableGlow} />
        </div>

        <button
          type="button"
          className={styles.readerClose}
          onClick={onClose}
          aria-label="Close book"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div
          className={`${styles.bookWrap} ${closing ? styles.bookLeaving : styles.bookEntering}`}
          style={bookStyle}
        >
          <div
            className={`${styles.openBook} ${single ? styles.openBookSingle : ''} ${
              closedShift ? styles.openBookClosed : ''
            }`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
          >
            {content}
            {rereads ? <span className={styles.bookRibbon} aria-hidden="true" /> : null}
            {book.audioBook ? (
              <span className={styles.audioTab} aria-hidden="true">
                <HeadphonesIcon size={11} />
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.readerControls}>
          <button
            type="button"
            className={styles.turnBtn}
            onClick={() => go(-1)}
            aria-disabled={pos === 0}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Previous page
          </button>
          <span className={styles.pageCount} aria-hidden="true">
            {describe(pos).split(':')[0]}
          </span>
          <button
            type="button"
            className={styles.turnBtn}
            onClick={() => go(1)}
            aria-disabled={pos === maxPos}
          >
            {pos === 0 ? 'Open the cover' : 'Next page'}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button type="button" className={styles.returnBtn} onClick={onClose}>
            Return to shelf
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>
  );
};

export default LibraryReader;
