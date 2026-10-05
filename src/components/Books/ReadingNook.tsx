import { FC, useEffect, useRef, useState } from 'react';
import styles from './ReadingNook.module.css';

interface ReadingNookProps {
  /** Wide scenes frame the whole room; narrow ones crop in on the chair. */
  compact: boolean;
  onBrowse: () => void;
}

// Deterministic scatter so the rain and the little shelf look the same every render.
const rand = (seed: number) => {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x);
};

const RAIN = Array.from({ length: 46 }, (_, i) => ({
  x: 100 + rand(i + 1) * 280,
  y: rand(i + 50) * 300,
  len: 12 + rand(i + 99) * 14,
  o: 0.18 + rand(i + 7) * 0.3,
}));

const SHELF_COLOURS = ['#5a1d15', '#1f3a2a', '#2a3552', '#6b4a1c', '#4a2440', '#23393a', '#7a2e1c'];
const SHELF_ROWS = [178, 258, 338, 418].map((base, row) => {
  let x = 966;
  const books: { x: number; w: number; h: number; c: string; lean: boolean }[] = [];
  let i = 0;
  while (x < 1110) {
    const w = 9 + Math.round(rand(row * 31 + i) * 7);
    const h = 44 + Math.round(rand(row * 17 + i + 3) * 20);
    const lean = rand(row * 7 + i + 11) > 0.9;
    books.push({ x, w, h, c: SHELF_COLOURS[(row * 3 + i) % SHELF_COLOURS.length], lean });
    x += w + 1 + (lean ? 6 : 0);
    i += 1;
  }
  return { base, books: books.filter((b) => b.x + b.w < 1122) };
});

const MOTES = [
  { cx: 790, cy: 300, d: 0 },
  { cx: 820, cy: 360, d: -3 },
  { cx: 760, cy: 250, d: -6 },
  { cx: 850, cy: 330, d: -9 },
  { cx: 805, cy: 420, d: -4.5 },
  { cx: 740, cy: 330, d: -7.5 },
];

