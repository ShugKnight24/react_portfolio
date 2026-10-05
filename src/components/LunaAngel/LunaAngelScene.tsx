import { FC, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { usePauseOffscreen } from '../../utils/usePauseOffscreen';
import styles from './LunaAngelScene.module.css';

interface HeartParticle {
  id: number;
  x: number;
  y: number;
  icon: string;
}

type Pose = 'sitting' | 'napping' | 'treat';

const poses: ReadonlyArray<{ id: Pose; label: string }> = [
  { id: 'sitting', label: 'Sitting' },
  { id: 'napping', label: 'Napping' },
  { id: 'treat', label: 'Treat time' },
];

const LIKENESS =
  'a large lean fawn dog with a cream chest and paws, a greying muzzle, black nose and big flyaway ears';
const FLOWERS = 'red and white roses and forget-me-nots rest at her feet beside a small candle';

const poseLabels: Record<Pose, string> = {
  sitting: `Illustration of Luna, ${LIKENESS}, with amber eyes, sitting on a cloud with soft white wings and a thin gold halo. ${FLOWERS}.`,
  napping: `Illustration of Luna, ${LIKENESS}, curled up napping on a cloud with her nose tucked, her wings folded and a thin gold halo glowing softly. ${FLOWERS}.`,
  treat: `Illustration of Luna, ${LIKENESS}, lying on a cloud happily chewing a bully stick held between her front paws, tail wagging, wings half folded under a thin gold halo. ${FLOWERS}.`,
};

const sweetQuotes = [
  "You're doing great. Keep going.",
  'Still watching over every line of code.',
  'Best girl loves you, always.',
  'Sending good-code vibes from up here.',
  'Tail wags and starlight, all for you.',
  'Brightest star in the whole sky.',
  'Treat received. Tail wags activated.',
];

const EXCITED_MS = 2400;
const PARTICLE_MS = 1800;
const TREAT_POSE_MS = 6000;

/* Soft, sparse stars: [x, y, radius, opacity] */
const stars: ReadonlyArray<readonly [number, number, number, number]> = [
  [48, 46, 1.1, 0.7],
  [112, 118, 0.8, 0.5],
  [86, 262, 1, 0.45],
  [168, 34, 0.7, 0.55],
  [214, 82, 1.2, 0.6],
  [404, 40, 0.9, 0.6],
  [470, 96, 1.3, 0.7],
  [548, 58, 0.8, 0.5],
  [572, 196, 1, 0.45],
  [520, 290, 0.7, 0.4],
  [34, 356, 0.8, 0.35],
  [584, 372, 0.9, 0.35],
];

type Feather = readonly [number, number, number];

/* Left wing feathers, pivoting at the shoulder: [angle deg, scale, opacity] */
const wingFeathers: ReadonlyArray<Feather> = [
  [-128, 0.92, 0.8],
  [-142, 1.08, 0.86],
  [-156, 1.16, 0.92],
  [-170, 1.08, 0.96],
  [-184, 0.9, 1],
  /* shorter covert feathers layered over the base */
  [-138, 0.62, 0.95],
  [-156, 0.66, 1],
  [-174, 0.58, 1],
];

/* Folded wing lying along the back toward the tail */
const foldedFeathers: ReadonlyArray<Feather> = [
  [-2, 0.86, 0.86],
  [-9, 0.96, 0.92],
  [-16, 0.9, 0.96],
  [-6, 0.6, 1],
  [-14, 0.54, 1],
];

const Feathers: FC<{
  x: number;
  y: number;
  list: ReadonlyArray<Feather>;
  scale?: number;
  turn?: number;
  fade?: number;
}> = ({ x, y, list, scale = 1, turn = 0, fade = 1 }) => (
  <>
    {list.map(([angle, s, opacity], i) => (
      <use
        key={i}
        href="#lunaFeatherShape"
        fill="url(#lunaFeather)"
        stroke="#d4a84b"
        strokeOpacity="0.28"
        strokeWidth="0.8"
        opacity={opacity * fade}
        transform={`translate(${x} ${y}) rotate(${angle + turn}) scale(${s * scale})`}
      />
    ))}
  </>
);

const Halo: FC<{ x: number; y: number; rx: number; tilt?: number }> = ({ x, y, rx, tilt = 0 }) => {
  const ry = rx * 0.19;
  return (
    <g className={styles.halo} transform={`rotate(${tilt} ${x} ${y})`}>
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        stroke="#d4a84b"
        strokeWidth="6"
        opacity="0.18"
        filter="url(#lunaSofter)"
      />
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        stroke="#e7c16f"
        strokeWidth="2.4"
        filter="url(#lunaHaloGlow)"
      />
    </g>
  );
};

/* Luna's face, drawn front on in its own 600x520 space; poses place it with a transform. */
const LunaHead: FC<{ asleep?: boolean }> = ({ asleep = false }) => (
  <>
    {/* Ears: large, thin, flying out sideways with folded tips */}
    <g className={styles.earLeft}>
      <path
        d="M260 142 C240 126 206 118 176 124 C158 128 144 140 138 156 C136 163 141 167 147 163 C156 157 167 155 178 157 C200 161 224 172 246 182 Z"
        fill="url(#lunaHead)"
      />
      <path
        d="M252 150 C234 137 208 131 186 134 C174 136 164 142 158 149 C174 147 194 151 214 159 C227 164 238 170 246 173 Z"
        fill="url(#lunaEarInner)"
      />
      <path
        d="M176 124 C158 128 144 140 138 156 C136 163 141 167 147 163 C151 151 160 141 174 135 Z"
        fill="#a87a48"
      />
      <path
        d="M140 152 C148 136 162 126 182 122"
        stroke="#f3d38a"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
    </g>
    <g className={styles.earRight}>
      <path
        d="M340 142 C360 126 394 118 424 124 C442 128 456 140 462 156 C464 163 459 167 453 163 C444 157 433 155 422 157 C400 161 376 172 354 182 Z"
        fill="url(#lunaHead)"
      />
      <path
        d="M348 150 C366 137 392 131 414 134 C426 136 436 142 442 149 C426 147 406 151 386 159 C373 164 362 170 354 173 Z"
        fill="url(#lunaEarInner)"
        opacity="0.85"
      />
      <path
        d="M424 124 C442 128 456 140 462 156 C464 163 459 167 453 163 C449 151 440 141 426 135 Z"
        fill="#94683c"
      />
    </g>

    {/* Skull and cheeks */}
    <path
      d="M300 126 C341 126 369 144 373 174 C376 200 364 226 348 242 L252 242 C236 226 224 200 227 174 C231 144 259 126 300 126 Z"
      fill="url(#lunaHead)"
    />
    {/* Darker saddle on top of the head */}
    <ellipse
      cx="300"
      cy="142"
      rx="56"
      ry="18"
      fill="#b0824f"
      opacity="0.75"
      filter="url(#lunaSoft)"
    />
    {/* Rim light from the halo */}
    <path
      d="M254 146 C268 130 332 130 346 146"
      stroke="#f3d38a"
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.5"
      filter="url(#lunaHaloGlow)"
    />
    {/* Faint dark mask around the eyes and down the muzzle bridge */}
    <g filter="url(#lunaSoft)" opacity="0.55">
      <ellipse cx="271" cy="182" rx="18" ry="12" fill="#4a3220" />
      <ellipse cx="329" cy="182" rx="18" ry="12" fill="#4a3220" />
      <path
        d="M282 186 C280 200 276 214 272 226 L280 228 C284 214 288 200 290 188 Z"
        fill="#4a3220"
      />
      <path
        d="M318 186 C320 200 324 214 328 226 L320 228 C316 214 312 200 310 188 Z"
        fill="#4a3220"
      />
    </g>
    {/* Forehead stop */}
    <path
      d="M300 148 C299 160 299 170 300 180"
      stroke="#7a5433"
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.5"
    />

    {/* Long, broad greying muzzle */}
    <path
      d="M268 198 C270 188 284 184 300 184 C316 184 330 188 332 198 L342 246 C344 268 324 282 300 282 C276 282 256 268 258 246 Z"
      fill="url(#lunaMuzzle)"
    />
    <ellipse
      cx="300"
      cy="228"
      rx="20"
      ry="8"
      fill="#ddd8d0"
      opacity="0.7"
      filter="url(#lunaSoft)"
    />
    {/* Lower jaw and lips: this group chews in Treat time */}
    <g className={styles.jaw}>
      <ellipse cx="300" cy="276" rx="26" ry="9" fill="#d6d0c6" />
      <ellipse
        cx="300"
        cy="268"
        rx="34"
        ry="12"
        fill="#e3ded6"
        opacity="0.75"
        filter="url(#lunaSoft)"
      />
      <path
        d="M300 262 L300 269 M300 269 C291 276 274 276 264 266 M300 269 C309 276 326 276 336 266"
        stroke="#3b2a1f"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.7"
      />
      <g fill="#6e6258" opacity="0.5">
        <circle cx="280" cy="266" r="0.9" />
        <circle cx="284" cy="270" r="0.9" />
        <circle cx="320" cy="266" r="0.9" />
        <circle cx="316" cy="270" r="0.9" />
      </g>
    </g>
    {/* Nose */}
    <path
      d="M300 234 C314 234 327 236 327 247 C327 258 313 264 300 264 C287 264 273 258 273 247 C273 236 286 234 300 234 Z"
      fill="#17130f"
    />
    <ellipse cx="289" cy="241" rx="8" ry="3" fill="#6b625a" opacity="0.6" />
    <path
      d="M289 253 C292 256 296 256 298 254 M311 253 C308 256 304 256 302 254"
      stroke="#000"
      strokeWidth="1.4"
      strokeLinecap="round"
    />

    {asleep ? (
      /* Closed, peaceful eyes */
      <g stroke="#2a1a10" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M259 181 C265 188 279 188 285 181" />
        <path d="M315 181 C321 188 335 188 341 181" />
        <path
          d="M262 185 L259 189 M282 185 L285 189 M318 185 L315 189 M338 185 L341 189"
          strokeWidth="1.2"
          opacity="0.6"
        />
      </g>
    ) : (
      /* Soulful amber eyes with a little red haw */
      <g className={styles.eyes}>
        <path
          d="M258 182 C263 172 280 172 286 182 C280 189 265 189 258 182 Z"
          fill="url(#lunaEye)"
        />
        <circle cx="272" cy="181" r="4" fill="#120a05" />
        <circle cx="270.2" cy="179.2" r="1.4" fill="#fff6e6" />
        <path
          d="M259 185 C265 193 280 193 286 185"
          stroke="#b5544a"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M257 181 C263 170 281 170 287 181"
          stroke="#2a1a10"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M314 182 C320 172 337 172 342 182 C335 189 320 189 314 182 Z"
          fill="url(#lunaEye)"
        />
        <circle cx="328" cy="181" r="4" fill="#120a05" />
        <circle cx="326.2" cy="179.2" r="1.4" fill="#fff6e6" />
        <path
          d="M314 185 C320 193 335 193 341 185"
          stroke="#b5544a"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M313 181 C319 170 337 170 343 181"
          stroke="#2a1a10"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
    )}
    {/* Soft brow furrows */}
    <path
      d="M260 167 C267 162 277 162 284 166 M316 166 C323 162 333 162 340 167"
      stroke="#7a5433"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.4"
    />
  </>
);

/* Memorial flowers */

type RoseTone = 'red' | 'white';

const roseColors: Record<
  RoseTone,
  { base: string; petal: string; inner: string; line: string; light: string }
> = {
  red: { base: '#6a101b', petal: '#9e1c2b', inner: '#be2f40', line: '#4f0a13', light: '#e26b77' },
  white: { base: '#c9bda9', petal: '#e9e1d2', inner: '#faf5ec', line: '#a89a84', light: '#ffffff' },
};

const Rose: FC<{ x: number; y: number; s?: number; r?: number; tone: RoseTone }> = ({
  x,
  y,
  s = 1,
  r = 0,
  tone,
}) => {
  const c = roseColors[tone];
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="13" ry="10" fill={c.base} />
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          d="M0 0 C-8 -3 -11 -11 -6 -14 C-2 -16 3 -16 6 -13 C10 -9 7 -3 0 0 Z"
          fill={c.petal}
          stroke={c.line}
          strokeWidth="0.5"
          strokeOpacity="0.5"
          transform={`rotate(${a}) translate(0 -1)`}
        />
      ))}
      <circle cx="0" cy="-1" r="8" fill={c.inner} />
      <path d="M-8 1 C-7 -6 -1 -9 5 -7 C1 -5 -3 -2 -4 3 Z" fill={c.petal} opacity="0.9" />
      <path d="M7 -3 C8 3 3 8 -3 7 C1 5 4 2 4 -2 Z" fill={c.petal} opacity="0.85" />
      <path d="M-3 -3 C0 -5 4 -4 4 -1 C2 -2 -1 -2 -3 0 Z" fill={c.base} opacity="0.55" />
      <path
        d="M-4 3 C-1 5 3 4 5 1"
        stroke={c.line}
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M-9 -6 C-6 -10 -1 -11 3 -10"
        stroke={c.light}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>
  );
};

