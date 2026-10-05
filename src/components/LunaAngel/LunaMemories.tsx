import { CSSProperties, FC, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Photo } from '../../data/photos';
import {
  clamp,
  DRIFT,
  easeOut,
  EYE,
  formatDate,
  frameRatio,
  getMemories,
  Glide,
  glideAt,
  makeDots,
  makeGlide,
  makeMeadow,
  PAW_COUNT,
  SEGMENTS,
  settle,
  smooth,
  STAR_ORDER,
  STARS,
} from './memories/sky';
import styles from './LunaMemories.module.css';

type LunaMemoriesProps = {
  /** Extra class on the outer section */
  className?: string;
};

const TITLE_ID = 'luna-memories-title';
const FAR = makeDots(11, 74);
const NEAR = makeDots(29, 30);
const FIREFLIES = makeDots(47, 18);
const BOKEH = makeDots(83, 6);
const MEADOW = makeMeadow(9, 1600, 240, 168, 9);

// Timeline, as fractions of the pinned scroll
const FIRST_FOCUS = 0.16;
const LAST_FOCUS = 0.79;
const LINES_FROM = 0.18;
const LINES_TO = 0.86;
const PAWS_FROM = 0.46;
const PAWS_TO = 0.9;

// Depth, in focal lengths: a card is sharpest at 1, fades in from far and out up close
const DZ = 0.75;
const D_FAR = 3.1;
const D_NEAR = 0.42;
/** Phones fade cards out sooner, so a close one never fills the screen */
const D_NEAR_NARROW = 0.56;
/** How far a card climbs per unit of depth, so the sky reads as a slow descent */
const CLIMB = 0.55;

