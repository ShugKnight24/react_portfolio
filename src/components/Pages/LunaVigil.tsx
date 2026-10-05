import { CSSProperties, FC } from 'react';
import styles from './LunaVigil.module.css';

export interface VigilPhoto {
  src: string;
  alt: string;
  caption?: string;
}

interface LunaVigilProps {
  photos: VigilPhoto[];
  /** Short line under the name */
  remembrance?: string;
}

type Span = [cols: number, rows: number];

// Hand-tiled collages on a 6 column grid, so every count from 4 to 8 fills without holes
const LAYOUTS: Record<number, Span[]> = {
  4: [
    [3, 4],
    [3, 2],
    [2, 2],
    [1, 2],
  ],
  5: [
    [3, 4],
    [2, 2],
    [1, 2],
    [3, 2],
    [6, 3],
  ],
  6: [
    [3, 4],
    [2, 2],
    [1, 2],
    [3, 2],
    [2, 3],
    [4, 3],
  ],
  7: [
    [3, 4],
    [2, 2],
    [1, 2],
    [3, 2],
    [2, 3],
    [4, 3],
    [6, 3],
  ],
  8: [
    [3, 4],
    [2, 2],
    [1, 2],
    [3, 2],
    [2, 3],
    [4, 3],
    [3, 2],
    [3, 2],
  ],
};

const spanFor = (index: number, count: number): Span => LAYOUTS[count]?.[index] ?? [2, 2];

// On phones: two columns, the first photo large, and a lone last photo stretches across
const mobileSpanFor = (index: number, count: number): Span => {
  if (index === 0) return [2, 2];
  const isLoneLast = index === count - 1 && (count - 1) % 2 === 1;
  return isLoneLast ? [2, 1] : [1, 1];
};

export const LunaVigil: FC<LunaVigilProps> = ({
  photos,
  remembrance = 'My hiking buddy, my shadow around the house and the best reset after a long day of code. I miss her every day.',
}) => {
  const shown = photos.slice(0, 8);

  return (
    <section className={styles.vigil} aria-labelledby="luna-vigil-title">
      <div className={styles.head}>
        <span className={styles.candle} aria-hidden="true">
          <span className={styles.glow} />
          <span className={styles.flame} />
          <span className={styles.wick} />
          <span className={styles.wax} />
        </span>
        <div>
          <p className={styles.kicker}>In memory</p>
          <h2 id="luna-vigil-title" className={styles.name}>
            Luna
          </h2>
          <p className={styles.line}>{remembrance}</p>
        </div>
      </div>

      <ul className={styles.collage}>
        {shown.map((photo, i) => {
          const [c, r] = spanFor(i, shown.length);
          const [mc, mr] = mobileSpanFor(i, shown.length);
          return (
            <li
              key={photo.src}
              className={styles.frame}
              style={{ '--c': c, '--r': r, '--mc': mc, '--mr': mr } as CSSProperties}
            >
              <figure>
                <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
                {photo.caption && <figcaption>{photo.caption}</figcaption>}
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