const Leaf: FC<{ x: number; y: number; r: number; s?: number }> = ({ x, y, r, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path d="M0 0 C6 -6 16 -6 22 0 C16 6 6 6 0 0 Z" fill="#3c5a3a" />
    <path d="M1 0 L20 0" stroke="#27402a" strokeWidth="0.8" strokeLinecap="round" />
  </g>
);

const ForgetMeNot: FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[0, 72, 144, 216, 288].map((a) => (
      <circle key={a} cx="0" cy="-2.6" r="2.3" fill="#86a9dc" transform={`rotate(${a})`} />
    ))}
    <circle r="1.2" fill="#f3d27a" />
  </g>
);

const Stems: FC<{ d: string }> = ({ d }) => (
  <path d={d} stroke="#4a6a45" strokeWidth="1.6" strokeLinecap="round" />
);

const Flowers: FC = () => (
  <g>
    {/* Memorial candle */}
    <g>
      <circle cx="98" cy="428" r="34" fill="url(#lunaCandleGlow)" className={styles.candleGlow} />
      <rect x="90" y="434" width="16" height="30" rx="3" fill="#efe3cc" />
      <ellipse cx="98" cy="434" rx="8" ry="2.4" fill="#f7efdf" />
      <rect x="90" y="434" width="5" height="30" rx="2" fill="#fff8ea" opacity="0.6" />
      <path d="M98 431 L98 427" stroke="#3b2a1f" strokeWidth="1" strokeLinecap="round" />
      <g className={styles.flame}>
        <path d="M98 414 C102 420 103 425 98 429 C93 425 94 420 98 414 Z" fill="#ffc45c" />
        <path d="M98 420 C100 423 100 426 98 428 C96 426 96 423 98 420 Z" fill="#fff1c2" />
      </g>
    </g>

    {/* Left arrangement */}
    <g className={styles.swayLeft}>
      <Stems d="M150 478 C150 464 152 452 156 440 M174 478 C176 466 180 456 186 448 M136 480 C134 470 134 462 136 456" />
      <Leaf x={150} y={462} r={-150} s={0.9} />
      <Leaf x={176} y={466} r={-30} />
      <Leaf x={132} y={470} r={-160} s={0.8} />
      <Leaf x={196} y={470} r={-12} s={0.85} />
      <Rose x={156} y={444} s={1.05} r={-10} tone="red" />
      <Rose x={186} y={452} s={0.95} r={20} tone="white" />
      <Rose x={136} y={460} s={0.78} r={-30} tone="red" />
      <ForgetMeNot x={208} y={464} />
      <ForgetMeNot x={120} y={474} s={0.85} />
      <ForgetMeNot x={170} y={470} s={0.8} />
    </g>

    {/* Right arrangement */}
    <g transform="translate(-18 0)">
      <g className={styles.swayRight}>
        <Stems d="M420 478 C420 466 418 456 416 446 M444 480 C444 470 442 462 440 456 M398 480 C398 470 400 462 402 456" />
        <Leaf x={420} y={464} r={-24} s={0.95} />
        <Leaf x={400} y={468} r={-170} s={0.85} />
        <Leaf x={446} y={470} r={-8} s={0.8} />
        <Rose x={416} y={446} s={1.02} r={12} tone="white" />
        <Rose x={442} y={458} s={0.86} r={-16} tone="red" />
        <Rose x={396} y={460} s={0.82} r={28} tone="red" />
        <ForgetMeNot x={376} y={468} />
        <ForgetMeNot x={460} y={472} s={0.8} />
        <ForgetMeNot x={426} y={472} s={0.75} />
      </g>
    </g>

    {/* Low mist that swallows the stem ends */}
    <g opacity="0.8">
      <ellipse cx="160" cy="484" rx="70" ry="9" fill="#cfc6b6" filter="url(#lunaSoft)" />
      <ellipse cx="402" cy="486" rx="66" ry="9" fill="#cfc6b6" filter="url(#lunaSoft)" />
    </g>
  </g>
);

