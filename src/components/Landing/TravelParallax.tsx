import { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react';
import { Photo } from '../../data/photos';
import {
  along,
  CARD_PATTERN,
  CARD_PATTERN_NARROW,
  ChapterWithPhotos,
  clamp,
  easeOut,
  getJourney,
  Glide,
  glideAt,
  makeGlide,
  Mood,
  settle,
  smooth,
  window4,
} from './travel/journey';
import {
  Backdrop,
  FarRidge,
  FOREGROUND_RATIO,
  foregroundTile,
  Hills,
  Landmark,
  makeDots,
  WATER_RATIO,
  waterTile,
} from './travel/Scenery';
import styles from './TravelParallax.module.css';

type TravelParallaxProps = {
  /** Extra class on the outer section */
  className?: string;
};

const TITLE_ID = 'travel-parallax-title';
const STARS = makeDots(5, 70);
const BOKEH = makeDots(88, 7);
const EMBERS = makeDots(140, 16);
const CLOUDS_FAR = makeDots(61, 7);
const CLOUDS_NEAR = makeDots(73, 5);
const FOG = makeDots(19, 9);

// Sky gradients from afternoon to night, each stacked over the last
const SKIES = ['skyAfternoon', 'skyOvercast', 'skyGolden', 'skyDusk', 'skyNight'] as const;
const SKY_TOD = [0.1, 0.3, 0.55, 0.76, 0.95];
const MOOD_KEYS: (keyof Mood)[] = ['tod', 'cloud', 'glow', 'water', 'hills', 'ridge', 'fog', 'city', 'stars'];

const pad2 = (n: number) => String(n).padStart(2, '0');

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TravelParallax: FC<TravelParallaxProps> = ({ className }) => {
  const journey = useMemo(getJourney, []);
  const [still, setStill] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setStill(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const classes = [styles.travel, still ? styles.still : styles.moving, className]
    .filter(Boolean)
    .join(' ');

  return still ? (
    <StillJourney journey={journey} className={classes} />
  ) : (
    <MovingJourney journey={journey} className={classes} />
  );
};

export default TravelParallax;

// Shared pieces

const cardStyle = (photo: Photo, extra: Record<string, string | number> = {}) =>
  ({ '--ar': `${photo.width} / ${photo.height}`, ...extra }) as CSSProperties;

const Intro: FC = () => (
  <>
    <p className={styles.eyebrow}>Out of office</p>
    <h2 className={styles.heading} id={TITLE_ID}>
      Where I go when the laptop closes
    </h2>
    <p className={styles.lede}>
      Seven stops, one overloaded camera roll and a hotel gym in every city. Grab the window seat
      and keep scrolling.
    </p>
  </>
);

const Outro: FC = () => (
  <>
    <p className={styles.eyebrow}>Next stop</p>
    <p className={styles.outroLine}>TBD. Taking suggestions.</p>
    <p className={styles.lede}>
      Home base is still Detroit. Know a place with great food, a decent gym and a view worth the
      walk? Tell me about it.
    </p>
  </>
);

const Stars: FC<{ twinkle?: boolean }> = ({ twinkle = true }) => (
  <>
    {STARS.map((s, i) => (
      <span
        key={i}
        className={twinkle && s.t > 0.55 ? `${styles.star} ${styles.twinkle}` : styles.star}
        style={
          {
            left: `${s.x}%`,
            top: `${s.y * 58}%`,
            '--size': `${1 + s.s * 1.8}px`,
            '--o': 0.35 + s.o * 0.65,
            '--delay': `${-s.t * 6}s`,
          } as CSSProperties
        }
      />
    ))}
  </>
);

// Motion version: one sticky stage, every plane positioned from the same camera

type Sprite = {
  el: HTMLElement;
  /** Anchor position along the track, in px */
  x: number;
  /** Depth: 1 moves with the camera, below 1 lags behind, above 1 rushes past */
  d: number;
  kind: 'card' | 'title' | 'landmark' | 'backdrop' | 'block';
  w: number;
  r: number;
  img?: HTMLImageElement | null;
  cover?: HTMLElement | null;
  dim?: HTMLElement | null;
  src?: string;
  loaded?: boolean;
  shown?: boolean;
  /** Card: resting centre line and height, in px */
  cy?: number;
  h?: number;
  /** Title: offsets of the heading and blurb inside the block, in px */
  top?: number;
  headB?: number;
  blurbB?: number;
  blurbW?: number;
};

/** Screen box of a piece of chapter text that cards should make room for */
type TextBox = { l: number; r: number; b: number; w: number };

const MovingJourney: FC<{ journey: ChapterWithPhotos[]; className: string }> = ({
  journey,
  className,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const total = journey.reduce((n, c) => n + c.photos.length, 0);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const q = (sel: string) => stage.querySelector<HTMLElement>(sel);

    const el = {
      scene: q('[data-l="scene"]'),
      near: q('[data-l="near"]'),
      hud: q('[data-l="hud"]'),
      featherTop: q('[data-l="feather-top"]'),
      featherBottom: q('[data-l="feather-bottom"]'),
      water: q('[data-l="water"]'),
      waterGlint: q('[data-l="water-glint"]'),
      waterGlow: q('[data-l="water-glow"]'),
      fog: q('[data-l="fog"]'),
      haze: q('[data-l="haze"]'),
      stars: q('[data-l="stars"]'),
      sun: q('[data-l="sun"]'),
      moon: q('[data-l="moon"]'),
      glow: q('[data-l="glow"]'),
      city: q('[data-l="city"]'),
      cloudsFar: q('[data-l="clouds-far"]'),
      cloudsNear: q('[data-l="clouds-near"]'),
      ridge: q('[data-l="ridge"]'),
      hills: q('[data-l="hills"]'),
      fore: q('[data-l="fore"]'),
      plane: q('[data-l="cards"]'),
      fill: q('[data-l="route-fill"]'),
      marker: q('[data-l="route-marker"]'),
      route: q('[data-l="route"]'),
      stopNum: q('[data-l="stop-num"]'),
      stopName: q('[data-l="stop-name"]'),
      hint: q('[data-l="hint"]'),
    };
    const skies = SKIES.map((_, i) => q(`[data-l="sky-${i}"]`));
    const bokeh = Array.from(stage.querySelectorAll<HTMLElement>('[data-bokeh]'));
    const embers = Array.from(stage.querySelectorAll<HTMLElement>('[data-ember]'));
    const dots = Array.from(stage.querySelectorAll<HTMLElement>('[data-stop]'));

    const sprites: Sprite[] = [];
    stage.querySelectorAll<HTMLElement>('[data-sprite]').forEach((node) => {
      sprites.push({
        el: node,
        x: 0,
        d: 1,
        w: 0,
        r: 0,
        kind: node.dataset.sprite as Sprite['kind'],
        img: node.querySelector('img'),
        cover: node.querySelector<HTMLElement>('[data-cover]'),
        dim: node.querySelector<HTMLElement>('[data-dim]'),
        src: node.dataset.src,
        shown: true,
      });
    });

    const finePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Layout, measured on mount and on resize
    let vw = 1;
    let vh = 1;
    let camMax = 1;
    let tileW = 1;
    let waterW = 1;
    let fieldW = 1;
    let routeW = 0;
    let stops: number[] = [];
    let stopIndex = -1;
    let glide: Glide = makeGlide(1, 1, 1);
    // Lowest a card may sink while it makes room for chapter text
    let cardFloor = 1;
    const boxes: TextBox[] = [];
    const skyBoxes: (TextBox & { t: number; title: boolean })[] = [];
    let narrow = false;
    // Top of the open sky, under the site header
    let skyTop = 0;
    const moods = MOOD_KEYS.map((k) => journey.map((c) => c.mood[k]));

    // Run edge to edge even inside a centred page column, so pinning takes over the
    // whole screen instead of leaving a framed box with hard side edges
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
      narrow = vw < 700;
      skyTop = narrow ? 64 : 80;
      const cw = narrow ? Math.min(vw * 0.56, 260) : clamp(vw * 0.19, 190, 320);
      stage.style.setProperty('--cw', `${cw}px`);
      const spacing = narrow ? cw * 0.98 : cw * 1.34;
      const lead = narrow ? vw * 0.95 : vw * 0.42;
      const pattern = narrow ? CARD_PATTERN_NARROW : CARD_PATTERN;

      let x = narrow ? vw * 0.95 : vw * 0.62;
      const titles = sprites.filter((s) => s.kind === 'title');
      const landmarks = sprites.filter((s) => s.kind === 'landmark');
      const backdrops = sprites.filter((s) => s.kind === 'backdrop');
      const cards = sprites.filter((s) => s.kind === 'card');
      const blocks = sprites.filter((s) => s.kind === 'block');
      const centers: number[] = [];
      let ci = 0;

      journey.forEach((chapter, i) => {
        const start = x;
        const title = titles[i];
        if (title) {
          title.x = start + (narrow ? vw * 0.08 : vw * 0.05);
          title.d = 0.72;
        }
        chapter.photos.forEach((_, j) => {
          const card = cards[ci++];
          if (!card) return;
          const p = pattern[(j + i) % pattern.length];
          card.x = start + lead + (j + 0.5) * spacing;
          card.d = p.d;
          card.r = p.r;
          card.w = cw * p.s;
          card.el.style.setProperty('--s', String(p.s));
          card.el.style.setProperty('--y', String(p.y));
          card.el.style.zIndex = String(Math.round(p.d * 100));
          card.cy = p.y * vh;
        });
        x = start + lead + chapter.photos.length * spacing;
        centers.push((start + x) / 2);
        const mark = landmarks[i];
        if (mark) {
          mark.x = (start + x) / 2;
          mark.d = 0.55;
        }
        const back = backdrops[i];
        if (back) {
          back.x = (start + x) / 2;
          back.d = 0.28;
        }
      });

      const outroW = narrow ? vw * 1.05 : vw * 0.8;
      const trackW = x + outroW;
      camMax = Math.max(1, trackW - vw);

      // The skyline settles in behind the last screen instead of its chapter center
      const lastMark = landmarks[journey.length - 1];
      if (lastMark && journey[journey.length - 1]?.landmark === 'skyline') {
        lastMark.x = trackW - vw * (narrow ? 0.45 : 0.62);
        // its far skyline row rises a little earlier, so the city builds up in layers
        const lastBack = backdrops[journey.length - 1];
        if (lastBack) lastBack.x = (lastBack.x + lastMark.x) / 2;
      }
      if (blocks[0]) {
        blocks[0].x = narrow ? vw * 0.07 : vw * 0.06;
        blocks[0].d = 1;
      }
      if (blocks[1]) {
        blocks[1].x = x + (narrow ? vw * 0.12 : vw * 0.14);
        blocks[1].d = 1;
      }

      sprites.forEach((s) => {
        if (s.kind === 'card' || s.kind === 'block') s.h = s.el.offsetHeight;
        if (s.kind !== 'card') {
          s.w = s.el.offsetWidth;
        }
        if (s.kind === 'title') {
          // Measure the glyphs, not the boxes: the tight line height lets the big
          // heading spill past its own box
          const box = s.el.getBoundingClientRect();
          const ink = (sel: string) => {
            const node = s.el.querySelector(sel);
            if (!node) return { b: 0, w: 0 };
            const range = document.createRange();
            range.selectNodeContents(node);
            const r =
              typeof range.getBoundingClientRect === 'function'
                ? range.getBoundingClientRect()
                : node.getBoundingClientRect();
            return { b: r.bottom - box.top, w: r.right - box.left };
          };
          const head = ink('[data-head]');
          const blurb = ink('[data-blurb]');
          s.top = s.el.offsetTop;
          s.headB = head.b;
          s.blurbB = blurb.b;
          s.blurbW = blurb.w;
          s.w = Math.max(s.w, head.w);
        }
      });
      cardFloor = vh - (narrow ? 64 : 72);

      stops = centers.map((c) => clamp((c - vw / 2) / camMax));
      dots.forEach((dot, i) => {
        dot.style.left = `${(stops[i] ?? 0) * 100}%`;
      });

      // Camera px per scroll px while cruising; the eased ends add their own length
      glide = makeGlide(camMax, narrow ? 1.2 : 1.1, vh);
      section.style.height = `${Math.round(glide.total + vh)}px`;

      if (el.fore) {
        tileW = el.fore.clientHeight * FOREGROUND_RATIO || 1;
        el.fore.style.width = `${vw + tileW + 4}px`;
        el.fore.style.backgroundSize = `${tileW}px 100%`;
      }
      if (el.waterGlint) {
        waterW = el.waterGlint.clientHeight * WATER_RATIO || 1;
        el.waterGlint.style.width = `${vw + waterW + 4}px`;
        el.waterGlint.style.backgroundSize = `${waterW}px 100%`;
      }
      fieldW = vw * 1.4;
      routeW = el.route?.clientWidth ?? 0;
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
    // How much of the stage is still below the fold (1 to 0) and how far it has let go (0 to 1)
    let enter = 1;
    let leave = 0;

    // Sun and moon offsets while they keep clear of the text
    let sunY = 0;
    let moonY = 0;
    let sunHide = 0;
    let moonHide = 0;
    let frameDt = 16;
    let snapSky = true;
    let skyMoving = false;

    const readScroll = () => {
      const rect = section.getBoundingClientRect();
      const s = -rect.top;
      camTarget = glideAt(glide, s);
      enter = clamp(rect.top / vh);
      leave = clamp((s - glide.total) / vh);
    };

    const apply = () => {
      skyMoving = false;
      const p = cam / camMax;

      // Hand-off with the page. The stage box moves with the page, but each plane coasts
      // to rest as it pins and picks speed back up as it lets go (far ones over a longer
      // run), while feathers blend the box edges into the page colour.
      const lift = (reach: number) => vh * (settle(leave, reach) - settle(enter, reach));
      const planeLift = lift(0.6);
      if (el.scene) el.scene.style.transform = `translate3d(0,${lift(1)}px,0)`;
      if (el.near) el.near.style.transform = `translate3d(0,${lift(0.35)}px,0)`;
      if (el.featherTop) el.featherTop.style.opacity = String(smooth(clamp(enter / 0.4)));
      if (el.featherBottom) el.featherBottom.style.opacity = String(smooth(clamp(leave / 0.4)));
      if (el.hud) {
        el.hud.style.opacity = String(
          smooth(clamp(1 - enter / 0.3)) * (1 - smooth(clamp(leave / 0.25)))
        );
      }

      // Weather and time of day, blended between the stops on either side
      const [tod, cloud, glow, water, hills, ridge, fog, city, starAmt] = moods.map((m) => along(p, stops, m));
      for (let i = 1; i < skies.length; i++) {
        const sky = skies[i];
        if (sky) {
          sky.style.opacity = String(smooth(clamp((tod - SKY_TOD[i - 1]) / (SKY_TOD[i] - SKY_TOD[i - 1]))));
        }
      }
      if (el.stars) {
        el.stars.style.opacity = String(starAmt);
        el.stars.style.transform = `translate3d(${-p * vw * 0.12 - ptx * 4}px,0,0)`;
      }
      const mid = vw / 2;
      const screenX = (s: Sprite) => mid + (s.x - cam - mid) * s.d + ptx * (s.d - 1) * 50;
      const blockFade = (s: Sprite, sc: number) =>
        s.el.dataset.block === 'intro'
          ? 1 - smooth(clamp(-sc / (vw * 0.45)))
          : 1 - smooth(clamp((sc - vw * 0.45) / (vw * 0.45)));
      const titleFade = (rel: number) => 1 - smooth(clamp((Math.abs(rel + 0.12) - 0.3) / 0.45));

      // Where the chapter text sits right now. Cards that drift under it sink and shrink
      // a little to make room, then settle back once they are past.
      boxes.length = 0;
      skyBoxes.length = 0;
      for (const s of sprites) {
        if (s.kind !== 'title') continue;
        const sc = screenX(s);
        const rel = (sc - mid) / vw;
        const fade = titleFade(rel);
        if (fade < 0.01 || sc > vw + 60 || sc + s.w < -60) continue;
        const y = (s.top ?? 0) + rel * 26;
        // Cards stay clear until the text has all but faded out
        const w = smooth(clamp((fade - 0.02) / 0.12));
        boxes.push({ l: sc, r: sc + s.w, b: y + (s.headB ?? 0), w });
        boxes.push({ l: sc, r: sc + (s.blurbW ?? 0), b: y + (s.blurbB ?? 0), w });
        skyBoxes.push({ l: sc, r: sc + s.w, t: y, b: y + Math.max(s.headB ?? 0, s.blurbB ?? 0), w, title: true });
      }
      // The intro and outro blocks too, so the sun and moon keep out from behind them
      for (const s of sprites) {
        if (s.kind !== 'block' || !s.h) continue;
        const sc = screenX(s);
        const fade = blockFade(s, sc);
        if (fade < 0.01 || sc > vw + 60 || sc + s.w < -60) continue;
        skyBoxes.push({ l: sc, r: sc + s.w, t: (vh - s.h) / 2, b: (vh + s.h) / 2, w: smooth(clamp((fade - 0.02) / 0.12)), title: false });
      }


      // On narrow screens the text spans most of the width, so the sun and moon slide up
      // or down out from behind any of it, glow included, and drift back once it has gone
      const textLift = planeLift - lift(1);
      // Glide out of the way rather than jump when the clear spot flips above or below
      const ease = (cur: number, want: number, eps = 0.4) => {
        const next = snapSky ? want : cur + (want - cur) * (1 - Math.exp(-frameDt / 160));
        skyMoving = skyMoving || Math.abs(want - next) > eps;
        return next;
      };
      const clearOfText = (x: number, y: number, r: number): [number, number] => {
        // The boxes this disc is near, and how strongly each one wants it gone
        const near: { t: number; b: number; w: number }[] = [];
        for (const box of skyBoxes) {
          const hov = Math.min(x + r, box.r) - Math.max(x - r, box.l);
          const w = smooth(clamp((hov + 40) / 70)) * box.w;
          if (w > 0.001) near.push({ t: box.t + textLift - 10, b: box.b + textLift + 10, w });
        }
        const hits = (cy: number) => near.filter((n) => cy + r > n.t && cy - r < n.b);
        const blocking = hits(y);
        if (!blocking.length) return [y, 0];
        // Nearest spot above or below the text that is clear of every box
        const floor = vh * 0.8 - r;
        const spots = near
          .flatMap((n) => [n.t - r, n.b + r])
          .filter((cy) => cy >= skyTop + r && cy <= floor && !hits(cy).length)
          .sort((p, q) => Math.abs(p - y) - Math.abs(q - y));
        const w = Math.max(...blocking.map((n) => n.w));
        // Backstop when there is no room nearby (the intro fills the middle of a phone
        // screen): a cloud goes over instead
        if (spots[0] === undefined || Math.abs(spots[0] - y) > vh * 0.22) return [y, smooth(clamp(w / 0.5))];
        return [y + (spots[0] - y) * w, 0];
      };
      // Phones get their own sky path: a band between the bottom of the chapter text on
      // screen and the hills. The band follows the measured text as stops come and go.
      let bandTop = skyTop;
      for (const box of skyBoxes) {
        if (box.title) bandTop = Math.max(bandTop, skyTop + (box.b + textLift + 14 - skyTop) * box.w);
      }
      const horizon = vh * 0.6;
      const inBand = (r: number, k: number) => {
        const top = bandTop + r;
        return top + (Math.max(top, horizon) - top) * k;
      };
      if (el.sun) {
        // Climbs down the sky through the afternoon and sets behind the ridge
        const t = clamp(tod / 0.7);
        const sx = vw * (0.78 - 0.2 * t) - ptx * 6;
        const scale = 1 + 0.45 * t;
        const r = 58 * scale;
        let sy = vh * (0.16 + 0.54 * Math.pow(t, 1.6));
        let hide = 0;
        if (narrow) {
          [sy, hide] = clearOfText(sx, inBand(r, Math.pow(t, 1.6)), r);
          sunY = ease(sunY, sy);
          sunHide = ease(sunHide, hide, 0.004);
          sy = sunY;
        }
        el.sun.style.transform = `translate3d(${sx}px,${sy}px,0) scale(${scale})`;
        el.sun.style.opacity = String(
          (1 - smooth(clamp((tod - 0.6) / 0.12))) * (1 - 0.72 * cloud) * (1 - sunHide)
        );
      }
      if (el.moon) {
        const t = clamp((tod - 0.5) / 0.45);
        const mx = vw * (0.3 - 0.08 * t) - ptx * 5;
        let my = vh * (0.72 - 0.52 * easeOut(t));
        let hide = 0;
        if (narrow) {
          // Rises out of the hills to the top of the band
          [my, hide] = clearOfText(mx, inBand(72, 1 - easeOut(t)), 72);
          moonY = ease(moonY, my);
          moonHide = ease(moonHide, hide, 0.004);
          my = moonY;
        }
        el.moon.style.transform = `translate3d(${mx}px,${my}px,0)`;
        el.moon.style.opacity = String(smooth(clamp(t * 2.4)) * (1 - moonHide));
      }
      if (el.glow) el.glow.style.opacity = String(glow);
      if (el.haze) el.haze.style.opacity = String(0.35 + 0.65 * Math.max(glow, fog));
      if (el.city) el.city.style.opacity = String(city);
      if (el.cloudsFar) {
        el.cloudsFar.style.transform = `translate3d(${-p * vw * 0.9 - ptx * 6}px,0,0)`;
        el.cloudsFar.style.opacity = String((0.45 + 0.55 * cloud) * (1 - starAmt * 0.6));
      }
      if (el.cloudsNear) {
        el.cloudsNear.style.transform = `translate3d(${-p * vw * 2.4 - ptx * 12}px,${pty * 4}px,0)`;
        el.cloudsNear.style.opacity = String((0.3 + 0.7 * cloud) * (1 - starAmt * 0.7));
      }
      if (el.ridge) el.ridge.style.opacity = String(ridge);
      if (el.hills) el.hills.style.opacity = String(hills);
      if (el.water) el.water.style.opacity = String(water);
      if (el.waterGlow) el.waterGlow.style.opacity = String(0.25 + 0.75 * Math.max(glow, city));
      if (el.waterGlint) {
        const off = (cam * 0.62 + ptx * 10) % waterW;
        el.waterGlint.style.transform = `translate3d(${-off}px,0,0)`;
      }
      if (el.fog) {
        el.fog.style.opacity = String(fog);
        el.fog.style.transform = `translate3d(${-p * vw * 1.5 - ptx * 18}px,${pty * 4}px,0)`;
      }
      if (el.ridge) el.ridge.style.transform = `translate3d(${-p * vw * 0.6 - ptx * 8}px,${pty * 3}px,0)`;
      if (el.hills) el.hills.style.transform = `translate3d(${-p * vw * 1.6 - ptx * 14}px,${pty * 5}px,0)`;
      if (el.fore) {
        const off = (cam * 1.45 + ptx * 30) % tileW;
        el.fore.style.transform = `translate3d(${-off}px,${pty * 8}px,0)`;
      }
      if (el.plane) {
        el.plane.style.transform = `translate3d(0,${planeLift}px,0) rotateY(${ptx * 2.6}deg) rotateX(${-pty * 2}deg)`;
      }

      for (const s of sprites) {
        const sc = screenX(s);
        // Cards and landmarks are centered on their anchor, titles and blocks hang off it
        const visible =
          s.kind === 'card' || s.kind === 'landmark'
            ? sc > -s.w && sc < vw + s.w
            : sc > -s.w - 60 && sc < vw + 60;
        if (s.kind === 'card' && !s.loaded && s.img && s.src && sc > -vw && sc < vw * 2.2) {
          s.img.src = s.src;
          s.loaded = true;
        }
        if (!visible && !s.shown) continue;
        s.shown = visible;
        const rel = (sc - mid) / vw;

        if (s.kind === 'card') {
          const rot = s.r - rel * 5 * s.d;
          let ty = rel * (s.d - 1) * -140 + pty * (s.d - 1) * 30;
          let k = 1;
          if (boxes.length && s.h) {
            const half = s.w / 2;
            const cy = (s.cy ?? 0) + ty;
            let best = 0;
            for (const box of boxes) {
              const overlap = Math.min(sc + half, box.r) - Math.max(sc - half, box.l);
              const wgt = smooth(clamp((overlap + 150) / 120)) * box.w;
              if (wgt <= 0) continue;
              const top = box.b + 18;
              if (cy - s.h / 2 >= top) continue;
              // Shrink only as much as it takes to fit between the text and the floor
              const fit = clamp((cardFloor - top) / s.h, 0.68, 1);
              const target = Math.min(Math.max(cy, top + (fit * s.h) / 2), cardFloor - (fit * s.h) / 2);
              const push = (target - cy) * wgt;
              if (push > best) {
                best = push;
                k = 1 + (fit - 1) * wgt;
              }
            }
            ty += best;
          }
          s.el.style.transform = `translate3d(${sc}px,${ty}px,0) rotate(${rot}deg) scale(${k})`;
          const reveal = easeOut(clamp((vw * 1.02 - (sc - s.w / 2)) / (vw * 0.42)));
          if (s.cover) s.cover.style.transform = `scaleX(${1 - reveal})`;
          if (s.img) {
            s.img.style.transform = `translate3d(${-rel * s.w * 0.14}px,0,0) scale(${1.26 - 0.1 * reveal})`;
          }
          if (s.dim) s.dim.style.opacity = String(clamp(Math.abs(rel) * 1.2 - 0.2) * 0.62);
        } else if (s.kind === 'title') {
          const fade = titleFade(rel);
          s.el.style.transform = `translate3d(${sc}px,${rel * 26}px,0)`;
          s.el.style.opacity = String(fade);
        } else if (s.kind === 'backdrop') {
          // Fades by camera distance rather than screen position: it barely moves on screen
          const away = Math.abs(s.x - cam - mid) / vw;
          const near = 1 - smooth(clamp((away - 0.3) / 0.75));
          s.el.style.transform = `translate3d(${sc}px,${(1 - near) * 16}px,0)`;
          s.el.style.opacity = String(near);
        } else if (s.kind === 'landmark') {
          const near = 1 - smooth(clamp((Math.abs(rel) - 0.2) / 0.7));
          s.el.style.transform = `translate3d(${sc}px,${(1 - near) * 30}px,0) scale(${0.94 + near * 0.06})`;
          s.el.style.opacity = String(0.25 + near * 0.75);
        } else {
          // Intro drifts off to the left, the outro fades up as it nears the middle
          const fade = blockFade(s, sc);
          s.el.style.transform = `translate3d(${sc}px,0,0)`;
          s.el.style.opacity = String(fade);
        }
      }

      // Near field: wrap around so there is always something drifting past
      const wrap = (x: number) => ((x % fieldW) + fieldW) % fieldW - vw * 0.2;
      bokeh.forEach((node, i) => {
        const b = BOKEH[i];
        const sx = wrap((b.x / 100) * fieldW - cam * (2 + b.s * 0.8) - ptx * 60);
        node.style.transform = `translate3d(${sx}px,${pty * 20}px,0)`;
      });
      embers.forEach((node, i) => {
        const e = EMBERS[i];
        const sx = wrap((e.x / 100) * fieldW - cam * (1.2 + e.s * 0.9) - ptx * 30);
        node.style.transform = `translate3d(${sx}px,0,0)`;
      });

      // Route HUD
      if (el.fill) el.fill.style.transform = `scaleX(${p})`;
      if (el.marker) el.marker.style.transform = `translate3d(${p * routeW}px,0,0)`;
      if (el.hint) el.hint.style.opacity = String(1 - smooth(clamp(p / 0.04)));
      let best = 0;
      stops.forEach((s, i) => {
        if (Math.abs(s - p) < Math.abs(stops[best] - p)) best = i;
      });
      if (best !== stopIndex && journey[best]) {
        stopIndex = best;
        if (el.stopNum) el.stopNum.textContent = pad2(best + 1);
        if (el.stopName) el.stopName.textContent = journey[best].title;
        dots.forEach((dot, i) => dot.toggleAttribute('data-active', i <= best));
      }
      snapSky = false;
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      frameDt = dt;
      readScroll();
      if (snap) {
        cam = camTarget;
        snap = false;
      } else {
        cam += (camTarget - cam) * (1 - Math.exp(-dt / 55));
      }
      ptx += (px - ptx) * (1 - Math.exp(-dt / 140));
      pty += (py - pty) * (1 - Math.exp(-dt / 140));
      apply();
      const settled =
        !skyMoving &&
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
      snapSky = true;
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
            snapSky = true;
      snapSky = true;
            kick();
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
      section.style.marginLeft = '';
      section.style.marginRight = '';
    };
  }, [journey]);

  let n = 0;

  return (
    <section ref={sectionRef} className={className} aria-labelledby={TITLE_ID} data-no-reveal>
      <div ref={stageRef} className={styles.stage}>
        <div className={styles.scene} data-l="scene" aria-hidden="true">
          {SKIES.map((name, i) => (
            <div key={name} className={`${styles.sky} ${styles[name]}`} data-l={`sky-${i}`} />
          ))}
          <div className={styles.stars} data-l="stars">
            <Stars />
          </div>
          <div className={styles.sun} data-l="sun" />
          <div className={styles.moon} data-l="moon" />
          <div className={styles.clouds} data-l="clouds-far">
            {CLOUDS_FAR.map((c, i) => (
              <span
                key={i}
                className={styles.cloud}
                style={
                  {
                    left: `${c.x * 2.2}%`,
                    top: `${8 + c.y * 34}%`,
                    '--cw2': `${180 + c.s * 260}px`,
                    '--o': 0.25 + c.o * 0.35,
                    '--delay': `${-c.t * 40}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className={styles.glow} data-l="glow" />
          <div className={styles.ridge} data-l="ridge">
            <FarRidge />
          </div>
          <div className={styles.city} data-l="city" />
          {journey.map((chapter) => (
            <div key={chapter.id} className={styles.backdrop} data-sprite="backdrop" data-mark={chapter.landmark}>
              <Backdrop id={chapter.landmark} />
            </div>
          ))}
          <div className={styles.haze} data-l="haze" />
          <div className={styles.water} data-l="water">
            <div className={styles.waterGlow} data-l="water-glow" />
            <div className={styles.waterGlint} data-l="water-glint" style={{ backgroundImage: waterTile }} />
          </div>
          <div className={styles.hills} data-l="hills">
            <Hills />
          </div>
          {journey.map((chapter) => (
            <div key={chapter.id} className={styles.landmark} data-sprite="landmark" data-mark={chapter.landmark}>
              <Landmark id={chapter.landmark} />
            </div>
          ))}
          <div className={styles.fog} data-l="fog">
            {FOG.map((c, i) => (
              <span
                key={i}
                className={styles.fogPuff}
                style={
                  {
                    left: `${c.x * 3}%`,
                    bottom: `${c.y * 55}%`,
                    '--fw': `${40 + c.s * 50}vw`,
                    '--o': 0.45 + c.o * 0.45,
                    '--delay': `${-c.t * 30}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className={styles.ground} />
          <div className={`${styles.clouds} ${styles.cloudsNear}`} data-l="clouds-near">
            {CLOUDS_NEAR.map((c, i) => (
              <span
                key={i}
                className={styles.cloud}
                style={
                  {
                    left: `${c.x * 3.4}%`,
                    top: `${4 + c.y * 22}%`,
                    '--cw2': `${320 + c.s * 360}px`,
                    '--o': 0.18 + c.o * 0.22,
                    '--delay': `${-c.t * 40}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>

        <div className={styles.plane} data-l="cards">
          <div className={styles.block} data-sprite="block" data-block="intro">
            <Intro />
            <p className={styles.hint} data-l="hint" aria-hidden="true">
              <span>Scroll</span>
              <svg viewBox="0 0 40 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M0 6h37M32 1l5 5-5 5" />
              </svg>
            </p>
          </div>
          {journey.map((chapter) => (
            <div
              key={chapter.id}
              className={styles.group}
              role="group"
              aria-labelledby={`travel-${chapter.id}`}
            >
              <h3 className={styles.srOnly} id={`travel-${chapter.id}`}>
                {chapter.title}. {chapter.blurb}
              </h3>
              {chapter.photos.map((photo) => {
                n += 1;
                return (
                  <figure
                    key={photo.id}
                    className={styles.card}
                    data-sprite="card"
                    data-src={photo.thumb}
                    style={cardStyle(photo)}
                  >
                    <div className={styles.frame}>
                      <img
                        alt={photo.alt}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className={styles.dim} data-dim="" aria-hidden="true" />
                      <span className={styles.cover} data-cover="" aria-hidden="true" />
                    </div>
                    {photo.caption && (
                      <figcaption className={styles.caption}>
                        <span className={styles.captionNum} aria-hidden="true">
                          {pad2(n)}
                        </span>
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          ))}
          {journey.map((chapter, i) => (
            <div key={chapter.id} className={styles.title} data-sprite="title" aria-hidden="true">
              <span className={styles.titleNum}>
                {pad2(i + 1)} / {pad2(journey.length)}
              </span>
              <span className={styles.titleText} data-head="">
                {chapter.title}
              </span>
              <span className={styles.titleBlurb} data-blurb="">
                {chapter.blurb}
              </span>
            </div>
          ))}
          <div className={`${styles.block} ${styles.outro}`} data-sprite="block" data-block="outro">
            <Outro />
          </div>
        </div>

        <div className={styles.near} data-l="near" aria-hidden="true">
          <div className={styles.fore} data-l="fore" style={{ backgroundImage: foregroundTile }} />
          {BOKEH.map((b, i) => (
            <span
              key={i}
              className={styles.bokeh}
              data-bokeh=""
              style={
                {
                  top: `${10 + b.y * 70}%`,
                  '--bs': `${90 + b.s * 170}px`,
                  '--o': 0.25 + b.o * 0.4,
                } as CSSProperties
              }
            />
          ))}
          {EMBERS.map((e, i) => (
            <span
              key={i}
              className={styles.ember}
              data-ember=""
              style={{ top: `${30 + e.y * 60}%` }}
            >
              <span
                style={
                  {
                    '--es': `${2 + e.s * 3}px`,
                    '--delay': `${-e.t * 9}s`,
                    '--dur': `${6 + e.o * 6}s`,
                  } as CSSProperties
                }
              />
            </span>
          ))}
          <div className={styles.vignette} />
        </div>

        <div className={styles.hud} data-l="hud" aria-hidden="true">
          <span className={styles.stop}>
            <span className={styles.stopLabel}>Stop</span>
            <span data-l="stop-num">01</span>
            <span className={styles.stopOf}>/ {pad2(journey.length)}</span>
          </span>
          <span className={styles.stopName} data-l="stop-name">
            {journey[0]?.title}
          </span>
          <span className={styles.route} data-l="route">
            <span className={styles.routeFill} data-l="route-fill" />
            {journey.map((chapter) => (
              <span key={chapter.id} className={styles.routeDot} data-stop="" />
            ))}
            <span className={styles.routeMarker} data-l="route-marker">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)" />
              </svg>
            </span>
          </span>
          <span className={styles.count}>{total} photos</span>
        </div>

        <div className={`${styles.feather} ${styles.featherTop}`} data-l="feather-top" aria-hidden="true" />
        <div className={`${styles.feather} ${styles.featherBottom}`} data-l="feather-bottom" aria-hidden="true" />
      </div>
    </section>
  );
};

// Reduced motion: the same trip, laid out flat and still

const StillJourney: FC<{ journey: ChapterWithPhotos[]; className: string }> = ({
  journey,
  className,
}) => {
  let n = 0;
  return (
    <section className={className} aria-labelledby={TITLE_ID} data-no-reveal>
      <div className={styles.stillHero}>
        <div className={styles.scene} aria-hidden="true">
          <div className={`${styles.sky} ${styles.skyDusk}`} />
          <div className={styles.stars}>
            <Stars twinkle={false} />
          </div>
          <div className={styles.moon} />
          <div className={styles.glow} />
          <div className={styles.city} />
          <div className={styles.backdrop} data-mark="skyline">
            <Backdrop id="skyline" />
          </div>
          <div className={styles.haze} />
          <div className={styles.water}>
            <div className={styles.waterGlow} />
            <div className={styles.waterGlint} style={{ backgroundImage: waterTile }} />
          </div>
          <div className={styles.landmark} data-mark="skyline">
            <Landmark id="skyline" />
          </div>
          <div className={styles.ground} />
          <div className={styles.fore} style={{ backgroundImage: foregroundTile }} />
          <div className={styles.vignette} />
        </div>
        <div className={styles.stillIntro}>
          <Intro />
        </div>
      </div>

      {journey.map((chapter, i) => (
        <div
          key={chapter.id}
          className={styles.stillChapter}
          role="group"
          aria-labelledby={`travel-still-${chapter.id}`}
        >
          <header className={styles.stillHead}>
            <span className={styles.titleNum}>
              {pad2(i + 1)} / {pad2(journey.length)}
            </span>
            <h3 className={styles.stillTitle} id={`travel-still-${chapter.id}`}>
              {chapter.title}
            </h3>
            <p className={styles.titleBlurb}>{chapter.blurb}</p>
          </header>
          <div className={styles.stillGrid}>
            {chapter.photos.map((photo, j) => {
              n += 1;
              return (
                <figure
                  key={photo.id}
                  className={styles.card}
                  style={cardStyle(photo, { '--tilt': `${j % 2 ? 1.2 : -1.2}deg` })}
                >
                  <div className={styles.frame}>
                    <img
                      src={photo.thumb}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  {photo.caption && (
                    <figcaption className={styles.caption}>
                      <span className={styles.captionNum} aria-hidden="true">
                        {pad2(n)}
                      </span>
                      {photo.caption}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      ))}

      <div className={styles.stillOutro}>
        <Outro />
      </div>
    </section>
  );
};
