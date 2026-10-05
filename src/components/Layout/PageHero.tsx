import { CSSProperties, FC, ReactNode } from 'react';
import styles from './PageHero.module.css';

export interface HeroStat {
  value: string | number;
  label: string;
}

interface PageHeroProps {
  id: string;
  /** Solid first line of the display title */
  title: string;
  /** Optional second line rendered as outlined type */
  outline?: string;
  /** Short facts joined into a single mono line */
  meta?: string[];
  /** One sentence, roughly 25 words max */
  lede: string;
  stats?: HeroStat[];
  /** Optional right-hand visual, e.g. a portrait */
  aside?: ReactNode;
  children?: ReactNode;
}

// Splits a word into letters that rise in one after another, like the landing hero
const RisingLine: FC<{ text: string; offset: number; outlined?: boolean }> = ({
  text,
  offset,
  outlined,
}) => (
  <span className={`${styles.line} ${outlined ? styles.outlined : ''}`} aria-hidden="true">
    {Array.from(text).map((char, i) => (
      <span key={i} style={{ '--i': offset + i } as CSSProperties}>
        {char === ' ' ? ' ' : char}
      </span>
    ))}
  </span>
);

export const PageHero: FC<PageHeroProps> = ({
  id,
  title,
  outline,
  meta,
  lede,
  stats,
  aside,
  children,
}) => (
  <section className={`${styles.hero} ${aside ? styles.withAside : ''}`} aria-labelledby={id}>
    <div className={styles.backdrop} aria-hidden="true">
      <span className={styles.haze} />
      <span className={styles.horizon} />
      <span className={styles.lamps} />
      <span className={styles.streak} />
    </div>

    <div className={styles.inner}>
      <div className={styles.copy}>
        {meta && meta.length > 0 && (
          <p className={styles.meta}>
            {meta.map((item, i) => (
              <span key={item}>
                {i > 0 && (
                  <span className={styles.metaDot} aria-hidden="true">
                    ·
                  </span>
                )}
                {item}
              </span>
            ))}
          </p>
        )}

        <h1 id={id} className={styles.title}>
          <span className={styles.srOnly}>{outline ? `${title} ${outline}` : title}</span>
          <RisingLine text={title} offset={0} />
          {outline && <RisingLine text={outline} offset={title.length} outlined />}
        </h1>

        <p className={styles.lede}>{lede}</p>

        {children && <div className={styles.actions}>{children}</div>}
      </div>

      {aside && <div className={styles.aside}>{aside}</div>}
    </div>

    {stats && stats.length > 0 && (
      <dl className={styles.cluster}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.gauge}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    )}
  </section>
);