/* Poses */

const SittingLuna: FC = () => (
  <>
    {/* Wings */}
    <g className={styles.wingLeft} style={{ transformOrigin: '258px 300px' }}>
      <Feathers x={258} y={300} list={wingFeathers} />
    </g>
    <g transform="translate(600 0) scale(-1 1)">
      <g className={styles.wingRight} style={{ transformOrigin: '258px 300px' }}>
        <Feathers x={258} y={300} list={wingFeathers} fade={0.92} />
      </g>
    </g>

    {/* Tail, curling round the right haunch with an upward tip */}
    <g className={styles.tail}>
      <path
        d="M392 440 C426 458 470 456 494 438 C508 427 514 410 510 394"
        stroke="#b98b55"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M396 436 C428 450 466 449 488 434"
        stroke="#dcb47f"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </g>

    {/* Haunches seen from the front */}
    <ellipse cx="236" cy="404" rx="50" ry="50" fill="url(#lunaCoat)" />
    <ellipse cx="364" cy="404" rx="50" ry="50" fill="url(#lunaCoat)" />
    <ellipse
      cx="372"
      cy="410"
      rx="38"
      ry="40"
      fill="#8f6538"
      opacity="0.28"
      filter="url(#lunaSoft)"
    />
    <ellipse cx="206" cy="452" rx="26" ry="10" fill="#e8dac0" />
    <ellipse cx="394" cy="452" rx="26" ry="10" fill="#dccbad" />

    {/* Neck and deep chest, tucked toward the waist */}
    <path
      d="M254 222 C248 252 240 278 234 300 C222 334 222 374 234 414 L366 414 C378 374 378 334 366 300 C360 278 352 252 346 222 Z"
      fill="url(#lunaCoat)"
    />
    <path
      d="M340 240 C352 280 368 320 368 370 C368 392 362 408 356 414 L366 414 C378 374 378 334 366 300 C360 278 352 252 346 222 Z"
      fill="#8f6538"
      opacity="0.35"
      filter="url(#lunaSoft)"
    />

    {/* Cream throat and chest bib */}
    <path
      d="M268 250 C282 266 318 266 332 250 C346 282 352 322 346 362 C338 402 322 430 300 440 C278 430 262 402 254 362 C248 322 254 282 268 250 Z"
      fill="url(#lunaBib)"
    />

    {/* Front legs, long and straight */}
    <ellipse
      cx="300"
      cy="420"
      rx="9"
      ry="26"
      fill="#6f5234"
      opacity="0.3"
      filter="url(#lunaSoft)"
    />
    <path
      d="M256 330 C254 372 255 414 258 448 L287 448 C289 414 291 372 292 330 Z"
      fill="url(#lunaLeg)"
    />
    <path
      d="M308 330 C309 372 311 414 313 448 L342 448 C345 414 346 372 344 330 Z"
      fill="url(#lunaLeg)"
    />
    <path d="M287 380 C289 410 288 432 287 446" stroke="#a88a66" strokeWidth="1.2" opacity="0.45" />
    <path d="M313 380 C311 410 312 432 313 446" stroke="#a88a66" strokeWidth="1.2" opacity="0.45" />
    <ellipse cx="272" cy="450" rx="19" ry="9" fill="#f2e8d5" />
    <ellipse cx="328" cy="450" rx="19" ry="9" fill="#e9dcc3" />
    <path
      d="M266 452 L266 457 M273 453 L273 458 M280 452 L280 457"
      stroke="#b9a88c"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />
    <path
      d="M322 452 L322 457 M329 453 L329 458 M336 452 L336 457"
      stroke="#b9a88c"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />

    {/* Fur direction strokes */}
    <g stroke="#9a6d3e" strokeWidth="1.1" strokeLinecap="round" opacity="0.32">
      <path d="M246 312 C242 330 240 348 242 364" />
      <path d="M356 312 C360 330 362 348 360 364" />
      <path d="M208 392 C214 380 224 372 236 368" />
      <path d="M392 392 C386 380 376 372 364 368" />
      <path d="M262 236 C258 252 254 266 250 280" />
      <path d="M338 236 C342 252 346 266 350 280" />
    </g>
    <g stroke="#cdbb9b" strokeWidth="1" strokeLinecap="round" opacity="0.55">
      <path d="M292 292 C290 304 290 316 292 328" />
      <path d="M308 292 C310 304 310 316 308 328" />
      <path d="M300 336 C300 352 300 366 300 380" />
    </g>

    <g className={styles.head}>
      <LunaHead />
    </g>

    <Halo x={300} y={100} rx={58} />
  </>
);

