import React, { createContext, FC, ReactNode, SVGProps, useContext } from 'react';
import { SpriteAction } from '../types';

/*
 * Shared drawing kit for the arcade sprites.
 *
 * Every sprite lives in a 100 x 100 viewBox and follows one chibi template so
 * the roster reads as a set:
 *   head      y 19 - 53  (about 2.3 heads tall overall)
 *   torso     y 50 - 78
 *   legs      y 76 - 90
 *   feet      y 88 - 95, ground shadow at y 96
 *
 * Shapes go through <Sh>, which paints the base colour, a hard-edged cel
 * shadow, a soft highlight, an optional rim light and finally a constant
 * weight ink outline. The overlays use objectBoundingBox gradients, so one set
 * of defs shades any colour and any shape.
 */

export const INK = '#1B1430';
export const OUTLINE = 1.5;
export const DETAIL = 1;

export interface KitIds {
  cel: string;
  hl: string;
  rim: string;
  glow: string;
}

export type Mood = 'idle' | 'happy' | 'sleeping' | 'eating' | 'bounce';

interface KitState {
  ids: KitIds;
  mood: Mood;
}

const KitContext = createContext<KitState>({
  ids: { cel: 'cel', hl: 'hl', rim: 'rim', glow: 'glow' },
  mood: 'idle',
});

export const moodFromAction = (action: SpriteAction): Mood => {
  switch (action) {
    case 'happy':
    case 'celebrate':
      return 'happy';
    case 'sleeping':
      return 'sleeping';
    case 'eating':
      return 'eating';
    case 'bounce':
      return 'bounce';
    default:
      return 'idle';
  }
};

export const KitProvider: FC<{ ids: KitIds; mood: Mood; children: ReactNode }> = ({
  ids,
  mood,
  children,
}) => <KitContext.Provider value={{ ids, mood }}>{children}</KitContext.Provider>;

export const useKit = () => useContext(KitContext);

/** Gradient + filter definitions every sprite relies on. */
export const KitDefs: FC<{ ids: KitIds }> = ({ ids }) => (
  <>
    {/* Hard-edged cel shadow falling to the lower right */}
    <linearGradient id={ids.cel} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#140A2E" stopOpacity="0" />
      <stop offset="0.6" stopColor="#140A2E" stopOpacity="0" />
      <stop offset="0.6" stopColor="#140A2E" stopOpacity="0.17" />
      <stop offset="1" stopColor="#140A2E" stopOpacity="0.24" />
    </linearGradient>
    {/* Soft key-light highlight in the upper left */}
    <radialGradient id={ids.hl} cx="0.3" cy="0.24" r="0.42">
      <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
      <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
    </radialGradient>
    {/* Cool rim light hugging the shadowed edge */}
    <radialGradient id={ids.rim} cx="0.34" cy="0.3" r="0.78">
      <stop offset="0" stopColor="#B9F3FF" stopOpacity="0" />
      <stop offset="0.86" stopColor="#B9F3FF" stopOpacity="0" />
      <stop offset="0.93" stopColor="#B9F3FF" stopOpacity="0.55" />
      <stop offset="1" stopColor="#B9F3FF" stopOpacity="0" />
    </radialGradient>
    <filter id={ids.glow} x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="1.6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </>
);

/* ---------- colour helpers ---------- */

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const parseHex = (hex: string): [number, number, number] | null => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Mix a colour toward another. amt 0 = a, 1 = b. Non-hex input is returned as is. */
export const mix = (a: string, b: string, amt: number) => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => clamp(v + (cb[i] - v) * amt));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export const darken = (c: string, amt = 0.3) => mix(c, '#140A2E', amt);
export const lighten = (c: string, amt = 0.3) => mix(c, '#FFFFFF', amt);

/* ---------- shaded shape ---------- */

type ShapeTag = 'path' | 'circle' | 'ellipse' | 'rect' | 'polygon';

type ShProps = Omit<SVGProps<SVGElement>, 'fill' | 'ref'> & {
  as?: ShapeTag;
  fill: string;
  /** cel shadow (default true) */
  shade?: boolean;
  /** soft highlight (default true) */
  hl?: boolean;
  /** rim light (default false) */
  rim?: boolean;
  /** outline colour, or false for none */
  ink?: string | false;
  sw?: number;
};

