import { FC, ReactNode } from 'react';
import styles from './PortraitHero.module.css';

// Cinematic portrait hero: graded photo on the right, copy passed in as children
export const PortraitHero: FC<{ children: ReactNode }> = ({ children }) => (
  <section className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.haze} aria-hidden="true" />
    <figure className={styles.portrait}>
      <img
        src="./img/photos/me/shug-luna-car-smile.jpg"
        alt="Shugmi and his dog Luna both grinning in the car, her tongue out"
        width={1500}
        height={1997}
        fetchPriority="high"
        className={styles.photo}
      />
      <span className={styles.grade} aria-hidden="true" />
      <span className={`${styles.crop} ${styles.cropTl}`} aria-hidden="true" />
      <span className={`${styles.crop} ${styles.cropBr}`} aria-hidden="true" />
      <figcaption className={styles.caption}>With my co-pilot</figcaption>
    </figure>
    <div className={styles.content}>{children}</div>
  </section>
);