const NappingLuna: FC = () => (
  <>
    {/* Sleep glow around her head */}
    <circle cx="236" cy="392" r="96" fill="url(#lunaSleepGlow)" className={styles.sleepGlow} />

    <g className={styles.breath}>
      {/* Far wing peeking over the back */}
      <Feathers x={286} y={356} list={foldedFeathers} scale={0.72} turn={-6} fade={0.55} />

      {/* Curled back and hip */}
      <ellipse cx="322" cy="398" rx="146" ry="62" fill="url(#lunaCoat)" />
      <ellipse cx="404" cy="392" rx="74" ry="60" fill="url(#lunaCoat)" />
      <ellipse
        cx="420"
        cy="412"
        rx="52"
        ry="42"
        fill="#8f6538"
        opacity="0.28"
        filter="url(#lunaSoft)"
      />
      <path
        d="M346 360 C338 386 342 418 360 440"
        stroke="#9a6d3e"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.22"
        filter="url(#lunaSoft)"
      />
      <path
        d="M204 360 C252 334 340 324 424 336"
        stroke="#f3d38a"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Shoulder and cream chest under her chin */}
      <ellipse cx="252" cy="408" rx="64" ry="46" fill="url(#lunaCoat)" />
      <ellipse cx="226" cy="432" rx="44" ry="20" fill="url(#lunaBib)" />
      <ellipse cx="320" cy="454" rx="112" ry="8" fill="#e8dac0" opacity="0.7" />

      {/* Near wing folded flat along her back */}
      <Feathers x={272} y={366} list={foldedFeathers} scale={0.78} turn={4} />

      <g stroke="#9a6d3e" strokeWidth="1.1" strokeLinecap="round" opacity="0.3">
        <path d="M300 380 C320 372 340 370 356 372" />
        <path d="M430 360 C446 372 456 392 456 412" />
      </g>
    </g>

    {/* Tail wrapped round the front, tip toward her nose */}
    <g className={styles.tailNap}>
      <path
        d="M462 416 C484 438 454 458 392 458 C352 458 318 454 288 448"
        stroke="#b98b55"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M458 424 C468 442 440 451 392 452"
        stroke="#dcb47f"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </g>
    <ellipse cx="444" cy="446" rx="20" ry="7" fill="#e8dac0" />

    {/* Front paws with her chin resting on them */}
    <ellipse cx="204" cy="452" rx="32" ry="10" fill="#f2e8d5" />
    <ellipse cx="246" cy="458" rx="30" ry="9" fill="#e9dcc3" />
    <path
      d="M180 454 L180 459 M188 455 L188 460 M226 460 L226 465 M234 461 L234 466"
      stroke="#b9a88c"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />

    <g className={styles.napHead}>
      <g transform="translate(234 398) rotate(12) scale(0.6) translate(-300 -200)">
        <LunaHead asleep />
      </g>
    </g>

    {/* Drifting star motes: a quiet sleep cue */}
    <g fill="#f3e3b8">
      {[
        [262, 330, 0],
        [240, 316, 1.6],
        [282, 312, 3.2],
      ].map(([x, y, d]) => (
        <path
          key={d}
          className={styles.mote}
          style={{ animationDelay: `${d}s` }}
          d={`M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z`}
        />
      ))}
    </g>

    <Halo x={246} y={340} rx={36} tilt={12} />
  </>
);