export const Sh: FC<ShProps> = ({
  as = 'path',
  fill,
  shade = true,
  hl = true,
  rim = false,
  ink = INK,
  sw = OUTLINE,
  className,
  transform,
  opacity,
  filter,
  style,
  ...geom
}) => {
  const { ids } = useKit();
  const tag = as as string;
  return (
    <g className={className} transform={transform} opacity={opacity} filter={filter} style={style}>
      {React.createElement(tag, { ...geom, fill })}
      {shade && React.createElement(tag, { ...geom, fill: `url(#${ids.cel})` })}
      {hl && React.createElement(tag, { ...geom, fill: `url(#${ids.hl})` })}
      {rim && React.createElement(tag, { ...geom, fill: `url(#${ids.rim})` })}
      {ink &&
        React.createElement(tag, {
          ...geom,
          fill: 'none',
          stroke: ink,
          strokeWidth: sw,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        })}
    </g>
  );
};

/** Ink detail line (folds, seams, mouths). */
export const Line: FC<{ d: string; c?: string; w?: number; o?: number }> = ({
  d,
  c = INK,
  w = DETAIL,
  o,
}) => (
  <path
    d={d}
    fill="none"
    stroke={c}
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    opacity={o}
  />
);

/** Outlined capsule limb: ink underlay plus colour, with a thin shadow seam. */
export const Limb: FC<{ d: string; c: string; w?: number; ink?: string }> = ({
  d,
  c,
  w = 5.4,
  ink = INK,
}) => (
  <g>
    <path
      d={d}
      fill="none"
      stroke={ink}
      strokeWidth={w + OUTLINE * 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d={d}
      fill="none"
      stroke={c}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d={d}
      fill="none"
      stroke={darken(c, 0.28)}
      strokeWidth={w * 0.32}
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={`translate(${w * 0.28} ${w * 0.12})`}
      opacity="0.55"
    />
  </g>
);

/* ---------- chibi template ---------- */

export const HEAD_PATH =
  'M33 35 C33 23 41 19.5 50 19.5 C59 19.5 67 23 67 35 C67 46 60 52.5 50 52.5 C40 52.5 33 46 33 35 Z';

export const Head: FC<{ skin: string; ears?: boolean; children?: ReactNode }> = ({
  skin,
  ears = true,
  children,
}) => (
  <g className="sprite-head">
    {ears && (
      <>
        <Sh as="ellipse" cx={33.6} cy={39} rx={3} ry={4} fill={skin} hl={false} />
        <Sh as="ellipse" cx={66.4} cy={39} rx={3} ry={4} fill={skin} hl={false} />
      </>
    )}
    <Sh d={HEAD_PATH} fill={skin} rim />
    {children}
  </g>
);

export const torsoPath = (sw = 12.5, hw = 11.5, top = 50, bot = 78) =>
  `M${50 - sw} ${top + 4} Q${50 - sw} ${top} ${50 - sw + 4} ${top} H${50 + sw - 4} Q${50 + sw} ${top} ${50 + sw} ${top + 4} ` +
  `L${50 + hw} ${bot - 3} Q${50 + hw} ${bot} ${50 + hw - 3} ${bot} H${50 - hw + 3} Q${50 - hw} ${bot} ${50 - hw} ${bot - 3} Z`;

export const Torso: FC<{
  fill: string;
  sw?: number;
  hw?: number;
  top?: number;
  bot?: number;
  children?: ReactNode;
}> = ({ fill, sw, hw, top, bot, children }) => (
  <g>
    <Sh d={torsoPath(sw, hw, top, bot)} fill={fill} rim />
    {children}
  </g>
);

/** A shoe that faces the viewer: rounded toe, flat sole. */
export const shoePath = (x: number, y = 94.5, w = 6.4, h = 5.6) =>
  `M${x - w} ${y} Q${x - w} ${y - h} ${x} ${y - h} Q${x + w} ${y - h} ${x + w} ${y} Z`;

export const Legs: FC<{
  pants: string;
  shoes: string;
  sole?: string;
  spread?: number;
  top?: number;
  w?: number;
}> = ({ pants, shoes, sole = '#F1F5F9', spread = 7, top = 76, w = 7 }) => (
  <g className="sprite-legs">
    <Limb d={`M${50 - spread} ${top} L${50 - spread} 89`} c={pants} w={w} />
    <Limb d={`M${50 + spread} ${top} L${50 + spread} 89`} c={pants} w={w} />
    <Sh d={shoePath(50 - spread - 0.6)} fill={shoes} />
    <Sh d={shoePath(50 + spread + 0.6)} fill={shoes} />
    <Line d={`M${50 - spread - 6.4} 93.6 H${50 - spread + 5.2}`} c={sole} w={1.3} />
    <Line d={`M${50 + spread - 5.2} 93.6 H${50 + spread + 6.4}`} c={sole} w={1.3} />
  </g>
);

/** Arm from shoulder to hand. `via` bends the elbow. */
export const Arm: FC<{
  from: [number, number];
  to: [number, number];
  via?: [number, number];
  sleeve: string;
  hand: string;
  w?: number;
  handR?: number;
}> = ({ from, to, via, sleeve, hand, w = 5.6, handR = 3.6 }) => {
  const d = via
    ? `M${from[0]} ${from[1]} Q${via[0]} ${via[1]} ${to[0]} ${to[1]}`
    : `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;
  return (
    <g className="sprite-arm">
      <Limb d={d} c={sleeve} w={w} />
      <Sh as="circle" cx={to[0]} cy={to[1]} r={handR} fill={hand} />
    </g>
  );
};

/* ---------- faces ---------- */

export type EyeKind = 'open' | 'happy' | 'closed' | 'angry' | 'dot' | 'wink' | 'focused' | 'sad';
export type MouthKind =
  | 'smile'
  | 'open'
  | 'grin'
  | 'flat'
  | 'smirk'
  | 'o'
  | 'tongue'
  | 'chomp'
  | 'snarl'
  | 'gap'
  | 'none';

const EYE_INK = '#1E1533';

export const Eye: FC<{
  x: number;
  y: number;
  kind: EyeKind;
  iris?: string;
  flip?: boolean;
  s?: number;
}> = ({ x, y, kind, iris, flip = false, s = 1 }) => {
  const k = flip ? -1 : 1;
  switch (kind) {
    case 'happy':
      return (
        <Line
          d={`M${x - 2.8 * s} ${y + 1} Q${x} ${y - 2.8 * s} ${x + 2.8 * s} ${y + 1}`}
          c={EYE_INK}
          w={1.7}
        />
      );
    case 'closed':
      return (
        <Line
          d={`M${x - 2.8 * s} ${y} Q${x} ${y + 2.6 * s} ${x + 2.8 * s} ${y}`}
          c={EYE_INK}
          w={1.6}
        />
      );
    case 'sad':
      return (
        <Line
          d={`M${x - 2.6 * s} ${y + 0.6} Q${x} ${y - 1.2} ${x + 2.6 * s} ${y + 0.6}`}
          c={EYE_INK}
          w={1.5}
        />
      );
    case 'dot':
      return (
        <g>
          <ellipse cx={x} cy={y} rx={1.3 * s} ry={1.6 * s} fill={EYE_INK} />
        </g>
      );
    case 'focused':
    case 'angry':
    case 'open':
    default: {
      const ry = kind === 'open' ? 3.3 * s : 2.7 * s;
      const rx = 2.5 * s;
      return (
        <g>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={EYE_INK} />
          {iris && <ellipse cx={x} cy={y + ry * 0.35} rx={rx * 0.72} ry={ry * 0.5} fill={iris} />}
          <circle cx={x + 0.9 * k * s} cy={y - ry * 0.42} r={1.05 * s} fill="#FFFFFF" />
          <circle
            cx={x - 0.8 * k * s}
            cy={y + ry * 0.45}
            r={0.5 * s}
            fill="#FFFFFF"
            opacity="0.85"
          />
          {kind === 'angry' && (
            <path
              d={`M${x - 3.6 * k} ${y - ry - 0.2} L${x + 3.4 * k} ${y - ry + 2.2}`}
              stroke={EYE_INK}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          )}
        </g>
      );
    }
  }
};

export const Mouth: FC<{ kind: MouthKind; x?: number; y?: number; c?: string }> = ({
  kind,
  x = 50,
  y = 46.5,
  c = EYE_INK,
}) => {
  switch (kind) {
    case 'none':
      return null;
    case 'flat':
      return <Line d={`M${x - 3} ${y} H${x + 3}`} c={c} w={1.4} />;
    case 'smirk':
      return (
        <Line
          d={`M${x - 3} ${y + 0.4} Q${x + 0.5} ${y + 1.6} ${x + 3.6} ${y - 1.2}`}
          c={c}
          w={1.4}
        />
      );
    case 'o':
      return (
        <ellipse cx={x} cy={y + 0.4} rx={1.4} ry={1.7} fill="#5B1A2A" stroke={c} strokeWidth={1} />
      );
    case 'tongue':
      return (
        <g>
          <path
            d={`M${x - 0.6} ${y + 0.4} Q${x + 1.6} ${y + 6.4} ${x + 4} ${y + 0.6} Z`}
            fill="#FF5C7A"
            stroke={c}
            strokeWidth={1}
          />
          <Line d={`M${x - 3.6} ${y - 0.4} Q${x} ${y + 2.6} ${x + 4} ${y - 0.4}`} c={c} w={1.3} />
        </g>
      );
    case 'open':
    case 'chomp': {
      const h = kind === 'chomp' ? 6 : 5;
      return (
        <g>
          <path
            d={`M${x - 3.8} ${y - 1} Q${x} ${y - 0.2} ${x + 3.8} ${y - 1} Q${x + 3.4} ${y + h} ${x} ${y + h} Q${x - 3.4} ${y + h} ${x - 3.8} ${y - 1} Z`}
            fill="#6B1D2E"
            stroke={c}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
          <ellipse cx={x} cy={y + h - 1.4} rx={2.2} ry={1.2} fill="#FF7A93" />
        </g>
      );
    }
    case 'grin':
      return (
        <g>
          <path
            d={`M${x - 4.2} ${y - 1} Q${x} ${y} ${x + 4.2} ${y - 1} Q${x + 3.4} ${y + 4.4} ${x} ${y + 4.4} Q${x - 3.4} ${y + 4.4} ${x - 4.2} ${y - 1} Z`}
            fill="#6B1D2E"
            stroke={c}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
          <path
            d={`M${x - 3.7} ${y - 0.6} Q${x} ${y + 0.3} ${x + 3.7} ${y - 0.6} L${x + 3.3} ${y + 1.2} Q${x} ${y + 1.8} ${x - 3.3} ${y + 1.2} Z`}
            fill="#FFFFFF"
          />
        </g>
      );
    case 'gap':
      return (
        <g>
          <path
            d={`M${x - 4.2} ${y - 1} Q${x} ${y} ${x + 4.2} ${y - 1} Q${x + 3.4} ${y + 4.4} ${x} ${y + 4.4} Q${x - 3.4} ${y + 4.4} ${x - 4.2} ${y - 1} Z`}
            fill="#6B1D2E"
            stroke={c}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
          <path
            d={`M${x - 3.7} ${y - 0.6} Q${x - 2} ${y - 0.1} ${x - 0.7} ${y - 0.1} V${y + 1.5} H${x - 3.3} Z`}
            fill="#FFFFFF"
          />
          <path
            d={`M${x + 3.7} ${y - 0.6} Q${x + 2} ${y - 0.1} ${x + 1.3} ${y - 0.1} V${y + 1.5} H${x + 3.3} Z`}
            fill="#FFFFFF"
          />
        </g>
      );
    case 'snarl':
      return (
        <g>
          <rect
            x={x - 5}
            y={y - 1.6}
            width={10}
            height={4.4}
            rx={1.6}
            fill="#FFFFFF"
            stroke={c}
            strokeWidth={1.1}
          />
          <Line
            d={`M${x - 5} ${y + 0.6} H${x + 5} M${x - 2.4} ${y - 1.6} V${y + 2.8} M${x} ${y - 1.6} V${y + 2.8} M${x + 2.4} ${y - 1.6} V${y + 2.8}`}
            c={c}
            w={0.7}
          />
        </g>
      );
    case 'smile':
    default:
      return (
        <Line d={`M${x - 3.4} ${y - 0.6} Q${x} ${y + 3} ${x + 3.4} ${y - 0.6}`} c={c} w={1.5} />
      );
  }
};

/**
 * A full chibi face. The current sprite action (sleeping, happy, eating) can
 * override the resting eyes and mouth unless `locked`.
 */
export const Face: FC<{
  eyes?: EyeKind;
  mouth?: MouthKind;
  iris?: string;
  brows?: 'none' | 'soft' | 'angry' | 'raised' | 'thick';
  browColor?: string;
  blush?: boolean;
  eyeY?: number;
  gap?: number;
  mouthY?: number;
  locked?: boolean;
  scale?: number;
}> = ({
  eyes = 'open',
  mouth = 'smile',
  iris,
  brows = 'soft',
  browColor = EYE_INK,
  blush = true,
  eyeY = 39,
  gap = 7.2,
  mouthY = 46.5,
  locked = false,
  scale = 1,
}) => {
  const { mood } = useKit();
  let e = eyes;
  let m = mouth;
  if (!locked) {
    if (mood === 'sleeping') {
      e = 'closed';
      m = mouth === 'none' ? 'none' : 'o';
    } else if (mood === 'happy') {
      e = eyes === 'dot' ? 'dot' : 'happy';
      m = mouth === 'none' ? 'none' : mouth === 'tongue' ? 'tongue' : 'open';
    } else if (mood === 'eating') {
      m = mouth === 'none' ? 'none' : 'chomp';
    } else if (mood === 'bounce') {
      m = mouth === 'none' ? 'none' : mouth === 'flat' ? 'o' : 'open';
    }
  }
  const lx = 50 - gap;
  const rx = 50 + gap;
  const showBrows = brows !== 'none' && e !== 'closed';
  const by = eyeY - 5.2;
  return (
    <g className="sprite-face">
      {blush && (
        <>
          <ellipse cx={lx - 2.2} cy={eyeY + 5.4} rx={2.8} ry={1.5} fill="#FF6F91" opacity="0.38" />
          <ellipse cx={rx + 2.2} cy={eyeY + 5.4} rx={2.8} ry={1.5} fill="#FF6F91" opacity="0.38" />
        </>
      )}
      <g className={e === 'open' || e === 'focused' ? 'sprite-blink' : undefined}>
        <Eye x={lx} y={eyeY} kind={e === 'wink' ? 'open' : e} iris={iris} s={scale} />
        <Eye x={rx} y={eyeY} kind={e === 'wink' ? 'happy' : e} iris={iris} flip s={scale} />
      </g>
      {showBrows && brows === 'soft' && (
        <>
          <Line
            d={`M${lx - 2.6} ${by + 0.4} Q${lx} ${by - 1} ${lx + 2.6} ${by + 0.2}`}
            c={browColor}
            w={1.3}
          />
          <Line
            d={`M${rx - 2.6} ${by + 0.2} Q${rx} ${by - 1} ${rx + 2.6} ${by + 0.4}`}
            c={browColor}
            w={1.3}
          />
        </>
      )}
      {showBrows && brows === 'thick' && (
        <>
          <Line
            d={`M${lx - 3} ${by + 0.6} Q${lx} ${by - 1} ${lx + 3} ${by + 0.4}`}
            c={browColor}
            w={2.2}
          />
          <Line
            d={`M${rx - 3} ${by + 0.4} Q${rx} ${by - 1} ${rx + 3} ${by + 0.6}`}
            c={browColor}
            w={2.2}
          />
        </>
      )}
      {showBrows && brows === 'raised' && (
        <>
          <Line
            d={`M${lx - 2.6} ${by} Q${lx} ${by - 2} ${lx + 2.6} ${by - 0.4}`}
            c={browColor}
            w={1.3}
          />
          <Line
            d={`M${rx - 2.6} ${by - 1.4} Q${rx} ${by - 2.6} ${rx + 2.6} ${by - 1}`}
            c={browColor}
            w={1.3}
          />
        </>
      )}
      {showBrows && brows === 'angry' && (
        <>
          <Line d={`M${lx - 3.2} ${by - 0.8} L${lx + 3} ${by + 1.4}`} c={browColor} w={2.2} />
          <Line d={`M${rx + 3.2} ${by - 0.8} L${rx - 3} ${by + 1.4}`} c={browColor} w={2.2} />
        </>
      )}
      <Mouth kind={m} y={mouthY} />
    </g>
  );
};

/** Bold jersey / chest number with an outline so it reads at small sizes. */
export const Num: FC<{
  n: string;
  x?: number;
  y?: number;
  fill: string;
  stroke: string;
  size?: number;
}> = ({ n, x = 50, y = 70, fill, stroke, size = 11 }) => (
  <text
    x={x}
    y={y}
    textAnchor="middle"
    fontSize={size}
    fontWeight="900"
    fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    fill={fill}
    stroke={stroke}
    strokeWidth={1.1}
    paintOrder="stroke"
    letterSpacing="-0.4"
  >
    {n}
  </text>
);

/** Glow wrapper using the shared blur filter. */
export const Glow: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => {
  const { ids } = useKit();
  return (
    <g filter={`url(#${ids.glow})`} className={className}>
      {children}
    </g>
  );
};
