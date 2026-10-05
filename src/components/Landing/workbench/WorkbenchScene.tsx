import { CSSProperties, FC, useId } from 'react';
import styles from '../Workbench.module.css';

// Scene coordinates (viewBox 1400 x 800). The HTML overlays sit on these rects.
export const SCENE = { w: 1400, h: 800 };
export const SLOTS = {
  monitor: { x: 196, y: 96, w: 588, h: 344 },
  deck: { x: 987, y: 474, w: 166, h: 150 },
  hole: { x: 1236, y: 548, w: 128, h: 88 },
  bench: { x: 938, y: 138, w: 414, h: 226 },
};

// Exposed as custom properties so the stacked mobile layout can ignore them
export const slotStyle = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) =>
  ({
    '--slot-x': `${(x / SCENE.w) * 100}%`,
    '--slot-y': `${(y / SCENE.h) * 100}%`,
    '--slot-w': `${(w / SCENE.w) * 100}%`,
    '--slot-h': `${(h / SCENE.h) * 100}%`,
  }) as CSSProperties;

const ink = { stroke: 'var(--s-ink)', strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

// A night workshop in Detroit: desk, main monitor, lamp, pegboard dugout, on deck circle
export const WorkbenchScene: FC = () => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      className={styles.scene}
      viewBox={`0 0 ${SCENE.w} ${SCENE.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={id('blocks')} width="96" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 .5h96M0 20.5h96M48 0v20M.5 20v20" stroke="rgb(255 255 255 / 0.035)" strokeWidth="1" fill="none" />
        </pattern>
        <pattern id={id('pegs')} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="2.2" fill="var(--s-ink)" opacity="0.8" />
        </pattern>
        <linearGradient id={id('wallShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('floorShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.5" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070a14" />
          <stop offset="1" stopColor="#2a1606" />
        </linearGradient>
        <linearGradient id={id('cone')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="var(--s-accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--s-accent)" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={id('pool')}>
          <stop offset="0" stopColor="var(--s-accent)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--s-accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('screenGlow')}>
          <stop offset="0" stopColor="var(--s-chrome)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--s-chrome)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('deckGlow')}>
          <stop offset="0.55" stopColor="var(--s-accent)" stopOpacity="0" />
          <stop offset="0.9" stopColor="var(--s-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--s-accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('deskTop')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--s-wood-lit)" />
          <stop offset="0.45" stopColor="var(--s-wood)" />
          <stop offset="1" stopColor="var(--s-wood)" />
        </linearGradient>
        <filter id={id('blur')} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Wall, floor */}
      <rect width="1400" height="640" fill="var(--s-wall)" />
      <rect width="1400" height="640" fill={url('blocks')} />
      <rect width="1400" height="640" fill={url('wallShade')} />
      <rect y="626" width="1400" height="14" fill="var(--s-wall-lo)" />
      <rect y="640" width="1400" height="160" fill="var(--s-floor)" />
      <path
        d="M120 640 20 800M420 640 360 800M720 640 700 800M1020 640 1040 800M1300 640 1380 800M0 700h1400"
        stroke="rgb(255 255 255 / 0.03)"
        strokeWidth="2"
      />
      <rect y="640" width="1400" height="40" fill={url('floorShade')} />

      {/* Transom window: RenCen and a sodium haze */}
      <polygon points="30,152 170,152 250,420 70,420" fill="var(--s-accent)" opacity="0.03" />
      <g {...ink}>
        <rect x="30" y="40" width="140" height="112" rx="3" fill={url('sky')} />
        <g fill="var(--s-silhouette)" stroke="none">
          <rect x="44" y="112" width="18" height="40" />
          <rect x="64" y="100" width="14" height="52" />
          <rect x="82" y="88" width="10" height="64" />
          <rect x="94" y="64" width="16" height="88" rx="3" />
          <rect x="112" y="88" width="10" height="64" />
          <rect x="126" y="104" width="22" height="48" />
          <rect x="150" y="118" width="16" height="34" />
        </g>
        <g fill="var(--s-accent-hi)" stroke="none" opacity="0.8">
          <rect x="99" y="76" width="2" height="2" />
          <rect x="104" y="92" width="2" height="2" />
          <rect x="69" y="112" width="2" height="2" />
          <rect x="131" y="116" width="2" height="2" />
          <rect x="140" y="128" width="2" height="2" />
          <rect x="50" y="122" width="2" height="2" />
        </g>
        <path d="M100 40v112M30 96h140" stroke="var(--s-frame)" strokeWidth="5" />
        <rect x="30" y="40" width="140" height="112" rx="3" fill="none" stroke="var(--s-frame)" strokeWidth="8" />
        <rect x="24" y="152" width="152" height="8" rx="2" fill="var(--s-frame)" />
      </g>

      {/* Pennant */}
      <g {...ink}>
        <circle cx="812" cy="92" r="3" fill="var(--s-chrome)" />
        <path d="M814 88 910 108 814 132Z" fill="var(--s-accent-deep)" />
        <text
          x="828"
          y="116"
          fill="var(--s-wall)"
          stroke="none"
          fontFamily="var(--font-family-mono)"
          fontSize="15"
          fontWeight="700"
          letterSpacing="2"
        >
          DET
        </text>
      </g>

      {/* Pegboard dugout */}
      <g {...ink}>
        <rect x="915" y="44" width="460" height="336" rx="6" fill="var(--s-wood-dark)" />
        <rect x="927" y="56" width="436" height="314" rx="2" fill="var(--s-board)" />
        <rect x="927" y="56" width="436" height="314" fill={url('pegs')} stroke="none" />
        {/* hammer */}
        <path d="M950 94h82v9h-82z" fill="var(--s-wood-lit)" />
        <path d="M1030 78h16v40h-16z" fill="var(--s-metal)" />
        <path d="M1030 78h16v8h-16z" fill="var(--s-metal-hi)" stroke="none" />
        {/* wrench */}
        <path
          d="M1072 92h78v12h-78z M1066 98a13 13 0 1 0 0.1 0z M1158 98a13 13 0 1 0 0.1 0z"
          fill="var(--s-metal)"
        />
        <path d="M1058 94h10v8h-10zM1160 94h12v8h-12z" fill="var(--s-board)" stroke="none" />
        <path d="M1076 94h70" stroke="var(--s-metal-hi)" strokeWidth="2" />
        {/* screwdriver */}
        <path d="M1194 66h14v36h-14z" fill="var(--s-accent-deep)" />
        <path d="M1201 102v38" strokeWidth="4" stroke="var(--s-metal-hi)" />
        {/* tape measure */}
        <rect x="1226" y="78" width="46" height="44" rx="12" fill="var(--s-chrome-lo)" />
        <circle cx="1249" cy="100" r="8" fill="var(--s-metal)" />
        <path d="M1272 116h12" stroke="var(--s-accent-hi)" strokeWidth="4" />
        {/* pliers */}
        <path d="M1310 70l24 50M1334 70l-24 50" strokeWidth="7" stroke="var(--s-ink)" />
        <path d="M1310 70l24 50M1334 70l-24 50" strokeWidth="4" stroke="var(--s-metal)" />
        <circle cx="1322" cy="95" r="4" fill="var(--s-metal-hi)" />
        {/* shelf plank */}
        <path d="M940 392l14 26h10l-6-26zM1350 392l-14 26h-10l6-26z" fill="var(--s-metal-lo)" />
        <rect x="905" y="370" width="480" height="22" rx="3" fill="var(--s-wood)" />
        <path d="M909 373h472" stroke="var(--s-wood-lit)" strokeWidth="2" />
      </g>

      {/* Screen spill on the wall */}
      <ellipse cx="490" cy="270" rx="420" ry="250" fill={url('screenGlow')} />

      {/* Desk */}
      <ellipse cx="470" cy="772" rx="470" ry="14" fill="#000" opacity="0.5" />
      <g {...ink}>
        <rect x="62" y="612" width="22" height="160" fill="var(--s-metal-lo)" />
        <rect x="856" y="612" width="22" height="160" fill="var(--s-metal-lo)" />
        <path d="M84 700h772" stroke="var(--s-metal-lo)" strokeWidth="8" />
        <rect x="92" y="614" width="160" height="152" rx="3" fill="var(--s-wood-dark)" />
        <path d="M92 666h160M92 716h160" />
        <path d="M156 640h32M156 691h32M156 741h32" stroke="var(--s-chrome-lo)" strokeWidth="5" />
        <path d="M70 548h800l30 52H40z" fill={url('deskTop')} />
        <path d="M74 551h792" stroke="rgb(255 255 255 / 0.08)" strokeWidth="2" />
        <rect x="40" y="600" width="860" height="18" fill="var(--s-wood-dark)" />
      </g>

      {/* Luna under the desk: a dog bed with a small star over it */}
      <g {...ink}>
        <ellipse cx="560" cy="760" rx="92" ry="16" fill="var(--s-bed)" />
        <path d="M476 758c4-22 164-22 168 0" fill="none" stroke="var(--s-bed-hi)" strokeWidth="6" />
        <path d="M520 752c6-14 70-14 84 0z" fill="var(--s-bed-hi)" opacity="0.5" />
        <path
          d="M560 718l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
          fill="var(--s-accent-hi)"
          stroke="none"
          className={styles.twinkle}
        />
      </g>

      {/* Monitor */}
      <ellipse cx="490" cy="560" rx="200" ry="12" fill="var(--s-chrome)" opacity="0.06" />
      <g {...ink}>
        <path d="M470 458h40l6 90h-52z" fill="var(--s-metal)" />
        <path d="M472 460h10l-2 88h-12z" fill="var(--s-metal-hi)" stroke="none" opacity="0.6" />
        <path d="M430 546h120l20 14H410z" fill="var(--s-metal)" />
        <rect x="180" y="80" width="620" height="380" rx="16" fill="var(--s-bezel)" />
        <path d="M196 84h588" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
        <rect x="196" y="96" width="588" height="344" rx="6" fill="var(--s-screen)" />
        <circle cx="490" cy="450" r="2.5" fill="var(--s-accent)" stroke="none" />
      </g>

      {/* Keyboard, mouse, mug, photo */}
      <g {...ink}>
        <path d="M345 562h290l15 28H330z" fill="var(--s-metal-lo)" />
        <path
          d="M356 569h268M350 576h280M344 583h292"
          stroke="var(--s-metal-hi)"
          strokeWidth="4"
          strokeDasharray="12 4"
          strokeLinecap="butt"
        />
        <ellipse cx="692" cy="578" rx="14" ry="8" fill="var(--s-metal-lo)" />
        <path d="M692 570v5" stroke="var(--s-metal-hi)" strokeWidth="1.5" />

        <path d="M770 538c16 0 16 22 0 22" fill="none" stroke="var(--s-ink)" strokeWidth="9" />
        <path d="M770 538c16 0 16 22 0 22" fill="none" stroke="var(--s-chrome)" strokeWidth="4" />
        <path d="M734 528h38v36c0 4-3 6-6 6h-26c-3 0-6-2-6-6z" fill="var(--s-chrome)" />
        <path d="M760 530h10v34c0 3-2 5-5 5h-5z" fill="var(--s-chrome-lo)" stroke="none" />
        <text x="738" y="554" fontSize="11" fontWeight="700" fill="var(--s-ink)" stroke="none" fontFamily="var(--font-family-mono)">
          313
        </text>
        <g className={styles.steam} fill="none" stroke="var(--s-chrome)" strokeWidth="2" opacity="0.3">
          <path d="M746 520c-6-8 6-12 0-22" />
          <path d="M758 518c-6-8 6-12 0-20" />
        </g>

        <path d="M796 490h56v64h-56z" fill="var(--s-wood-dark)" transform="rotate(4 824 522)" />
        <g transform="rotate(4 824 522)">
          <rect x="803" y="497" width="42" height="50" fill="#0c1222" />
          <path
            d="M812 547c0-10 4-16 10-18-3-4-3-9 1-12 3-2 8-2 10 1 3 3 3 7 2 10 5 3 8 10 8 19z"
            fill="var(--s-chrome)"
            stroke="none"
            opacity="0.85"
          />
          <path d="M826 518c-4 2-6 7-4 12" fill="none" stroke="var(--s-ink)" strokeWidth="2" />
          <path d="M836 503l1.5 3 3 .5-2 2 .5 3-3-1.5-3 1.5.5-3-2-2 3-.5z" fill="var(--s-accent-hi)" stroke="none" />
        </g>
      </g>

      {/* Desk lamp: sodium orange */}
      <g className={styles.lampLight}>
        <polygon points="114,444 165,420 420,580 70,586" fill={url('cone')} />
        <ellipse cx="240" cy="578" rx="190" ry="22" fill={url('pool')} />
      </g>
      <g {...ink}>
        <ellipse cx="120" cy="556" rx="30" ry="7" fill="var(--s-metal)" />
        <path d="M120 552 70 360 128 412" fill="none" stroke="var(--s-ink)" strokeWidth="8" />
        <path d="M120 552 70 360 128 412" fill="none" stroke="var(--s-metal-hi)" strokeWidth="4" />
        <circle cx="70" cy="360" r="6" fill="var(--s-metal)" />
        <g transform="translate(130 412) rotate(-25)">
          <path d="M-12-18h24l16 40h-56z" fill="var(--s-accent-deep)" />
          <path d="M-8-18h8l-4 40h-16z" fill="var(--s-accent)" stroke="none" opacity="0.35" />
          <ellipse cx="0" cy="22" rx="26" ry="5" fill="var(--s-accent-hi)" />
        </g>
      </g>

      {/* Bat leaning on the desk, helmet on the floor */}
      <g {...ink}>
        <path
          d="M940.8 766.1 917.4 635.8 899.4 564.2 883.9 477.3 876.1 478.7 890.6 565.8 897.6 639.2 919.2 769.9Z"
          fill="var(--s-bat)"
        />
        <path d="M926 750 906 640" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" />
        <path d="M885.5 505 881.5 484" stroke="var(--s-ink)" strokeWidth="9" />
        <circle cx="879.5" cy="473" r="7" fill="var(--s-bat)" />
      </g>
      <g {...ink}>
        <ellipse cx="770" cy="770" rx="54" ry="7" fill="#000" opacity="0.5" stroke="none" />
        <path d="M722 768c0-34 18-50 42-50 26 0 42 16 42 40l24 6v4z" fill="var(--s-helmet)" />
        <path d="M736 746c4-14 14-22 28-22" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="4" />
        <circle cx="760" cy="752" r="10" fill="var(--s-helmet-lo)" />
        <text x="776" y="750" fontSize="13" fontWeight="800" fill="var(--s-ink)" stroke="none" fontFamily="var(--font-family-mono)">
          24
        </text>
      </g>

      {/* On deck circle: painted ring, crate, portable screen */}
      <g className={styles.deckRing}>
        <ellipse cx="1070" cy="735" rx="148" ry="38" fill={url('deckGlow')} />
        <ellipse cx="1070" cy="735" rx="135" ry="32" fill="none" stroke="var(--s-accent)" strokeWidth="10" opacity="0.35" filter={url('blur')} />
      </g>
      <ellipse cx="1070" cy="735" rx="135" ry="32" fill="none" stroke="var(--s-accent)" strokeWidth="3.5" />
      <text
        transform="translate(1070 762) scale(1 0.5)"
        textAnchor="middle"
        fontSize="20"
        letterSpacing="8"
        fontWeight="700"
        fill="var(--s-accent)"
        opacity="0.75"
        fontFamily="var(--font-family-mono)"
      >
        ON DECK
      </text>
      <g {...ink}>
        <path d="M1015 648h110l10-10h-110z" fill="var(--s-metal)" />
        <rect x="1015" y="648" width="110" height="84" fill="var(--s-metal-lo)" />
        <path d="M1125 648l10-10v84l-10 10z" fill="var(--s-bezel)" />
        <path d="M1027 664h86M1027 682h86M1027 700h86M1027 716h86" stroke="var(--s-bezel)" strokeWidth="7" strokeLinecap="butt" />
        <path d="M1062 636h16v8h-16z" fill="var(--s-metal)" />
        <rect x="975" y="462" width="190" height="174" rx="10" fill="var(--s-bezel)" />
        <rect x="987" y="474" width="166" height="150" rx="4" fill="var(--s-screen)" />
      </g>

      {/* In the hole: dashed ring, tripod, tablet */}
      <ellipse
        cx="1300"
        cy="718"
        rx="80"
        ry="18"
        fill="none"
        stroke="var(--s-chrome)"
        strokeWidth="2.5"
        strokeDasharray="10 8"
        opacity="0.45"
      />
      <text
        transform="translate(1300 734) scale(1 0.5)"
        textAnchor="middle"
        fontSize="13"
        letterSpacing="5"
        fontWeight="700"
        fill="var(--s-chrome)"
        opacity="0.45"
        fontFamily="var(--font-family-mono)"
      >
        IN THE HOLE
      </text>
      <g {...ink}>
        <path d="M1300 644 1264 716M1300 644 1336 716M1300 644v76" fill="none" stroke="var(--s-metal-hi)" strokeWidth="4" />
        <rect x="1228" y="540" width="144" height="104" rx="8" fill="var(--s-bezel)" />
        <rect x="1236" y="548" width="128" height="88" rx="3" fill="var(--s-screen)" />
      </g>
    </svg>
  );
};