const TreatLuna: FC = () => (
  <>
    {/* Half folded wings */}
    <Feathers x={264} y={384} list={wingFeathers} scale={0.66} turn={24} />
    <g transform="translate(600 0) scale(-1 1)">
      <Feathers x={264} y={384} list={wingFeathers} scale={0.66} turn={24} fade={0.92} />
    </g>

    {/* Tail, wagging */}
    <g className={styles.tailTreat}>
      <path
        d="M444 436 C476 436 502 418 506 388"
        stroke="#b98b55"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M448 432 C474 430 494 416 498 396"
        stroke="#dcb47f"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </g>

    {/* Body lying down, hips behind */}
    <ellipse cx="300" cy="430" rx="152" ry="34" fill="url(#lunaCoat)" />
    <ellipse cx="188" cy="430" rx="60" ry="32" fill="url(#lunaCoat)" />
    <ellipse cx="412" cy="430" rx="60" ry="32" fill="url(#lunaCoat)" />
    <ellipse
      cx="422"
      cy="436"
      rx="44"
      ry="24"
      fill="#8f6538"
      opacity="0.28"
      filter="url(#lunaSoft)"
    />
    <ellipse cx="158" cy="457" rx="24" ry="8" fill="#e8dac0" />
    <ellipse cx="442" cy="457" rx="24" ry="8" fill="#dccbad" />

    {/* Low chest */}
    <path
      d="M232 378 C232 352 262 340 300 340 C338 340 368 352 368 378 C372 408 368 434 362 454 L238 454 C232 434 228 408 232 378 Z"
      fill="url(#lunaCoat)"
    />
    <path
      d="M352 350 C364 380 366 424 358 454 L362 454 C368 434 372 408 368 378 C368 364 362 356 352 350 Z"
      fill="#8f6538"
      opacity="0.35"
      filter="url(#lunaSoft)"
    />
    <path
      d="M266 356 C282 368 318 368 334 356 C346 384 348 418 338 448 L262 448 C252 418 254 384 266 356 Z"
      fill="url(#lunaBib)"
    />

    {/* Forearms reaching toward us */}
    <path
      d="M246 414 C244 430 246 444 250 456 L290 456 C292 444 292 430 290 414 Z"
      fill="url(#lunaLeg)"
    />
    <path
      d="M310 414 C308 430 308 444 310 456 L352 456 C355 444 356 430 354 414 Z"
      fill="url(#lunaLeg)"
    />

    {/* Bully stick, gripped upright between her paws */}
    <g>
      <path d="M301 456 L320 364" stroke="#7b4a2a" strokeWidth="13" strokeLinecap="round" />
      <path
        d="M297 450 L315 368"
        stroke="#b27a4c"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M304 432 L313 428 M308 410 L317 406 M312 388 L320 384"
        stroke="#5a341c"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </g>

    {/* Paws gripping the stick */}
    <ellipse cx="272" cy="459" rx="25" ry="10" fill="#f2e8d5" />
    <ellipse cx="328" cy="459" rx="25" ry="10" fill="#e9dcc3" />
    <ellipse cx="292" cy="451" rx="8" ry="6" fill="#f2e8d5" />
    <ellipse cx="311" cy="450" rx="8" ry="6" fill="#e9dcc3" />
    <path
      d="M262 462 L262 467 M270 463 L270 468 M278 462 L278 467 M322 462 L322 467 M330 463 L330 468 M338 462 L338 467"
      stroke="#b9a88c"
      strokeWidth="1"
      strokeLinecap="round"
      opacity="0.7"
    />

    {/* Crumbs */}
    <g fill="#c8925e">
      {[
        [316, 372, 0, 1.6],
        [326, 368, 0.5, 1.2],
        [308, 376, 1, 1.4],
        [330, 374, 1.4, 1],
      ].map(([x, y, d, r]) => (
        <circle
          key={d}
          cx={x}
          cy={y}
          r={r}
          className={styles.crumb}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </g>

    <g className={styles.chewTilt}>
      <g transform="translate(300 298) rotate(9) scale(0.8) translate(-300 -200)">
        <LunaHead />
      </g>
    </g>

    <Halo x={306} y={214} rx={46} tilt={9} />
  </>
);

export const LunaAngelScene: FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  usePauseOffscreen(sectionRef);
  const [treatsCount, setTreatsCount] = useState<number>(42);
  const [quoteIndex, setQuoteIndex] = useState<number>(0);
  const [isExcited, setIsExcited] = useState<boolean>(false);
  const [particles, setParticles] = useState<HeartParticle[]>([]);
  const [pose, setPose] = useState<Pose>('sitting');

  const excitedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particleTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const treatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseBeforeTreat = useRef<Pose | null>(null);
  const poseButtons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const pending = particleTimers.current;
    return () => {
      if (excitedTimer.current) clearTimeout(excitedTimer.current);
      if (treatTimer.current) clearTimeout(treatTimer.current);
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const choosePose = (next: Pose) => {
    if (treatTimer.current) clearTimeout(treatTimer.current);
    treatTimer.current = null;
    poseBeforeTreat.current = null;
    setPose(next);
  };

  const onPoseKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % poses.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + poses.length) % poses.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = poses.length - 1;
    else return;
    e.preventDefault();
    choosePose(poses[next].id);
    poseButtons.current[next]?.focus();
  };

  const triggerReaction = (icon: string) => {
    setTreatsCount((prev) => prev + 1);
    setQuoteIndex((prev) => (prev + 1) % sweetQuotes.length);

    // One shared timer: each click restarts the excited window instead of
    // letting an earlier click end it early.
    setIsExcited(true);
    if (excitedTimer.current) clearTimeout(excitedTimer.current);
    excitedTimer.current = setTimeout(() => {
      excitedTimer.current = null;
      setIsExcited(false);
    }, EXCITED_MS);

    const newParticle: HeartParticle = {
      id: Date.now() + Math.random(),
      x: 50 + (Math.random() * 24 - 12),
      y: 38 + (Math.random() * 16 - 8),
      icon,
    };
    setParticles((prev) => [...prev.slice(-8), newParticle]);

    const t = setTimeout(() => {
      particleTimers.current.delete(t);
      setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
    }, PARTICLE_MS);
    particleTimers.current.add(t);
  };

  const giveTreat = () => {
    triggerReaction('🦴');
    // A treat always means treat time for a little while, then back to
    // whatever she was doing. A chosen Treat time pose stays put.
    if (pose !== 'treat') poseBeforeTreat.current = pose;
    if (poseBeforeTreat.current === null) return;
    setPose('treat');
    if (treatTimer.current) clearTimeout(treatTimer.current);
    treatTimer.current = setTimeout(() => {
      treatTimer.current = null;
      const back = poseBeforeTreat.current ?? 'sitting';
      poseBeforeTreat.current = null;
      setPose(back);
    }, TREAT_POSE_MS);
  };

  const poseClass = (p: Pose) => `${styles.pose} ${pose === p ? styles.poseActive : ''}`;

  return (
    <section ref={sectionRef} className={styles.lunaSceneSection} aria-labelledby="luna-heading">
      <div className={styles.sceneContainer}>
        <div className={styles.copyColumn}>
          <p className={styles.eyebrow}>In loving memory</p>
          <h2 id="luna-heading" className={styles.title}>
            Luna
          </h2>
          <p className={styles.subtitle}>
            My best girl. Chief morale officer, and still watching over every line of code.
          </p>

          <div className={styles.speechBubble} role="status" aria-live="polite">
            {sweetQuotes[quoteIndex]}
          </div>

          <div className={styles.poseControl} role="radiogroup" aria-label="Luna's pose">
            {poses.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => {
                  poseButtons.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={pose === p.id}
                tabIndex={pose === p.id ? 0 : -1}
                className={styles.poseOption}
                onClick={() => choosePose(p.id)}
                onKeyDown={(e) => onPoseKeyDown(e, i)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={styles.controlsBar}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={giveTreat}
              aria-label="Give Luna a treat"
            >
              <span aria-hidden="true">🦴</span>
              <span>Give Luna a treat</span>
            </button>

            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonGhost}`}
              onClick={() => triggerReaction('💛')}
              aria-label="Send love and pet Luna"
            >
              <span aria-hidden="true">💛</span>
              <span>Send love</span>
            </button>
          </div>

          <p className={styles.counter}>
            <span>Treats and love given</span>
            <span className={styles.counterValue}>{treatsCount}</span>
          </p>
        </div>

        <div className={styles.stage}>
          {particles.map((p) => (
            <span
              key={p.id}
              className={styles.floatingHeart}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden="true"
            >
              {p.icon}
            </span>
          ))}

          <svg
            className={`${styles.svgCanvas} ${isExcited ? styles.excited : ''}`}
            viewBox="0 0 600 520"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={poseLabels[pose]}
          >
            <defs>
              <radialGradient id="lunaAura" cx="50%" cy="46%" r="50%">
                <stop offset="0%" stopColor="#d4a84b" stopOpacity="0.2" />
                <stop offset="55%" stopColor="#ff8a2a" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#ff8a2a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="lunaSleepGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f3d38a" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#f3d38a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="lunaCandleGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffc45c" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ff8a2a" stopOpacity="0" />
              </radialGradient>

              {/* Coat: light from upper left */}
              <linearGradient id="lunaCoat" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e0b985" />
                <stop offset="45%" stopColor="#cfa069" />
                <stop offset="100%" stopColor="#a87a48" />
              </linearGradient>
              <linearGradient id="lunaHead" x1="0.15" y1="0" x2="0.9" y2="1">
                <stop offset="0%" stopColor="#dcb27b" />
                <stop offset="60%" stopColor="#c99a62" />
                <stop offset="100%" stopColor="#ad7f4c" />
              </linearGradient>
              <linearGradient id="lunaMuzzle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9c7147" />
                <stop offset="38%" stopColor="#b79a7d" />
                <stop offset="72%" stopColor="#d9d4cc" />
                <stop offset="100%" stopColor="#c9c2b7" />
              </linearGradient>
              <linearGradient id="lunaBib" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e6d4b4" />
                <stop offset="40%" stopColor="#efe3cc" />
                <stop offset="100%" stopColor="#e3d2b3" />
              </linearGradient>
              <linearGradient id="lunaLeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d2a46c" stopOpacity="0" />
                <stop offset="18%" stopColor="#d6ab74" />
                <stop offset="55%" stopColor="#e4cba4" />
                <stop offset="100%" stopColor="#efe3cc" />
              </linearGradient>
              <linearGradient id="lunaEarInner" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e0a79a" />
                <stop offset="100%" stopColor="#b77566" />
              </linearGradient>
              <radialGradient id="lunaEye" cx="42%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#c98a3e" />
                <stop offset="70%" stopColor="#8a4f1f" />
                <stop offset="100%" stopColor="#4a2a12" />
              </radialGradient>
              <linearGradient id="lunaFeather" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d8ccb6" />
                <stop offset="100%" stopColor="#f7f1e6" />
              </linearGradient>
              <linearGradient id="lunaCloud" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e9e1d3" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#8f887d" stopOpacity="0.55" />
              </linearGradient>

              <filter id="lunaSoft" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <filter id="lunaSofter" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="9" />
              </filter>
              <filter id="lunaHaloGlow" x="-40%" y="-200%" width="180%" height="500%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <path
                id="lunaFeatherShape"
                d="M0 0 C22 -20 84 -26 142 -8 C148 -6 148 0 142 1 C92 16 32 16 0 0 Z"
              />
            </defs>

            {/* Sky details */}
            <g className={styles.stars}>
              {stars.map(([cx, cy, r, o], i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="#f3ead8"
                  opacity={o}
                  className={i % 3 === 0 ? styles.twinkle : undefined}
                  style={{ animationDelay: `${(i % 5) * 0.9}s` }}
                />
              ))}
            </g>
            <circle cx="300" cy="260" r="250" fill="url(#lunaAura)" />

            <g className={styles.floatGroup}>
              {/* Cloud (back) */}
              <g opacity="0.9">
                <ellipse
                  cx="300"
                  cy="468"
                  rx="210"
                  ry="30"
                  fill="url(#lunaCloud)"
                  filter="url(#lunaSoft)"
                />
                <ellipse cx="196" cy="450" rx="74" ry="28" fill="url(#lunaCloud)" />
                <ellipse cx="410" cy="452" rx="80" ry="26" fill="url(#lunaCloud)" />
                <ellipse cx="300" cy="444" rx="96" ry="26" fill="url(#lunaCloud)" />
              </g>

              <g className={`${poseClass('sitting')} ${styles.poseSit}`}>
                <SittingLuna />
              </g>
              <g className={`${poseClass('napping')} ${styles.poseNap}`}>
                <NappingLuna />
              </g>
              <g className={`${poseClass('treat')} ${styles.poseTreat}`}>
                <TreatLuna />
              </g>

              {/* Cloud (front wisps) */}
              <g opacity="0.85">
                <ellipse cx="236" cy="474" rx="90" ry="18" fill="url(#lunaCloud)" />
                <ellipse cx="372" cy="476" rx="96" ry="17" fill="url(#lunaCloud)" />
              </g>

              <Flowers />
            </g>
          </svg>

          <figure className={styles.portrait}>
            <img
              src="/img/gallery/luna_1.JPG"
              alt="Luna, a fawn dog with big flyaway ears, looking up at the camera"
              loading="lazy"
              decoding="async"
              width={400}
              height={600}
            />
            <figcaption>Luna</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
};