export const ReadingNook: FC<ReadingNookProps> = ({ compact, onBrowse }) => {
  const rootRef = useRef<HTMLElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  // Only animate while the nook is actually on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={rootRef}
      className={`${styles.nook} ${onScreen ? '' : styles.paused}`}
      aria-labelledby="reading-nook-title"
      data-library-scene
    >
      <div className={styles.stage}>
        <svg
          className={styles.scene}
          viewBox={compact ? '220 130 600 470' : '0 0 1200 600'}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="A bald, bearded man lounges in a leather armchair with his feet up, reading by lamplight while rain falls outside and his dog sleeps on the rug."
        >
          <defs>
            <linearGradient id="nk-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#140d07" />
              <stop offset="0.55" stopColor="#241810" />
              <stop offset="1" stopColor="#1a110a" />
            </linearGradient>
            <linearGradient id="nk-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#141a33" />
              <stop offset="0.45" stopColor="#2c2a47" />
              <stop offset="0.78" stopColor="#6a3f3c" />
              <stop offset="1" stopColor="#b8683a" />
            </linearGradient>
            <radialGradient id="nk-lamp" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffc774" stopOpacity="0.5" />
              <stop offset="0.45" stopColor="#ffb45e" stopOpacity="0.16" />
              <stop offset="1" stopColor="#ffb45e" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="nk-cone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd894" stopOpacity="0.32" />
              <stop offset="1" stopColor="#ffd894" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="nk-leather" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7a2a1c" />
              <stop offset="1" stopColor="#3e130c" />
            </linearGradient>
            <linearGradient id="nk-leather-arm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8a3322" />
              <stop offset="0.5" stopColor="#5e1f14" />
              <stop offset="1" stopColor="#3a120b" />
            </linearGradient>
            <linearGradient id="nk-sweater" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2c4632" />
              <stop offset="1" stopColor="#3f6146" />
            </linearGradient>
            <radialGradient id="nk-skin" cx="0.75" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#e3a672" />
              <stop offset="0.55" stopColor="#b8784e" />
              <stop offset="1" stopColor="#8a5534" />
            </radialGradient>
            <linearGradient id="nk-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a1a0d" />
              <stop offset="1" stopColor="#120a05" />
            </linearGradient>
            <radialGradient id="nk-vignette" cx="0.55" cy="0.55" r="0.75">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.75" />
            </radialGradient>
            <clipPath id="nk-glass">
              <path d="M112 338 V150 A128 80 0 0 1 368 150 V338 Z" />
            </clipPath>
          </defs>

          {/* Room */}
          <rect width="1200" height="600" fill="url(#nk-wall)" />
          <g opacity="0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1={i * 104} y1="0" x2={i * 104} y2="370" stroke="#000" strokeOpacity="0.25" strokeWidth="2" />
            ))}
          </g>
          <rect y="372" width="1200" height="128" fill="#1a1009" />
          <rect y="366" width="1200" height="8" fill="#3a2614" />
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={i}
              x={20 + i * 150}
              y="392"
              width="126"
              height="88"
              rx="2"
              fill="none"
              stroke="#2e1d0f"
              strokeWidth="3"
            />
          ))}

          {/* Lamp glow washes the wall */}
          <ellipse className={styles.glow} cx="820" cy="300" rx="430" ry="330" fill="url(#nk-lamp)" />

          {/* Window: dusk and rain */}
          <g clipPath="url(#nk-glass)">
            <rect x="100" y="60" width="280" height="290" fill="url(#nk-sky)" />
            <circle cx="300" cy="118" r="1.4" fill="#f3ead3" opacity="0.7" />
            <circle cx="170" cy="140" r="1.1" fill="#f3ead3" opacity="0.5" />
            <circle cx="232" cy="96" r="1" fill="#f3ead3" opacity="0.6" />
            <path d="M100 300 Q150 270 200 292 T300 282 T380 290 V350 H100 Z" fill="#241a2a" />
            <path d="M100 322 Q170 300 240 318 T380 312 V350 H100 Z" fill="#150f18" />
            <g fill="#f0b25a" opacity="0.8">
              <rect x="150" y="318" width="3" height="4" />
              <rect x="206" y="312" width="3" height="4" />
              <rect x="318" y="316" width="3" height="4" />
            </g>
            <g className={styles.rain}>
              {[0, -300].map((dy) => (
                <g key={dy} transform={`translate(0 ${dy})`}>
                  {RAIN.map((r, i) => (
                    <line
                      key={i}
                      x1={r.x}
                      y1={r.y + 60}
                      x2={r.x - 3}
                      y2={r.y + 60 + r.len}
                      stroke="#c9d4ec"
                      strokeOpacity={r.o}
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              ))}
            </g>
            <circle className={`${styles.drip} ${styles.dripA}`} cx="180" cy="170" r="2.4" fill="#dfe6f5" opacity="0.5" />
            <circle className={`${styles.drip} ${styles.dripB}`} cx="300" cy="210" r="2" fill="#dfe6f5" opacity="0.45" />
          </g>
          <path
            d="M112 338 V150 A128 80 0 0 1 368 150 V338 Z"
            fill="none"
            stroke="#3a2614"
            strokeWidth="12"
          />
          <line x1="240" y1="72" x2="240" y2="338" stroke="#3a2614" strokeWidth="7" />
          <line x1="112" y1="206" x2="368" y2="206" stroke="#3a2614" strokeWidth="6" />
          <line x1="112" y1="272" x2="368" y2="272" stroke="#3a2614" strokeWidth="6" />
          <rect x="94" y="336" width="292" height="14" rx="2" fill="#4a2f18" />
          <rect x="94" y="348" width="292" height="4" fill="#1a1008" />
          {/* Curtains */}
          <path d="M70 52 H124 Q112 200 128 350 Q100 360 74 352 Q84 200 70 52 Z" fill="#5a1d15" />
          <path d="M84 60 Q94 200 88 350" stroke="#3a0f0b" strokeWidth="4" fill="none" />
          <path d="M104 60 Q112 210 108 352" stroke="#7a2a1c" strokeWidth="3" fill="none" opacity="0.6" />
          <path d="M356 52 H410 Q396 200 406 352 Q380 360 352 350 Q368 200 356 52 Z" fill="#5a1d15" />
          <path d="M372 60 Q380 210 374 350" stroke="#7a2a1c" strokeWidth="3" fill="none" opacity="0.6" />
          <path d="M392 60 Q386 200 394 352" stroke="#3a0f0b" strokeWidth="4" fill="none" />
          <rect x="56" y="44" width="370" height="10" rx="5" fill="#8a6a24" />
          <circle cx="56" cy="49" r="8" fill="#d4a84b" />
          <circle cx="426" cy="49" r="8" fill="#d4a84b" />

          {/* A little framed crest above the chair */}
          <g>
            <rect x="534" y="108" width="92" height="104" rx="2" fill="#6e5019" />
            <rect x="542" y="116" width="76" height="88" fill="#1c1a24" />
            <path
              d="M580 128 L604 136 V160 Q604 184 580 194 Q556 184 556 160 V136 Z"
              fill="#2a3552"
              stroke="#d4a84b"
              strokeWidth="2"
            />
            <path d="M580 142 V182 M566 160 H594" stroke="#d4a84b" strokeWidth="2.5" />
            <line x1="580" y1="92" x2="552" y2="108" stroke="#6e5019" strokeWidth="1.5" />
            <line x1="580" y1="92" x2="608" y2="108" stroke="#6e5019" strokeWidth="1.5" />
            <circle cx="580" cy="92" r="2.5" fill="#d4a84b" />
          </g>

          {/* Bookshelf on the right wall */}
          <g>
            <rect x="950" y="120" width="186" height="380" fill="#1f130a" />
            <rect x="950" y="120" width="186" height="380" fill="none" stroke="#3d2714" strokeWidth="10" />
            <rect x="938" y="108" width="210" height="14" rx="2" fill="#4a2f18" />
            {SHELF_ROWS.map(({ base, books }) => (
              <g key={base}>
                {books.map((b, i) => (
                  <rect
                    key={i}
                    x={b.x}
                    y={base - b.h}
                    width={b.w}
                    height={b.h}
                    fill={b.c}
                    transform={b.lean ? `rotate(-10 ${b.x + b.w} ${base})` : undefined}
                  />
                ))}
                {books.map((b, i) =>
                  i % 3 === 0 ? (
                    <rect key={`g${i}`} x={b.x + 1} y={base - b.h + 6} width={b.w - 2} height="2" fill="#d4a84b" opacity="0.6" />
                  ) : null
                )}
                <rect x="955" y={base} width="176" height="8" fill="#3d2714" />
              </g>
            ))}
            <path d="M975 480 Q990 440 1000 480 Z" fill="#2f4a36" />
            <rect x="1060" y="452" width="46" height="28" rx="3" fill="#6e5019" />
          </g>

          {/* Floor and rug */}
          <rect y="496" width="1200" height="8" fill="#2e1d0f" />
          <rect y="502" width="1200" height="98" fill="url(#nk-floor)" />
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={i * 150 - 40} y1="504" x2={i * 150 - 90} y2="600" stroke="#000" strokeOpacity="0.3" />
          ))}
          <ellipse cx="560" cy="552" rx="330" ry="40" fill="#4a1712" />
          <ellipse cx="560" cy="552" rx="310" ry="33" fill="none" stroke="#d4a84b" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="6 8" />
          <ellipse cx="560" cy="552" rx="200" ry="20" fill="#5a1d15" />

          {/* Floor lamp and its cone of light */}
          <path className={styles.cone} d="M806 228 L894 228 L1010 500 L690 500 Z" fill="url(#nk-cone)" />
          <ellipse cx="850" cy="498" rx="34" ry="7" fill="#6e5019" />
          <rect x="847" y="222" width="6" height="276" fill="#b48a3c" />
          <path d="M806 230 L894 230 L878 170 L822 170 Z" fill="#d9b36a" />
          <path d="M806 230 L894 230 L878 170 L822 170 Z" fill="#fff0c4" opacity="0.35" className={styles.shade} />
          <rect x="804" y="226" width="92" height="6" rx="2" fill="#8a6a24" />
          <ellipse cx="850" cy="232" rx="40" ry="5" fill="#fff4d0" opacity="0.8" />
          <g className={styles.motes}>
            {MOTES.map((m, i) => (
              <circle
                key={i}
                className={styles.mote}
                style={{ animationDelay: `${m.d}s` }}
                cx={m.cx}
                cy={m.cy}
                r="1.6"
                fill="#ffe7b0"
              />
            ))}
          </g>

          {/* Side table, mug, steam */}
          <rect x="752" y="404" width="10" height="92" fill="#2c1b0d" />
          <ellipse cx="757" cy="496" rx="30" ry="5" fill="#2c1b0d" />
          <ellipse cx="757" cy="402" rx="50" ry="9" fill="#4a2f18" />
          <rect x="707" y="400" width="100" height="6" fill="#3a2412" />
          <rect x="776" y="382" width="26" height="8" fill="#1f3a2a" />
          <rect x="772" y="374" width="30" height="8" fill="#5a1d15" />
          <path d="M734 368 H758 V392 Q758 398 752 398 H740 Q734 398 734 392 Z" fill="#e8dcc0" />
          <path d="M758 374 Q768 374 768 382 Q768 390 758 389" fill="none" stroke="#e8dcc0" strokeWidth="4" />
          <rect x="734" y="376" width="24" height="3" fill="#8a3322" />
          <ellipse cx="746" cy="368" rx="12" ry="2.5" fill="#3a2010" />
          <g className={styles.steam} fill="none" stroke="#f3ead3" strokeLinecap="round" strokeWidth="3">
            <path className={styles.wisp} d="M742 362 C736 350 748 342 742 330 C736 318 746 312 742 302" />
            <path className={`${styles.wisp} ${styles.wispB}`} d="M750 362 C756 350 744 340 750 328 C756 316 746 310 750 300" />
          </g>

          {/* Armchair back */}
          <path d="M644 474 L648 300 Q652 228 700 228 Q732 230 724 292 L714 474 Z" fill="url(#nk-leather)" />
          <path d="M660 300 Q664 248 698 244" fill="none" stroke="#a5452c" strokeOpacity="0.5" strokeWidth="3" />

          {/* The reader */}
          <g className={styles.breathe}>
            {/* far arm */}
            <path d="M672 336 Q640 360 628 388 Q600 380 566 370" fill="none" stroke="#243a2a" strokeWidth="20" strokeLinecap="round" />
            {/* torso */}
            <path d="M596 446 Q588 392 616 356 Q630 330 652 322 L688 326 Q702 384 700 446 Z" fill="url(#nk-sweater)" />
            <path d="M612 360 Q640 350 664 356" stroke="#243a2a" strokeWidth="2" fill="none" opacity="0.7" />
            <path d="M604 392 Q640 384 690 392" stroke="#243a2a" strokeWidth="2" fill="none" opacity="0.6" />
            {/* neck and head */}
            <path d="M652 312 L682 314 L688 332 L652 330 Z" fill="#8a5534" />
            <path
              className={styles.head}
              d="M684 316 C702 292 698 256 664 252 C644 250 634 264 634 280 L632 288 C632 291 636 292 635 295 L625 303 C624 306 628 307 633 307 L640 314 L674 320 Z"
              fill="url(#nk-skin)"
            />
            <ellipse cx="672" cy="291" rx="5" ry="8" fill="#a0643e" />
            {/* beard */}
            <path
              d="M668 280 C672 296 666 308 650 310 C642 311 636 308 632 309 C626 318 628 334 640 342 C652 350 672 344 680 330 C688 314 684 292 676 282 Z"
              fill="#20140c"
            />
            <path d="M640 334 Q650 340 664 336 M646 324 Q656 330 668 324" stroke="#3a2618" strokeWidth="1.5" fill="none" />
            <path d="M632 308 C637 303 645 304 650 309 C643 312 636 312 632 308 Z" fill="#150c06" />
            <path d="M637 283 Q645 278 654 282" stroke="#20140c" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <path className={styles.eye} d="M640 291 Q645 294 650 291" stroke="#20140c" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M660 262 Q676 258 688 272" stroke="#ffd7a0" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>

          {/* legs out to the footstool, ankles crossed */}
          <rect x="286" y="458" width="136" height="24" rx="10" fill="url(#nk-leather-arm)" />
          <rect x="292" y="480" width="124" height="14" fill="#3a120b" />
          <rect x="298" y="492" width="8" height="8" fill="#1a0f08" />
          <rect x="402" y="492" width="8" height="8" fill="#1a0f08" />
          <path d="M600 414 L470 420 L356 438 L358 456 L470 444 L600 446 Z" fill="#232a3a" />
          <g className={styles.footFar}>
            <path d="M362 436 L358 458 C352 462 344 460 340 454 C334 440 334 424 340 416 C346 410 354 414 356 424 Z" fill="#7a2e1c" />
          </g>
          <path d="M600 424 L470 432 L350 452 L353 472 L470 458 L600 456 Z" fill="#2c3448" />
          <g className={styles.foot}>
            <path d="M356 450 L354 474 C348 478 338 476 334 470 C328 454 326 434 332 424 C338 418 347 422 349 432 Z" fill="#9a3a24" />
            <path d="M334 468 C338 474 348 476 354 472" stroke="#e8dcc0" strokeWidth="4" fill="none" />
          </g>

          {/* seat and the near arm of the chair */}
          <path d="M516 440 H712 V486 H516 Z" fill="#4e1a10" />
          <rect x="524" y="484" width="10" height="16" fill="#1a0f08" />
          <rect x="694" y="484" width="10" height="16" fill="#1a0f08" />
          <path d="M508 446 Q498 400 534 394 H664 Q680 394 680 412 V446 Z" fill="url(#nk-leather-arm)" />
          <circle cx="530" cy="420" r="20" fill="#5e1f14" />
          <circle cx="530" cy="420" r="11" fill="none" stroke="#3a120b" strokeWidth="3" />
          <path d="M538 400 H660" stroke="#b0523a" strokeOpacity="0.45" strokeWidth="2" />

          {/* near arm resting on the chair arm, hands on the book */}
          <g className={styles.breathe}>
            <path d="M672 338 Q660 376 640 394 Q618 392 598 378" fill="none" stroke="#1c2e21" strokeWidth="26" strokeLinecap="round" />
            <path d="M672 338 Q660 376 640 394 Q618 392 598 378" fill="none" stroke="#3f6146" strokeWidth="21" strokeLinecap="round" />
            <path d="M662 356 Q654 378 640 388" fill="none" stroke="#56785c" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
            {/* the book */}
            <path d="M580 386 L542 374 L532 336 L572 346 Z" fill="#5a1d15" />
            <path d="M580 386 L610 370 L608 330 L572 346 Z" fill="#5a1d15" />
            <path d="M578 382 L546 371 L537 339 L572 348 Z" fill="#efe3c6" />
            <path d="M578 382 L606 367 L604 334 L572 348 Z" fill="#e2d2ad" />
            <g stroke="#8a6a44" strokeOpacity="0.5" strokeWidth="1">
              <line x1="545" y1="348" x2="566" y2="354" />
              <line x1="547" y1="355" x2="568" y2="361" />
              <line x1="549" y1="362" x2="570" y2="368" />
              <line x1="584" y1="352" x2="600" y2="344" />
              <line x1="585" y1="359" x2="601" y2="351" />
              <line x1="586" y1="366" x2="602" y2="358" />
            </g>
            <path className={styles.page} d="M578 382 L606 367 L604 334 L572 348 Z" fill="#f6ecd4" />
            <circle cx="600" cy="376" r="8" fill="url(#nk-skin)" />
            <circle cx="548" cy="374" r="7" fill="#9a6040" />
          </g>

          {/* The dog, fast asleep */}
          <g className={styles.dog}>
            <path
              d="M520 518 C520 540 470 558 470 540 C470 530 490 522 508 520 Z"
              fill="#8a5a30"
              className={styles.tail}
            />
            <g className={styles.dogBody}>
              <ellipse cx="560" cy="546" rx="62" ry="22" fill="#b07a45" />
              <ellipse cx="572" cy="538" rx="34" ry="10" fill="#c98f58" opacity="0.7" />
              <ellipse cx="596" cy="556" rx="26" ry="11" fill="#f1e4cc" />
            </g>
            <ellipse cx="630" cy="560" rx="22" ry="6" fill="#f1e4cc" />
            <path d="M606 546 C610 530 634 526 646 536 C656 544 654 558 640 560 L614 560 Z" fill="#b07a45" />
            <path d="M636 542 C648 544 660 550 658 558 C650 562 638 560 632 556 Z" fill="#f1e4cc" />
            <path className={styles.ear} d="M618 536 C608 540 604 556 612 562 C620 560 624 548 622 538 Z" fill="#6e4222" />
            <path d="M640 544 Q644 546 648 544" stroke="#2a1a0c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <circle cx="659" cy="554" r="2.6" fill="#1a0f08" />
          </g>

          <rect width="1200" height="600" fill="url(#nk-vignette)" pointerEvents="none" />
        </svg>
      </div>

      <div className={styles.caption}>
        <div>
          <p className={styles.kicker}>After hours</p>
          <h2 id="reading-nook-title" className={styles.title}>
            Pull up a chair
          </h2>
          <p className={styles.copy}>
            Most evenings end right here. Feet up, a mug going cold, rain on the glass and a book
            I have probably read twice already. The shelves are just below. Grab anything, just put
            it back where you found it.
          </p>
        </div>
        <button type="button" className={styles.browse} onClick={onBrowse}>
          Browse the shelves
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </section>
  );
};

export default ReadingNook;