const pad2 = (n: number) => String(n).padStart(2, '0');

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const LunaMemories: FC<LunaMemoriesProps> = ({ className }) => {
  const memories = useMemo(getMemories, []);
  const [still, setStill] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setStill(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const classes = [styles.memories, still ? styles.still : styles.moving, className]
    .filter(Boolean)
    .join(' ');

  return still ? (
    <StillMemories memories={memories} className={classes} />
  ) : (
    <MovingMemories memories={memories} className={classes} />
  );
};

export default LunaMemories;

// Shared pieces

const Intro: FC = () => (
  <>
    <p className={styles.eyebrow}>Field notes on a good girl</p>
    <h2 className={styles.heading} id={TITLE_ID}>
      All the good days
    </h2>
    <p className={styles.lede}>
      Luna was zoomies in the snow, naps in any patch of sun and a nose on every window. Here
      are a few of my favorite moments with her.
    </p>
  </>
);

const Outro: FC = () => (
  <>
    <p className={styles.outroLine}>Brightest star in the whole sky.</p>
    <p className={styles.lede}>Thanks for every walk, Luna. You were the best girl.</p>
  </>
);

const Stars: FC<{ dots: typeof FAR; tall?: number; twinkle?: boolean }> = ({
  dots,
  tall = 1,
  twinkle = true,
}) => (
  <>
    {dots.map((s, i) => (
      <span
        key={i}
        className={twinkle && s.t > 0.6 ? `${styles.star} ${styles.twinkle}` : styles.star}
        style={
          {
            left: `${s.x}%`,
            top: `${s.y * 100 * tall}%`,
            '--size': `${1 + s.s * 1.6}px`,
            '--o': 0.3 + s.o * 0.6,
            '--delay': `${-s.t * 7}s`,
          } as CSSProperties
        }
      />
    ))}
  </>
);

/** Her constellation. `drawn` shows it finished, for the still layout. */
const Constellation: FC<{ drawn?: boolean }> = memo(({ drawn = false }) => (
  <>
    {SEGMENTS.map((seg, i) => (
      <span
        key={i}
        className={styles.link}
        data-link=""
        style={{
          left: `${seg.x}%`,
          top: `${seg.y}%`,
          width: `${seg.len}%`,
          transform: `rotate(${seg.angle}deg) scaleX(${drawn ? 1 : 0})`,
        }}
      />
    ))}
    {STARS.map(([x, y], i) => (
      <span
        key={i}
        className={styles.cStar}
        data-cstar=""
        style={{ left: `${x}%`, top: `${y}%`, opacity: drawn ? 1 : 0.28 }}
      />
    ))}
    <span className={styles.eye} style={{ left: `${EYE[0]}%`, top: `${EYE[1]}%` }} />
  </>
));

const Meadow: FC = memo(() => (
  <svg viewBox="0 0 1600 240" preserveAspectRatio="xMidYMax slice" focusable="false">
    {MEADOW.stems.map((s, i) => (
      <g key={i}>
        <path
          d={`M${s.x} ${s.y} Q${s.x + s.bend} ${(s.y + s.top) / 2} ${s.x + s.bend * 0.6} ${s.top}`}
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
        />
        <circle cx={s.x + s.bend * 0.6} cy={s.top} r={s.r * 1.7} fill="#f6d38c" opacity="0.35" />
        <circle cx={s.x + s.bend * 0.6} cy={s.top} r={s.r * 0.6} fill="#fbe3ad" opacity="0.8" />
      </g>
    ))}
    <path d={MEADOW.path} fill="currentColor" />
  </svg>
));

const Polaroid: FC<{ photo: Photo; n: number; total: number; lazy?: boolean }> = ({
  photo,
  n,
  total,
  lazy = true,
}) => {
  const video = photo.kind === 'video';
  const still = photo.poster ?? photo.thumb;
  const date = formatDate(photo.date);
  return (
    <>
      <div className={styles.frame}>
        {video && lazy ? (
          <video
            className={styles.media}
            data-poster={still}
            data-video={photo.src}
            width={photo.width}
            height={photo.height}
            muted
            loop
            playsInline
            preload="none"
            aria-label={photo.alt}
          />
        ) : (
          <img
            className={styles.media}
            src={lazy ? undefined : still}
            data-src={lazy ? still : undefined}
            alt={photo.alt}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.captionText}>{photo.caption ?? 'Luna'}</span>
        <span className={styles.captionMeta} aria-hidden="true">
          {date || `${pad2(n)} / ${pad2(total)}`}
        </span>
      </figcaption>
    </>
  );
};

const cardStyle = (photo: Photo, extra: Record<string, string | number> = {}) =>
  ({ '--ar': String(frameRatio(photo)), ...extra }) as CSSProperties;

// Motion version: one sticky stage, a camera that drifts forward and down through the sky

type Card = {
  el: HTMLElement;
  i: number;
  x: number;
  y: number;
  r: number;
  w: number;
  sharp: HTMLElement | null;
  ghost: HTMLElement | null;
  glow: HTMLElement | null;
  imgs: HTMLImageElement[];
  video: HTMLVideoElement | null;
  loaded: boolean;
  shown: boolean;
  playing: boolean;
};

const MovingMemories: FC<{ memories: Photo[]; className: string }> = ({
  memories,
  className,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const total = memories.length;

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const q = (sel: string) => stage.querySelector<HTMLElement>(sel);
    const all = (sel: string) => Array.from(stage.querySelectorAll<HTMLElement>(sel));

    const el = {
      scene: q('[data-l="scene"]'),
      near: q('[data-l="near"]'),
      plane: q('[data-l="plane"]'),
      hud: q('[data-l="hud"]'),
      count: q('[data-l="count"]'),
      featherTop: q('[data-l="feather-top"]'),
      featherBottom: q('[data-l="feather-bottom"]'),
      dusk: q('[data-l="dusk"]'),
      far: q('[data-l="far"]'),
      mid: q('[data-l="mid"]'),
      heaven: q('[data-l="heaven"]'),
      cons: q('[data-l="cons"]'),
      halo: q('[data-l="halo"]'),
      horizon: q('[data-l="horizon"]'),
      meadow: q('[data-l="meadow"]'),
      flies: q('[data-l="flies"]'),
      intro: q('[data-l="intro"]'),
      outro: q('[data-l="outro"]'),
    };
    const links = all('[data-link]');
    const cStars = all('[data-cstar]');
    const paws = all('[data-paw]');
    const flies = all('[data-fly]');
    const bokeh = all('[data-bokeh]');
    const linkScale = links.map(() => -1);

    const cards: Card[] = all('[data-card]').map((node, i) => {
      const spot = DRIFT[i % DRIFT.length];
      return {
        el: node,
        i,
        x: spot.x,
        y: spot.y,
        r: spot.r,
        w: 1,
        sharp: node.querySelector<HTMLElement>('[data-face="sharp"]'),
        ghost: node.querySelector<HTMLElement>('[data-face="ghost"]'),
        glow: node.querySelector<HTMLElement>('[data-glow]'),
        imgs: Array.from(node.querySelectorAll<HTMLImageElement>('img[data-src]')),
        video: node.querySelector('video'),
        loaded: false,
        shown: true,
        playing: false,
      };
    });

    const finePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Layout, measured on mount and on resize
    let vw = 1;
    let vh = 1;
    let kx = 1;
    let push = 0;
    let dNear = D_NEAR;
    let ky = 1;
    let camMax = 1;
    let glide: Glide = makeGlide(1, 1, 1);
    let countShown = -1;

    // Run edge to edge even inside a centred page column
    const bleed = () => {
      section.style.marginLeft = '';
      section.style.marginRight = '';
      const r = section.getBoundingClientRect();
      const right = document.documentElement.clientWidth - r.right;
      if (r.left > 0.5) section.style.marginLeft = `${-r.left}px`;
      if (right > 0.5) section.style.marginRight = `${-right}px`;
    };

    const layout = () => {
      bleed();
      vw = stage.clientWidth || window.innerWidth || 1;
      vh = stage.clientHeight || window.innerHeight || 1;
      const narrow = vw < 700;
      const cw = narrow ? Math.min(vw * 0.6, 250) : clamp(vw * 0.2, 210, 300);
      stage.style.setProperty('--cw', `${cw}px`);
      kx = narrow ? vw * 0.15 : Math.min(vw * 0.26, 420);
      ky = vh * 0.5;
      // Extra sideways sweep once a card is past focus, so it clears the middle
      push = narrow ? vw * 0.3 : vw * 0.1;
      dNear = narrow ? D_NEAR_NARROW : D_NEAR;
      cards.forEach((c) => {
        c.w = c.el.offsetWidth || cw;
      });

      // Pinned length: a few screens, eased at both ends like the travel stage
      camMax = vh * (narrow ? 3.4 : 3.1);
      glide = makeGlide(camMax, 1, vh);
      section.style.height = `${Math.round(glide.total + vh)}px`;

      // Paw prints wander up from the meadow and stop at her feet
      if (el.cons) {
        const box = el.cons;
        const size = box.offsetWidth;
        const tx = box.offsetLeft + size * 0.6;
        const ty = box.offsetTop + size * 1.02;
        const sx = narrow ? vw * 0.14 : vw * 0.1;
        const sy = vh * 0.98;
        const cx = tx - (tx - sx) * (narrow ? 0.05 : 0.2);
        const cy = sy - (sy - ty) * 0.08;
        const base = narrow ? 18 : 22;
        paws.forEach((paw, i) => {
          const t = i / Math.max(1, paws.length - 1);
          const u = 1 - t;
          const x = u * u * sx + 2 * u * t * cx + t * t * tx;
          const y = u * u * sy + 2 * u * t * cy + t * t * ty;
          const dx = 2 * u * (cx - sx) + 2 * t * (tx - cx);
          const dy = 2 * u * (cy - sy) + 2 * t * (ty - cy);
          const len = Math.hypot(dx, dy) || 1;
          const side = (i % 2 ? 1 : -1) * base * 0.5;
          const ox = (-dy / len) * side;
          const oy = (dx / len) * side;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          const s = 1 - 0.5 * t;
          paw.style.width = `${base}px`;
          paw.style.height = `${base}px`;
          paw.style.transform = `translate3d(${x + ox - base / 2}px,${y + oy - base / 2}px,0) rotate(${angle}deg) scale(${s})`;
        });
      }
    };

    // Camera and pointer state
    let cam = 0;
    let camTarget = 0;
    let px = 0;
    let py = 0;
    let ptx = 0;
    let pty = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let inView = true;
    let snap = true;
    let enter = 1;
    let leave = 0;

    const readScroll = () => {
      const rect = section.getBoundingClientRect();
      const s = -rect.top;
      camTarget = glideAt(glide, s);
      enter = clamp(rect.top / vh);
      leave = clamp((s - glide.total) / vh);
    };

    const setPlaying = (c: Card, play: boolean) => {
      const v = c.video;
      if (!v || c.playing === play) return;
      c.playing = play;
      if (play) {
        try {
          const started = v.play();
          if (started && typeof started.catch === 'function') started.catch(() => (c.playing = false));
        } catch {
          c.playing = false;
        }
      } else {
        v.pause?.();
      }
    };

    const apply = () => {
      const p = cam / camMax;
      // How far the camera has sunk through the sky, in px
      const sink = p * vh * 1.6;
      const gold = smooth(clamp((p - 0.66) / 0.32));

      // Hand-off with the page, as in the travel stage: planes coast to rest as the stage
      // pins and pick speed back up as it lets go, while feathers blend the edges away
      const lift = (reach: number) => vh * (settle(leave, reach) - settle(enter, reach));
      if (el.scene) el.scene.style.transform = `translate3d(0,${lift(1)}px,0)`;
      if (el.near) el.near.style.transform = `translate3d(0,${lift(0.35)}px,0)`;
      if (el.plane) el.plane.style.transform = `translate3d(0,${lift(0.6)}px,0)`;
      if (el.featherTop) el.featherTop.style.opacity = String(smooth(clamp(enter / 0.4)));
      if (el.featherBottom) el.featherBottom.style.opacity = String(smooth(clamp(leave / 0.4)));
      if (el.hud) {
        el.hud.style.opacity = String(
          smooth(clamp((p - FIRST_FOCUS + 0.08) / 0.06)) *
            (1 - smooth(clamp((p - LAST_FOCUS - 0.02) / 0.06))) *
            (1 - smooth(clamp(leave / 0.25)))
        );
      }

      // Sky: night overhead, a warm horizon rises into view near the end
      if (el.dusk) el.dusk.style.opacity = String(gold);
      if (el.far) el.far.style.transform = `translate3d(${-ptx * 3}px,${-sink * 0.05}px,0)`;
      if (el.mid) el.mid.style.transform = `translate3d(${-ptx * 7}px,${-sink * 0.32}px,0)`;
      if (el.heaven) {
        el.heaven.style.transform = `translate3d(${-ptx * 5}px,${vh * 0.1 * (1 - p) - pty * 4}px,0)`;
      }
      if (el.halo) el.halo.style.opacity = String(0.12 + 0.88 * gold);
      if (el.cons) el.cons.style.transform = `scale(${0.97 + 0.03 * gold})`;

      const rise = 1 - easeOut(clamp((p - 0.58) / 0.42));
      if (el.horizon) {
        el.horizon.style.transform = `translate3d(0,${vh * 0.35 * rise}px,0)`;
        el.horizon.style.opacity = String(0.15 + 0.85 * gold);
      }
      if (el.meadow) el.meadow.style.transform = `translate3d(${-ptx * 12}px,${vh * 0.42 * rise}px,0)`;

      // Constellation lines join up one after another
      const span = (LINES_TO - LINES_FROM) / links.length;
      links.forEach((link, i) => {
        const t = smooth(clamp((p - LINES_FROM - i * span) / span));
        const v = Math.round(t * 1000) / 1000;
        if (v === linkScale[i]) return;
        linkScale[i] = v;
        link.style.transform = `rotate(${SEGMENTS[i].angle}deg) scaleX(${v})`;
      });
      cStars.forEach((star, i) => {
        const at = LINES_FROM + STAR_ORDER[i] * span;
        star.style.opacity = String(0.28 + 0.72 * smooth(clamp((p - at + 0.02) / 0.04)));
      });

      // Paw prints, newest brightest
      const step = (PAWS_TO - PAWS_FROM) / Math.max(1, paws.length);
      paws.forEach((paw, i) => {
        const at = PAWS_FROM + i * step;
        const on = smooth(clamp((p - at) / 0.025));
        const settleDown = 1 - 0.55 * smooth(clamp((p - at - 0.1) / 0.14));
        paw.style.opacity = String(on * settleDown);
      });

      // Memory cards: perspective by hand, so only transform and opacity change
      const camZ = -1 + ((p - FIRST_FOCUS) / (LAST_FOCUS - FIRST_FOCUS)) * (cards.length - 1) * DZ;
      const cx = vw / 2;
      const cy = vh / 2;
      let focus = 0;
      let best = Infinity;
      for (const c of cards) {
        const d = c.i * DZ - camZ;
        if (Math.abs(d - 1) < best) {
          best = Math.abs(d - 1);
          focus = c.i;
        }
        if (!c.loaded && d < D_FAR + 1.6) {
          c.imgs.forEach((img) => {
            if (img.dataset.src) img.src = img.dataset.src;
          });
          if (c.video) {
            if (c.video.dataset.poster) c.video.poster = c.video.dataset.poster;
            if (c.video.dataset.video) c.video.src = c.video.dataset.video;
          }
          c.loaded = true;
        }
        const visible = d > dNear && d < D_FAR;
        setPlaying(c, inView && d > 0.6 && d < 1.7);
        if (!visible) {
          if (c.shown) {
            c.el.style.opacity = '0';
            c.shown = false;
          }
          continue;
        }
        c.shown = true;
        const s = 1 / d;
        const x =
          cx + c.x * s * kx + Math.sign(c.x || 1) * Math.max(0, s - 1) * push + ptx * (s - 0.6) * 26;
        const y = cy + (c.y + CLIMB * (d - 1)) * s * ky + pty * (s - 0.6) * 16;
        const rot = c.r * (0.7 + 0.3 * s);
        c.el.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rot}deg) scale(${s})`;
        c.el.style.opacity = String(
          smooth(clamp((D_FAR - d) / 0.85)) * smooth(clamp((d - dNear) / 0.26))
        );
        // Depth of field: a blurred copy underneath, the sharp one fades in near focus
        const sharp = 1 - smooth(clamp((Math.abs(Math.log(d)) - 0.05) / 0.5));
        if (c.sharp) c.sharp.style.opacity = String(sharp);
        if (c.ghost) c.ghost.style.opacity = String(1 - sharp * sharp);
        if (c.glow) c.glow.style.opacity = String(sharp * 0.9);
      }
      if (focus !== countShown && el.count) {
        countShown = focus;
        el.count.textContent = pad2(focus + 1);
      }

      // Intro drifts up and away, the outro settles in under her stars
      if (el.intro) {
        const out = smooth(clamp((p - 0.03) / 0.1));
        el.intro.style.opacity = String(1 - out);
        el.intro.style.transform = `translate3d(0,${-sink * 0.9}px,0)`;
      }
      if (el.outro) {
        const inn = smooth(clamp((p - 0.84) / 0.12));
        el.outro.style.opacity = String(inn);
        el.outro.style.transform = `translate3d(0,${(1 - inn) * 40}px,0)`;
      }

      // Near field: fireflies and bokeh rise past, wrapping round
      const span2 = vh * 1.3;
      const wrap = (y: number) => ((y % span2) + span2) % span2 - vh * 0.15;
      if (el.flies) el.flies.style.opacity = String(0.35 + 0.65 * gold);
      flies.forEach((node, i) => {
        const f = FIREFLIES[i];
        const y = wrap(f.y * span2 - sink * (0.6 + f.s * 0.5));
        node.style.transform = `translate3d(${-ptx * 20 * (0.5 + f.s)}px,${y}px,0)`;
      });
      bokeh.forEach((node, i) => {
        const b = BOKEH[i];
        const y = wrap(b.y * span2 - sink * (1.8 + b.s));
        node.style.transform = `translate3d(${-ptx * 50}px,${y + pty * 20}px,0)`;
      });
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      readScroll();
      if (snap) {
        cam = camTarget;
        snap = false;
      } else {
        cam += (camTarget - cam) * (1 - Math.exp(-dt / 70));
      }
      ptx += (px - ptx) * (1 - Math.exp(-dt / 160));
      pty += (py - pty) * (1 - Math.exp(-dt / 160));
      apply();
      const settled =
        Math.abs(camTarget - cam) < 0.25 && Math.abs(px - ptx) < 0.002 && Math.abs(py - pty) < 0.002;
      if (settled || !inView) {
        running = false;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (running || !inView) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const onScroll = () => kick();
    const onPointer = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      py = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      kick();
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      kick();
    };
    const onResize = () => {
      layout();
      snap = true;
      kick();
    };

    layout();
    readScroll();
    cam = camTarget;
    apply();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (finePointer) {
      stage.addEventListener('pointermove', onPointer, { passive: true });
      stage.addEventListener('pointerleave', onLeave, { passive: true });
    }

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    ro?.observe(stage);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting;
          stage.toggleAttribute('data-paused', !inView);
          if (inView) {
            snap = true;
            kick();
          } else {
            cards.forEach((c) => setPlaying(c, false));
          }
        },
        { rootMargin: '120px 0px' }
      );
      io.observe(section);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      stage.removeEventListener('pointermove', onPointer);
      stage.removeEventListener('pointerleave', onLeave);
      ro?.disconnect();
      io?.disconnect();
      cards.forEach((c) => setPlaying(c, false));
      section.style.marginLeft = '';
      section.style.marginRight = '';
    };
  }, [memories]);

  return (
    <section ref={sectionRef} className={className} aria-labelledby={TITLE_ID} data-no-reveal>
      <div ref={stageRef} className={styles.stage}>
        <div className={styles.scene} data-l="scene" aria-hidden="true">
          <div className={`${styles.sky} ${styles.skyNight}`} />
          <div className={`${styles.sky} ${styles.skyDusk}`} data-l="dusk" />
          <div className={styles.far} data-l="far">
            <Stars dots={FAR} tall={1.1} />
          </div>
          <div className={styles.mid} data-l="mid">
            <Stars dots={NEAR} tall={1.7} twinkle={false} />
          </div>
          <div className={styles.heaven} data-l="heaven">
            <div className={styles.halo} data-l="halo" />
            <div className={styles.cons} data-l="cons">
              <Constellation />
            </div>
            {Array.from({ length: PAW_COUNT }, (_, i) => (
              <span key={i} className={styles.paw} data-paw="" />
            ))}
          </div>
          <div className={styles.horizon} data-l="horizon" />
          <div className={styles.meadow} data-l="meadow">
            <Meadow />
          </div>
        </div>

        <div className={styles.plane} data-l="plane">
          <div className={styles.intro} data-l="intro">
            <Intro />
            <p className={styles.hint} aria-hidden="true">
              <span>Scroll</span>
              <svg viewBox="0 0 12 28" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 0v25M1 20l5 5 5-5" />
              </svg>
            </p>
          </div>
          <div className={styles.cards} role="list" aria-label="Photos of Luna">
            {memories.map((photo, i) => (
              <figure
                key={photo.id}
                role="listitem"
                className={styles.card}
                data-card=""
                style={cardStyle(photo, { zIndex: memories.length - i })}
              >
                <span className={styles.glow} data-glow="" aria-hidden="true" />
                <div className={`${styles.face} ${styles.ghost}`} data-face="ghost" aria-hidden="true">
                  <div className={styles.frame}>
                    <img
                      className={styles.media}
                      data-src={photo.poster ?? photo.thumb}
                      alt=""
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span className={styles.captionGhost} />
                </div>
                <div className={styles.face} data-face="sharp">
                  <Polaroid photo={photo} n={i + 1} total={total} />
                </div>
              </figure>
            ))}
          </div>
          <div className={styles.outro} data-l="outro">
            <Outro />
          </div>
        </div>

        <div className={styles.near} data-l="near" aria-hidden="true">
          <div className={styles.flies} data-l="flies">
            {FIREFLIES.map((f, i) => (
              <span key={i} className={styles.fly} data-fly="" style={{ left: `${4 + f.x * 0.92}%` }}>
                <span
                  style={
                    {
                      '--fs': `${2.5 + f.s * 2.5}px`,
                      '--delay': `${-f.t * 8}s`,
                      '--dur': `${5 + f.o * 5}s`,
                    } as CSSProperties
                  }
                />
              </span>
            ))}
          </div>
          {BOKEH.map((b, i) => (
            <span
              key={i}
              className={styles.bokeh}
              data-bokeh=""
              style={
                {
                  left: `${b.x}%`,
                  '--bs': `${80 + b.s * 150}px`,
                  '--o': 0.2 + b.o * 0.35,
                } as CSSProperties
              }
            />
          ))}
          <div className={styles.vignette} />
        </div>

        <div className={styles.hud} data-l="hud" aria-hidden="true">
          <span className={styles.hudLabel}>Memory</span>
          <span className={styles.hudNum} data-l="count">
            01
          </span>
          <span className={styles.hudOf}>/ {pad2(total)}</span>
        </div>

        <div className={`${styles.feather} ${styles.featherTop}`} data-l="feather-top" aria-hidden="true" />
        <div className={`${styles.feather} ${styles.featherBottom}`} data-l="feather-bottom" aria-hidden="true" />
      </div>
    </section>
  );
};

// Reduced motion: the finished sky over a still collage

const StillMemories: FC<{ memories: Photo[]; className: string }> = ({ memories, className }) => (
  <section className={className} aria-labelledby={TITLE_ID} data-no-reveal>
    <div className={styles.stillHero}>
      <div className={styles.stillSky} aria-hidden="true">
        <div className={`${styles.sky} ${styles.skyNight}`} />
        <div className={styles.far}>
          <Stars dots={FAR} twinkle={false} />
        </div>
        <div className={styles.halo} />
        <div className={styles.cons}>
          <Constellation drawn />
        </div>
      </div>
      <div className={styles.stillIntro}>
        <Intro />
      </div>
    </div>
    <div className={styles.stillGrid} role="list" aria-label="Photos of Luna">
      {memories.map((photo, i) => (
        <figure
          key={photo.id}
          role="listitem"
          className={styles.card}
          style={cardStyle(photo, { '--tilt': `${DRIFT[i % DRIFT.length].r * 0.6}deg` })}
        >
          <div className={styles.face}>
            <Polaroid photo={photo} n={i + 1} total={memories.length} lazy={false} />
          </div>
        </figure>
      ))}
    </div>
    <div className={styles.stillOutro}>
      <div className={styles.stillSky} aria-hidden="true">
        <div className={`${styles.sky} ${styles.skyDusk}`} />
        <div className={styles.horizon} />
        <div className={styles.meadow}>
          <Meadow />
        </div>
      </div>
      <div className={styles.stillOutroText}>
        <span className={styles.stillPaws} aria-hidden="true">
          <span className={styles.paw} />
          <span className={styles.paw} />
          <span className={styles.paw} />
        </span>
        <Outro />
      </div>
    </div>
  </section>
);
