import { FC } from 'react';
import {
  Arm,
  darken,
  Face,
  Glow,
  Head,
  HEAD_PATH,
  INK,
  Legs,
  Limb,
  Line,
  Sh,
  Torso,
  useKit,
} from './spriteKit';

const LIGHT = '#F3CBA5';
const PALE = '#F6DCC8';

/** Glowing slit eyes for helmets and masks; they dim to a line while sleeping. */
const GlowEyes: FC<{ c: string; y?: number; gap?: number; slant?: number; w?: number }> = ({
  c,
  y = 38,
  gap = 6.4,
  slant = 1.2,
  w = 5,
}) => {
  const { mood } = useKit();
  if (mood === 'sleeping') {
    return (
      <Line
        d={`M${50 - gap - w / 2} ${y + 0.6} H${50 - gap + w / 2} M${50 + gap - w / 2} ${y + 0.6} H${50 + gap + w / 2}`}
        c={darken(c, 0.4)}
        w={1.2}
      />
    );
  }
  return (
    <Glow className="sprite-eye-glow">
      <path
        d={`M${50 - gap - w / 2} ${y - slant} L${50 - gap + w / 2} ${y + slant} L${50 - gap + w / 2 - 0.6} ${y + slant + 1.8} L${50 - gap - w / 2 + 0.4} ${y - slant + 1.6} Z
            M${50 + gap + w / 2} ${y - slant} L${50 + gap - w / 2} ${y + slant} L${50 + gap - w / 2 + 0.6} ${y + slant + 1.8} L${50 + gap + w / 2 - 0.4} ${y - slant + 1.6} Z`}
        fill={c}
      />
    </Glow>
  );
};

/* ---------------- Ultramarine ---------------- */
const UM = '#2453D6';
const UM_GOLD = '#F5B531';

export const Ultramarine: FC = () => (
  <g className="ultramarine-sprite">
    {/* power pack */}
    <Sh as="rect" x={31} y={40} width={38} height={22} rx={6} fill={darken(UM, 0.2)} />
    <Sh as="rect" x={30} y={31} width={8} height={12} rx={3} fill="#334155" />
    <Sh as="rect" x={62} y={31} width={8} height={12} rx={3} fill="#334155" />
    <Legs pants={UM} shoes={darken(UM, 0.15)} sole={UM_GOLD} spread={8} w={9} />
    <Sh as="rect" x={37.4} y={80} width={8} height={5} rx={2} fill={darken(UM, 0.15)} sw={1.1} />
    <Sh as="rect" x={54.6} y={80} width={8} height={5} rx={2} fill={darken(UM, 0.15)} sw={1.1} />
    <Torso fill={UM} sw={15} hw={13} top={48}>
      <path
        d="M41 56 L46 60 L50 57 L54 60 L59 56 L56 63 L50 61 L44 63 Z"
        fill={UM_GOLD}
        stroke={INK}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <Sh
        as="rect"
        x={37}
        y={70.6}
        width={26}
        height={4.4}
        rx={1}
        fill="#1F2937"
        hl={false}
        sw={1.1}
      />
      <Sh as="rect" x={47.4} y={70} width={5.2} height={5.6} rx={1} fill={UM_GOLD} sw={0.9} />
    </Torso>
    {/* bolter */}
    <Sh d="M38 64 H74 Q76 64 76 66 V69 H60 L58 74 H52 L53 69 H38 Z" fill="#1F2937" sw={1.3} />
    <Sh as="rect" x={74} y={64.6} width={7} height={3} rx={1} fill="#4B5563" sw={1} />
    <Sh
      as="rect"
      x={44}
      y={61.4}
      width={14}
      height={3.2}
      rx={1}
      fill="#4B5563"
      hl={false}
      sw={0.9}
    />
    <Sh as="circle" cx={40} cy={67} r={4} fill={UM} />
    <Sh as="circle" cx={58} cy={71} r={4} fill={UM} />
    {/* pauldrons */}
    <Sh d="M20 52 C20 42 28 38 36 40 C40 42 41 48 40 56 C34 60 24 60 20 52 Z" fill={UM} rim />
    <Line d="M21 51 C22 44 28 40.6 35.4 41.6" c={UM_GOLD} w={2} />
    <path
      d="M25.6 45 V50.4 C25.6 54.4 34.4 54.4 34.4 50.4 V45 H31.8 V50 C31.8 51.6 28.2 51.6 28.2 50 V45 Z"
      fill="#F8FAFC"
      stroke={INK}
      strokeWidth="0.8"
    />
    <Sh d="M80 52 C80 42 72 38 64 40 C60 42 59 48 60 56 C66 60 76 60 80 52 Z" fill={UM} rim />
    <Line d="M79 51 C78 44 72 40.6 64.6 41.6" c={UM_GOLD} w={2} />
    {/* helmet */}
    <Sh
      d="M36 32 C36 22 42 18 50 18 C58 18 64 22 64 32 L63 44 Q58 50 50 50 Q42 50 37 44 Z"
      fill={UM}
      rim
    />
    <Sh d="M45 40 H55 L53.6 48 H46.4 Z" fill="#4B5563" sw={1.1} />
    <Line d="M46.6 42.6 H53.4 M46.8 45.2 H53.2" c="#9CA3AF" w={0.8} />
    <Sh d="M38.6 33 H61.4 L60.6 38.6 H39.4 Z" fill="#111827" hl={false} sw={1} />
    <GlowEyes c="#F43F5E" y={35.4} gap={5.6} slant={0.6} w={6} />
  </g>
);

/* ---------------- Hydralisk ---------------- */
const HYD = '#8B5A3C';
const HYD_BELLY = '#E2BF92';
const HYD_HOOD = '#6B2F4E';

export const Hydralisk: FC = () => (
  <g className="hydralisk-sprite">
    {/* coiled tail */}
    <Sh
      d="M40 80 C26 80 18 86 22 92 C26 96 42 96 56 95 C72 94 82 92 80 86 C78 80 66 78 60 78 Z"
      fill={HYD}
      rim
    />
    <Line d="M30 88 Q44 84 58 87 M26 92 Q44 89 66 91" c={darken(HYD, 0.35)} w={1} />
    {/* hood plates with spines */}
    <Sh
      d="M50 22 C38 22 26 30 22 48 C21 56 26 60 32 58 C34 46 40 38 50 36 C60 38 66 46 68 58 C74 60 79 56 78 48 C74 30 62 22 50 22 Z"
      fill={HYD_HOOD}
      rim
    />
    <Line
      d="M26 50 L22 40 M30 40 L27 30 M38 32 L37 23 M74 50 L78 40 M70 40 L73 30 M62 32 L63 23"
      c={HYD_BELLY}
      w={1.6}
    />
    {/* upright body */}
    <Sh d="M38 52 C38 46 44 44 50 44 C56 44 62 46 62 52 L60 82 H40 Z" fill={HYD} rim />
    <Sh d="M44 52 H56 L54.6 80 H45.4 Z" fill={HYD_BELLY} hl={false} sw={1} />
    <Line
      d="M44.6 58 H55.4 M45 64 H55 M45.2 70 H54.8 M45.4 76 H54.6"
      c={darken(HYD_BELLY, 0.35)}
      w={0.9}
    />
    {/* scythe arms */}
    <Limb d="M40 56 Q32 58 30 66" c={HYD} w={4.6} />
    <Limb d="M60 56 Q68 58 70 66" c={HYD} w={4.6} />
    <Sh d="M30 66 C22 64 15 56 14 44 C20 52 26 56 32 62 Z" fill="#F5E6C8" rim />
    <Sh d="M70 66 C78 64 85 56 86 44 C80 52 74 56 68 62 Z" fill="#F5E6C8" rim />
    {/* head */}
    <Sh
      d="M50 24 C42 24 37 30 37 38 C37 46 43 51 50 51 C57 51 63 46 63 38 C63 30 58 24 50 24 Z"
      fill={HYD}
      rim
    />
    <Sh d="M44 25.6 Q50 22 56 25.6 L54 33 H46 Z" fill={HYD_HOOD} hl={false} sw={1} />
    <Face eyes="angry" mouth="none" brows="none" blush={false} iris="#A3E635" eyeY={38} gap={6} />
    {/* fanged maw */}
    <Sh
      d="M44 44 Q50 47 56 44 Q55 50 50 50.6 Q45 50 44 44 Z"
      fill="#3B0A12"
      shade={false}
      hl={false}
      sw={1.1}
    />
    <path
      d="M45.4 45 L46.6 48.4 L47.6 45.6 M54.6 45 L53.4 48.4 L52.4 45.6"
      fill="#F8FAFC"
      stroke={INK}
      strokeWidth="0.6"
    />
    <circle cx="50" cy="51.6" r="1.1" fill="#A3E635" className="venom-drip" />
  </g>
);

/* ---------------- Ultralisk ---------------- */
const ULT = '#6E1E3A';
const ULT_PLATE = '#B0466A';
const BONE = '#F3E7C9';

export const Ultralisk: FC = () => (
  <g className="ultralisk-sprite">
    {/* kaiser blades */}
    <Sh d="M30 50 C14 44 6 30 10 8 C14 22 22 34 36 40 Z" fill={BONE} rim />
    <Sh d="M70 50 C86 44 94 30 90 8 C86 22 78 34 64 40 Z" fill={BONE} rim />
    <Line
      d="M27 45 C17 38 12 28 11.6 16 M73 45 C83 38 88 28 88.4 16"
      c={darken(BONE, 0.3)}
      w={0.9}
    />
    {/* legs */}
    <Limb d="M30 70 L24 90" c={darken(ULT, 0.15)} w={8} />
    <Limb d="M70 70 L76 90" c={darken(ULT, 0.15)} w={8} />
    <Sh d="M18 94 L22 87 L30 87 L32 94 Z" fill="#2A0A16" sw={1.2} />
    <Sh d="M68 94 L70 87 L78 87 L82 94 Z" fill="#2A0A16" sw={1.2} />
    {/* hulking carapace */}
    <Sh
      d="M20 58 C20 38 32 26 50 26 C68 26 80 38 80 58 C80 74 68 84 50 84 C32 84 20 74 20 58 Z"
      fill={ULT}
      rim
    />
    <Line d="M25 46 Q50 36 75 46 M22 58 Q50 48 78 58 M24 70 Q50 62 76 70" c={ULT_PLATE} w={2.2} />
    <Glow>
      <circle cx="36" cy="44" r="1.6" fill="#4ADE80" />
      <circle cx="64" cy="44" r="1.6" fill="#4ADE80" />
      <circle cx="50" cy="39" r="1.8" fill="#4ADE80" />
    </Glow>
    {/* low armoured head */}
    <Sh
      d="M38 66 C38 58 44 56 50 56 C56 56 62 58 62 66 C62 76 56 82 50 82 C44 82 38 76 38 66 Z"
      fill="#3A0A1C"
      rim
    />
    <Glow>
      <circle cx="44.6" cy="65" r="1.6" fill="#86EFAC" />
      <circle cx="55.4" cy="65" r="1.6" fill="#86EFAC" />
      <circle cx="47.6" cy="62.4" r="1" fill="#86EFAC" />
      <circle cx="52.4" cy="62.4" r="1" fill="#86EFAC" />
    </Glow>
    <path
      d="M42 74 Q38 80 41 86 L44 77 Z M58 74 Q62 80 59 86 L56 77 Z"
      fill={BONE}
      stroke={INK}
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </g>
);

/* ---------------- Terran Marine ---------------- */
const TM = '#3B6FD6';
const VISOR = '#F59E0B';

export const TerranMarine: FC = () => {
  const { mood } = useKit();
  return (
    <g className="terran-marine-sprite">
      <Legs pants={TM} shoes="#1F2937" sole="#9CA3AF" spread={8} w={9} />
      <Sh as="rect" x={38} y={80} width={7} height={4.6} rx={1.6} fill="#64748B" sw={1} />
      <Sh as="rect" x={55} y={80} width={7} height={4.6} rx={1.6} fill="#64748B" sw={1} />
      <Torso fill={TM} sw={15} hw={13} top={48}>
        <Sh as="rect" x={41} y={56} width={8} height={11} rx={1.6} fill="#475569" sw={1} />
        <circle cx="45" cy="59.6" r="1.3" fill="#22C55E" />
        <circle cx="45" cy="63.6" r="1.3" fill="#EF4444" />
        <Line d="M53 57 H59 M53 60 H59 M53 63 H59" c="#1E3A8A" w={1.1} />
        <Sh
          as="rect"
          x={37}
          y={70.6}
          width={26}
          height={4.4}
          rx={1}
          fill="#1F2937"
          hl={false}
          sw={1.1}
        />
      </Torso>
      {/* gauss rifle */}
      <Sh d="M34 66 H78 Q80 66 80 68 V71 H62 L60 77 H54 L55 71 H34 Z" fill="#1F2937" sw={1.3} />
      <Sh as="rect" x={78} y={66.6} width={7} height={3} rx={1} fill="#4B5563" sw={1} />
      <Line d="M58 68.4 H74" c={VISOR} w={1} />
      <Sh as="circle" cx={37} cy={69} r={4} fill={TM} />
      <Sh as="circle" cx={57} cy={73} r={4} fill={TM} />
      {/* shoulder domes */}
      <Sh as="circle" cx={29} cy={50} r={10} fill={TM} rim />
      <Sh as="circle" cx={71} cy={50} r={10} fill={TM} rim />
      <path
        d="M22 47 L28 43.4 L30 45 L24 49 Z M78 47 L72 43.4 L70 45 L76 49 Z"
        fill={VISOR}
        stroke={INK}
        strokeWidth="0.8"
      />
      {/* helmet */}
      <Sh
        d="M34 34 C34 22 41 17 50 17 C59 17 66 22 66 34 L65 46 Q58 52 50 52 Q42 52 35 46 Z"
        fill={TM}
        rim
      />
      <Sh d="M38 30 Q50 26 62 30 L60.6 42 Q50 46 39.4 42 Z" fill={VISOR} sw={1.2} />
      {mood === 'sleeping' ? (
        <Line d="M42 37 Q45 39 48 37 M52 37 Q55 39 58 37" c="#7C2D12" w={1.3} />
      ) : (
        <path
          d="M42 36 L47 37 M53 37 L58 36"
          stroke="#7C2D12"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.7"
        />
      )}
      <path
        d="M40.6 31 Q46 28.6 52 29.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <Glow>
        <circle cx="64.6" cy="26" r="1.8" fill="#7DD3FC" />
      </Glow>
    </g>
  );
};

/* ---------------- Goliath ---------------- */
const GOL = '#64748B';
const GOL_DARK = '#334155';

export const Goliath: FC = () => (
  <g className="goliath-sprite">
    {/* reverse-jointed legs */}
    <Limb d="M40 62 L30 74 L38 88" c={GOL_DARK} w={5.4} />
    <Limb d="M60 62 L70 74 L62 88" c={GOL_DARK} w={5.4} />
    <Sh as="circle" cx={30} cy={74} r={3.4} fill={GOL} sw={1.1} />
    <Sh as="circle" cx={70} cy={74} r={3.4} fill={GOL} sw={1.1} />
    <Sh d="M29 94 L32 88 H44 L46 94 Z" fill="#1F2937" sw={1.2} />
    <Sh d="M54 94 L56 88 H68 L71 94 Z" fill="#1F2937" sw={1.2} />
    {/* missile pods */}
    <Sh as="rect" x={14} y={28} width={16} height={18} rx={3} fill={GOL_DARK} rim />
    <Sh as="rect" x={70} y={28} width={16} height={18} rx={3} fill={GOL_DARK} rim />
    <g fill="#EF4444" stroke={INK} strokeWidth="0.8">
      <circle cx="18.6" cy="33" r="2" />
      <circle cx="25.4" cy="33" r="2" />
      <circle cx="18.6" cy="40.6" r="2" />
      <circle cx="25.4" cy="40.6" r="2" />
      <circle cx="74.6" cy="33" r="2" />
      <circle cx="81.4" cy="33" r="2" />
      <circle cx="74.6" cy="40.6" r="2" />
      <circle cx="81.4" cy="40.6" r="2" />
    </g>
    <Limb d="M30 38 H36" c={GOL_DARK} w={4} />
    <Limb d="M70 38 H64" c={GOL_DARK} w={4} />
    {/* cockpit chassis */}
    <Sh
      d="M34 34 C34 28 38 26 44 26 H56 C62 26 66 28 66 34 L68 58 Q68 64 62 64 H38 Q32 64 32 58 Z"
      fill={GOL}
      rim
    />
    <Sh d="M40 33 H60 L58.6 44 Q50 47 41.4 44 Z" fill="#0E7490" sw={1.2} />
    <Glow>
      <path d="M42.4 35 H57.6 L56.8 41 Q50 43 43.2 41 Z" fill="#22D3EE" opacity="0.85" />
    </Glow>
    <path
      d="M44 36.4 L49 36.4"
      stroke="#FFFFFF"
      strokeWidth="1.1"
      strokeLinecap="round"
      opacity="0.85"
    />
    <Line d="M38 52 H62 M40 56 H60" c={GOL_DARK} w={1} />
    <Sh as="circle" cx={50} cy={22} r={4} fill={GOL_DARK} sw={1.1} />
    <Glow>
      <circle cx="50" cy="22" r="1.6" fill="#22D3EE" className="radar-blip" />
    </Glow>
    {/* twin autocannons */}
    <Sh as="rect" x={41} y={60} width={6} height={16} rx={1.6} fill="#1F2937" sw={1.1} />
    <Sh as="rect" x={53} y={60} width={6} height={16} rx={1.6} fill="#1F2937" sw={1.1} />
    <circle cx="44" cy="76.4" r="1.3" fill="#F59E0B" />
    <circle cx="56" cy="76.4" r="1.3" fill="#F59E0B" />
  </g>
);

/* ---------------- Zealot ---------------- */
const PROTOSS_SKIN = '#B9A68C';
const P_GOLD = '#F5B531';
const PSI = '#38E8FF';

export const Zealot: FC = () => (
  <g className="zealot-sprite">
    {/* nerve cords */}
    <Limb d="M40 34 Q30 50 34 70" c={darken(PROTOSS_SKIN, 0.25)} w={3.4} />
    <Limb d="M60 34 Q70 50 66 70" c={darken(PROTOSS_SKIN, 0.25)} w={3.4} />
    <Legs pants="#334155" shoes={P_GOLD} sole="#92400E" />
    <Sh d="M38 72 H62 L64 84 L56 80 L50 85 L44 80 L36 84 Z" fill="#1E3A8A" sw={1.2} />
    <Torso fill={P_GOLD}>
      <Line d="M40 56 Q50 62 60 56" c="#A16207" w={1} />
      <Glow>
        <path d="M50 58 L54 63 L50 68 L46 63 Z" fill={PSI} />
      </Glow>
      <path d="M50 58 L54 63 L50 68 L46 63 Z" fill="none" stroke={INK} strokeWidth="1" />
    </Torso>
    <Sh d="M34 48 Q40 44 44 50 L42 57 Q36 58 33 54 Z" fill={P_GOLD} sw={1.1} />
    <Sh d="M66 48 Q60 44 56 50 L58 57 Q64 58 67 54 Z" fill={P_GOLD} sw={1.1} />
    {/* psi blades */}
    <Glow className="psi-blade">
      <path d="M28 66 L6 50 L10 48 L31 62 Z" fill={PSI} opacity="0.95" />
      <path d="M72 66 L94 50 L90 48 L69 62 Z" fill={PSI} opacity="0.95" />
    </Glow>
    <path
      d="M28.6 64.4 L8 49.2 M71.4 64.4 L92 49.2"
      stroke="#FFFFFF"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <Arm from={[38.4, 55]} to={[30, 66]} sleeve={darken(P_GOLD, 0.15)} hand={P_GOLD} handR={4} />
    <Arm from={[61.6, 55]} to={[70, 66]} sleeve={darken(P_GOLD, 0.15)} hand={P_GOLD} handR={4} />
    {/* elongated protoss head */}
    <Sh
      d="M34 34 C33 22 40 16 50 16 C60 16 67 22 66 34 C65 44 58 52 50 52 C42 52 35 44 34 34 Z"
      fill={PROTOSS_SKIN}
      rim
    />
    <Sh d="M38 24 Q50 14 62 24 L60 27 Q50 20 40 27 Z" fill={P_GOLD} sw={1} />
    <Line d="M44 46 Q50 48 56 46" c={darken(PROTOSS_SKIN, 0.35)} w={1} />
    <GlowEyes c={PSI} y={36} gap={6.6} slant={1.4} w={6} />
  </g>
);

/* ---------------- Archon ---------------- */
export const Archon: FC = () => (
  <g className="archon-sprite">
    <g className="archon-pulse">
      <circle cx="50" cy="52" r="42" fill="#38E8FF" opacity="0.14" />
      <circle cx="50" cy="52" r="32" fill="#7DD3FC" opacity="0.22" />
    </g>
    <Glow>
      <path
        d="M50 14 C34 20 26 40 30 62 C33 78 44 92 50 94 C56 92 67 78 70 62 C74 40 66 20 50 14 Z"
        fill="#E0F7FF"
      />
      <ellipse cx="50" cy="50" rx="13" ry="22" fill="#FFFFFF" />
      <ellipse cx="50" cy="46" rx="6" ry="12" fill="#FEF9C3" />
    </Glow>
    {/* crackling arcs */}
    <path
      d="M18 50 L26 44 L23 56 L32 52 M82 50 L74 44 L77 56 L68 52 M42 80 L50 88 L46 94 M58 80 L50 88 L54 94"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="archon-arcs"
    />
    {/* bright head of the merged templar */}
    <circle cx="50" cy="29" r="9" fill="#FFFFFF" opacity="0.85" />
    {/* floating braces */}
    <g className="archon-braces">
      <Sh d="M16 48 Q26 38 36 46 L34 58 Q22 60 15 54 Z" fill={P_GOLD} rim />
      <Sh d="M84 48 Q74 38 64 46 L66 58 Q78 60 85 54 Z" fill={P_GOLD} rim />
      <Glow>
        <circle cx="25" cy="50" r="2.2" fill={PSI} />
        <circle cx="75" cy="50" r="2.2" fill={PSI} />
      </Glow>
      <Sh d="M45 44 H55 L50 52 Z" fill={P_GOLD} sw={1} />
    </g>
    <GlowEyes c="#22D3EE" y={29} gap={4.4} slant={1} w={4.4} />
  </g>
);

/* ---------------- Dark Templar ---------------- */
const VOID = '#34D399';

export const DarkTemplar: FC = () => (
  <g className="dark-templar-sprite">
    <ellipse cx="50" cy="91" rx="26" ry="5" fill={VOID} opacity="0.18" className="void-smoke" />
    <Limb d="M43 76 L40 84 L43 90" c="#1E293B" w={6} />
    <Limb d="M57 76 L60 84 L57 90" c="#1E293B" w={6} />
    <Sh d="M37 94 Q37 88.6 43 88.6 Q48.6 88.6 48.6 94 Z" fill="#0F172A" />
    <Sh d="M51.4 94 Q51.4 88.6 57 88.6 Q63 88.6 63 94 Z" fill="#0F172A" />
    {/* cloak skirt */}
    <Sh d="M37 66 L32 86 L40 82 L46 88 L50 82 L54 88 L60 82 L68 86 L63 66 Z" fill="#1E293B" rim />
    <Torso fill="#273449">
      <Glow>
        <path d="M50 56 L53 61 L50 66 L47 61 Z" fill={VOID} />
      </Glow>
      <Line d="M40 54 Q50 60 60 54" c="#475569" w={1} />
    </Torso>
    {/* warp scythe */}
    <Arm from={[61.6, 55]} to={[72, 64]} via={[68, 62]} sleeve="#273449" hand="#475569" />
    <Glow className="warp-blade">
      <path d="M72 64 L96 36 Q88 58 76 70 Z" fill={VOID} opacity="0.95" />
    </Glow>
    <path d="M73 64 L95 38" stroke="#ECFDF5" strokeWidth="1.1" strokeLinecap="round" />
    <Arm from={[38.4, 55]} to={[31, 69]} sleeve="#273449" hand="#475569" />
    {/* hood */}
    <Sh d="M31 40 C29 22 38 14 50 14 C62 14 71 22 69 40 L66 52 Q50 56 34 52 Z" fill="#1E293B" rim />
    <Sh
      d="M38 36 C38 28 43 24 50 24 C57 24 62 28 62 36 C62 44 57 50 50 50 C43 50 38 44 38 36 Z"
      fill="#070A12"
      shade={false}
      hl={false}
      sw={1.1}
    />
    <GlowEyes c={VOID} y={36} gap={5.4} slant={1.4} w={5} />
  </g>
);

/* ---------------- Arthas (Paladin prince) ---------------- */
const SILVER = '#D6DEE8';
const ROYAL = '#1D4ED8';

export const Arthas: FC = () => (
  <g className="prince-arthas-sprite">
    <Sh
      className="sprite-cape"
      d="M38 50 Q28 70 24 92 Q37 95 50 92 Q63 95 76 92 Q72 70 62 50 Z"
      fill={ROYAL}
      rim
    />
    <Legs pants="#94A3B8" shoes={SILVER} sole={P_GOLD} />
    <Torso fill={SILVER}>
      <Sh d="M44 53 H56 L55 77 H45 Z" fill={ROYAL} hl={false} sw={1} />
      <Line d="M48 58 V69 H53" c={P_GOLD} w={1.8} />
      <Line d="M37.6 54 Q50 58 62.4 54" c={P_GOLD} w={1.2} />
    </Torso>
    <Sh d="M33 50 Q38 45 44 49 L42 56 Q36 57 32.6 54 Z" fill={SILVER} sw={1.1} />
    <Sh d="M67 50 Q62 45 56 49 L58 56 Q64 57 67.4 54 Z" fill={SILVER} sw={1.1} />
    <Arm from={[38.4, 55]} to={[31, 69]} sleeve="#94A3B8" hand={SILVER} handR={4} />
    {/* Light's Vengeance */}
    <Limb d="M72 40 L74 86" c="#7C4A1E" w={2.8} />
    <Sh as="rect" x={63} y={32} width={20} height={11} rx={2.4} fill={P_GOLD} rim />
    <Line d="M66 37.4 H80" c="#A16207" w={0.9} />
    <Glow>
      <circle cx="73" cy="37.4" r="2.6" fill="#FEF9C3" />
    </Glow>
    <Arm from={[61.6, 55]} to={[73, 62]} via={[69, 62]} sleeve="#94A3B8" hand={SILVER} handR={4} />
    <Sh
      d="M32 38 C30 50 31 58 34 62 Q38 60 38 52 L38 38 Z M68 38 C70 50 69 58 66 62 Q62 60 62 52 L62 38 Z"
      fill="#F4D35E"
    />
    <Head skin={LIGHT} />
    <Sh
      d="M32.6 37 C31 24 39 17.6 50 17.6 C61 17.6 69 24 67.4 37 C64 30 60 27.6 56 27 C54 29.6 49 31 44 30.6 C40 31.6 35 33.6 32.6 37 Z"
      fill="#F4D35E"
      rim
    />
    <Line d="M45 21 Q41 24 38.6 29 M55 20.6 Q59 23 61.4 27" c="#FFF7CC" w={1} o={0.8} />
    <Face
      eyes="focused"
      mouth="smile"
      brows="soft"
      browColor="#B08A2E"
      blush={false}
      iris="#3B82F6"
    />
  </g>
);

/* ---------------- Lich King ---------------- */
const SARONITE = '#2B3445';
const ICE = '#7DE3FF';

export const LichKing: FC = () => (
  <g className="lich-king-sprite">
    <Sh
      d="M38 50 Q26 70 20 92 L30 88 L36 93 L44 88 L50 93 L56 88 L64 93 L70 88 L80 92 Q74 70 62 50 Z"
      fill="#111827"
      rim
    />
    <Legs pants={SARONITE} shoes="#1E293B" sole={ICE} />
    <Torso fill={SARONITE}>
      <Line d="M38 56 Q50 62 62 56 M50 60 V76" c="#4B5563" w={1} />
      <Glow>
        <path d="M47 64 Q50 61 53 64 Q53 67 51.6 67.6 V69 H48.4 V67.6 Q47 67 47 64 Z" fill={ICE} />
      </Glow>
    </Torso>
    {/* skull pauldrons */}
    <Sh d="M24 50 Q28 42 38 44 L40 56 Q30 60 24 56 Z" fill={SARONITE} rim />
    <Sh d="M76 50 Q72 42 62 44 L60 56 Q70 60 76 56 Z" fill={SARONITE} rim />
    <path
      d="M26 46 L22 38 L30 44 M74 46 L78 38 L70 44"
      fill="#94A3B8"
      stroke={INK}
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <Arm from={[38.4, 56]} to={[31, 70]} sleeve={SARONITE} hand="#475569" handR={4} />
    {/* Frostmourne */}
    <Glow className="frostmourne">
      <path d="M71 56 L92 92 L88 94 L67.6 58 Z" fill="#DFF6FF" />
    </Glow>
    <path
      d="M71 56 L92 92 L88 94 L67.6 58 Z"
      fill="none"
      stroke={INK}
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <Line d="M72 62 L74 64 M76 69 L78 71 M80 76 L82 78 M84 83 L86 85" c="#0284C7" w={1.1} />
    <Sh d="M63 54 L73 50 L76 55 L66 59 Z" fill="#94A3B8" sw={1.1} />
    <Arm
      from={[61.6, 56]}
      to={[68, 58]}
      via={[66, 61]}
      sleeve={SARONITE}
      hand="#475569"
      handR={4}
    />
    {/* platinum hair */}
    <Sh
      d="M33 38 C30 52 31 62 34 70 Q38 66 38 56 L38 38 Z M67 38 C70 52 69 62 66 70 Q62 66 62 56 L62 38 Z"
      fill="#E2E8F0"
    />
    {/* Helm of Domination */}
    <Sh d={HEAD_PATH} fill="#1E293B" rim />
    <Sh
      d="M33 32 L28 8 L38 22 L42 6 L47 20 L50 2 L53 20 L58 6 L62 22 L72 8 L67 32 Q50 26 33 32 Z"
      fill={SARONITE}
      rim
    />
    <Sh d="M38 34 H62 L60 46 Q50 52 40 46 Z" fill="#070A12" shade={false} hl={false} sw={1.1} />
    <GlowEyes c={ICE} y={38.6} gap={5.4} slant={1.2} w={5.4} />
  </g>
);

/* ---------------- Barbarian ---------------- */
const BARB_SKIN = '#D9A47A';
const BEARD_RED = '#8A3B1C';

export const Barbarian: FC = () => (
  <g className="diablo-barbarian-sprite">
    {/* axes */}
    <Limb d="M24 44 L26 84" c="#6B3E1E" w={2.6} />
    <Sh d="M24 40 C14 38 10 46 12 54 C16 52 20 50 25 50 Z" fill="#CBD5E1" rim />
    <Limb d="M76 44 L74 84" c="#6B3E1E" w={2.6} />
    <Sh d="M76 40 C86 38 90 46 88 54 C84 52 80 50 75 50 Z" fill="#CBD5E1" rim />
    <Legs pants="#6B3E1E" shoes="#4A2A12" sole="#2B1708" w={8} />
    <Sh d="M37 70 H63 L65 83 L58 80 L50 84 L42 80 L35 83 Z" fill="#78350F" sw={1.2} />
    <Torso fill={BARB_SKIN} sw={15} hw={13}>
      <Line d="M40 57 Q45 61 50 57 Q55 61 60 57 M50 52 V69 M45 64 H55" c="#A0663E" w={1.1} />
      <Line d="M43 54 L45 66 M57 54 L55 66" c="#DC2626" w={1.8} />
      <Sh as="rect" x={36.6} y={69} width={26.8} height={4.4} rx={1} fill="#3B2412" sw={1.1} />
      <Sh as="circle" cx={50} cy={71.2} r={2.4} fill={P_GOLD} sw={0.9} />
    </Torso>
    {/* fur mantle */}
    <Sh d="M33 50 Q30 44 36 44 Q40 40 44 46 L42 56 Q36 58 33 54 Z" fill="#7C5A3A" />
    <Arm
      from={[37, 55]}
      to={[26, 66]}
      via={[29, 58]}
      sleeve={BARB_SKIN}
      hand={BARB_SKIN}
      w={7}
      handR={4.4}
    />
    <Arm
      from={[63, 55]}
      to={[74, 66]}
      via={[71, 58]}
      sleeve={BARB_SKIN}
      hand={BARB_SKIN}
      w={7}
      handR={4.4}
    />
    <Head skin={BARB_SKIN} />
    {/* big beard */}
    <Sh
      d="M34 38 C33 50 40 60 50 61 C60 60 67 50 66 38 C64 42 61 44 58 44 C55 42 53 42.6 50 43.4 C47 42.6 45 42 42 44 C39 44 36 42 34 38 Z"
      fill={BEARD_RED}
      rim
    />
    <Line d="M42 50 L43 55 M50 52 V58 M58 50 L57 55" c="#5C2410" w={0.9} />
    {/* horned helm */}
    <Sh d="M34 26 C30 14 22 12 16 16 C22 18 26 24 30 32 Z" fill="#F3E7C9" rim />
    <Sh d="M66 26 C70 14 78 12 84 16 C78 18 74 24 70 32 Z" fill="#F3E7C9" rim />
    <Sh
      d="M32.6 33 C32.6 22 40 17.6 50 17.6 C60 17.6 67.4 22 67.4 33 Q50 28 32.6 33 Z"
      fill="#64748B"
      rim
    />
    <Line d="M50 18 V30" c="#94A3B8" w={1.6} />
    <Face eyes="angry" mouth="grin" brows="angry" browColor="#5C2410" blush={false} mouthY={47} />
    <path
      d="M38 40.6 H46 M54 40.6 H62"
      stroke="#DC2626"
      strokeWidth="1.2"
      opacity="0.8"
      strokeLinecap="round"
    />
  </g>
);

/* ---------------- Paladin ---------------- */
export const Paladin: FC = () => (
  <g className="diablo-paladin-sprite">
    <Legs pants="#94A3B8" shoes={SILVER} sole={P_GOLD} />
    <Torso fill={SILVER}>
      <Sh d="M44 53 H56 L55 77 H45 Z" fill={ROYAL} hl={false} sw={1} />
      <Line d="M50 56 V72 M46 61 H54" c={P_GOLD} w={1.8} />
    </Torso>
    <Sh d="M33 50 Q38 45 44 49 L42 56 Q36 57 32.6 54 Z" fill={SILVER} sw={1.1} />
    <Sh d="M67 50 Q62 45 56 49 L58 56 Q64 57 67.4 54 Z" fill={SILVER} sw={1.1} />
    {/* blessed hammer */}
    <g className="blessed-hammer">
      <Glow>
        <rect x="71" y="34" width="12" height="8" rx="1.6" fill="#FEF08A" />
      </Glow>
      <rect
        x="71"
        y="34"
        width="12"
        height="8"
        rx="1.6"
        fill="none"
        stroke={INK}
        strokeWidth="1.1"
      />
      <Limb d="M77 42 L77 52" c="#A16207" w={2} />
    </g>
    <Arm from={[61.6, 55]} to={[69, 69]} sleeve="#94A3B8" hand={SILVER} handR={4} />
    <Head skin="#E8B48C">
      <path d="M38 44 Q40 52 50 53 Q60 52 62 44 Q58 48 50 48 Q42 48 38 44 Z" fill="#6B4A33" />
    </Head>
    {/* bascinet helm */}
    <Sh
      d="M32.6 36 C32 22 40 16.6 50 16.6 C60 16.6 68 22 67.4 36 L64 36 C63 30 58 28 50 28 C42 28 37 30 36 36 Z"
      fill={SILVER}
      rim
    />
    <Line d="M50 17 V28" c={P_GOLD} w={2} />
    <Face eyes="focused" mouth="smile" brows="soft" blush={false} iris="#2563EB" />
    <Arm from={[38.4, 55]} to={[31, 66]} sleeve="#94A3B8" hand={SILVER} handR={4} />
    {/* kite shield */}
    <Sh d="M18 52 H36 L35 70 C35 80 27 88 27 88 C27 88 19 80 19 70 Z" fill={ROYAL} rim />
    <path
      d="M18 52 H36 L35 70 C35 80 27 88 27 88 C27 88 19 80 19 70 Z"
      fill="none"
      stroke={P_GOLD}
      strokeWidth="1.4"
      transform="translate(27 70) scale(0.86) translate(-27 -70)"
    />
    <Line d="M27 57 V80 M21.6 64 H32.4" c={P_GOLD} w={2.2} />
  </g>
);

/* ---------------- Zed ---------------- */
const ZED_RED = '#DC2626';

export const Zed: FC = () => (
  <g className="zed-sprite">
    {/* shuriken on the back */}
    <Sh d="M50 10 L56 30 L76 34 L56 38 L50 58 L44 38 L24 34 L44 30 Z" fill="#334155" rim />
    <Sh as="circle" cx={50} cy={34} r={3.6} fill={ZED_RED} sw={1} />
    <Legs pants="#1E293B" shoes="#0F172A" sole={ZED_RED} />
    <Torso fill="#1E293B">
      <Line d="M43 50.4 L50 60 L57 50.4" c={ZED_RED} w={2.2} />
      <Sh as="rect" x={38.6} y={70} width={22.8} height={4} rx={1} fill={ZED_RED} sw={1.1} />
    </Torso>
    {/* arm blades */}
    <Sh d="M30 64 L14 60 L28 70 Z" fill="#E2E8F0" rim />
    <Sh d="M70 64 L86 60 L72 70 Z" fill="#E2E8F0" rim />
    <Arm from={[38.4, 54]} to={[31, 68]} sleeve="#1E293B" hand="#334155" />
    <Arm from={[61.6, 54]} to={[69, 68]} sleeve="#1E293B" hand="#334155" />
    {/* scarf */}
    <Sh d="M37 49 Q50 56 63 49 L63 53 Q50 60 37 53 Z" fill={ZED_RED} sw={1.1} />
    <Sh
      d="M60 52 L72 58 L68 60 L74 64 L60 58 Z"
      fill={ZED_RED}
      hl={false}
      sw={1}
      className="zed-scarf"
    />
    {/* masked helm */}
    <Sh d={HEAD_PATH} fill="#94A3B8" rim />
    <Sh
      d="M33.4 30 C34 22 41 18 50 18 C59 18 66 22 66.6 30 Q50 25 33.4 30 Z"
      fill="#334155"
      hl={false}
    />
    <Sh
      d="M37 36 L48 39 L50 42 L52 39 L63 36 L62 42 Q50 46 38 42 Z"
      fill="#111827"
      shade={false}
      sw={1.1}
    />
    <GlowEyes c="#F87171" y={39} gap={6.6} slant={1.2} w={5.6} />
    <Line d="M42 48 L50 51 L58 48" c="#64748B" w={1} />
  </g>
);

/* ---------------- Yone ---------------- */
export const Yone: FC = () => (
  <g className="yone-sprite">
    {/* long hair back */}
    <Sh
      d="M32 34 C28 50 30 66 34 78 Q40 74 40 60 L40 36 Z M68 34 C72 50 70 66 66 78 Q60 74 60 60 L60 36 Z"
      fill="#141022"
    />
    <path
      d="M33 70 Q34 76 34 78 M67 70 Q66 76 66 78"
      stroke="#DC2626"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* blades */}
    <Limb d="M30 66 L12 90" c="#CBD5E1" w={2.4} />
    <Glow className="spirit-blade">
      <path d="M70 66 L92 90" stroke="#F43F5E" strokeWidth="3.4" strokeLinecap="round" />
    </Glow>
    <path d="M70 66 L92 90" stroke="#FFE4E6" strokeWidth="1" strokeLinecap="round" />
    <Legs pants="#1E293B" shoes="#F8FAFC" sole="#DC2626" />
    <Torso fill="#F8FAFC">
      <Line d="M43 50.4 L50 60 L57 50.4" c="#DC2626" w={2.2} />
      <Sh as="rect" x={38.6} y={67} width={22.8} height={4} rx={1} fill="#DC2626" sw={1.1} />
      <path d="M38 71 L36 78 H64 L62 71 Z" fill="#E2E8F0" />
    </Torso>
    <Arm from={[38.4, 54]} to={[30, 66]} sleeve="#F8FAFC" hand={PALE} />
    <Arm from={[61.6, 54]} to={[70, 66]} sleeve="#F8FAFC" hand={PALE} />
    <Head skin={PALE} />
    <Sh
      d="M32.6 37 C31 24 39 17.6 50 17.6 C61 17.6 69 24 67.4 37 C64 30 58 27 52 27 L48 31 L45 27.4 C40 28 35 32 32.6 37 Z"
      fill="#141022"
      rim
    />
    <Face eyes="focused" mouth="flat" brows="soft" blush={false} iris="#7DD3FC" />
    {/* Azakana mask worn on the side of the head */}
    <g transform="rotate(-18 66 24)">
      <Sh
        d="M58 22 C58 16 62 14 66 14 C70 14 74 16 74 22 C74 28 70 32 66 32 C62 32 58 28 58 22 Z"
        fill="#DC2626"
        rim
      />
      <path
        d="M59 16 L57 8 L62 14 M73 16 L75 8 L70 14"
        fill="#DC2626"
        stroke={INK}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M61 21 L65 22 L64 23.4 Z M71 21 L67 22 L68 23.4 Z" fill="#FDE68A" />
      <Line d="M62 27 L64 28.6 L66 27 L68 28.6 L70 27" c="#F8FAFC" w={0.8} />
    </g>
  </g>
);

/* ---------------- Yasuo ---------------- */
const YAS_BLUE = '#0369A1';

export const Yasuo: FC = () => (
  <g className="yasuo-sprite">
    {/* topknot ponytail */}
    <Sh d="M50 22 C44 14 46 4 54 2 C52 8 58 10 62 6 C62 14 58 20 54 24 Z" fill="#2A1E1A" rim />
    <Legs pants={YAS_BLUE} shoes="#7C4A1E" sole="#3B2412" />
    <Torso fill={YAS_BLUE}>
      <Line d="M43 50.4 L50 60 L57 50.4" c="#F8FAFC" w={2.2} />
      <Sh as="rect" x={38.6} y={67} width={22.8} height={4} rx={1} fill="#7C4A1E" sw={1.1} />
    </Torso>
    {/* katana with wind */}
    <path
      className="wind-swirl"
      d="M58 84 Q72 76 84 84 Q92 90 86 94 M20 78 Q30 72 40 78"
      fill="none"
      stroke="#BAE6FD"
      strokeWidth="1.3"
      strokeLinecap="round"
      opacity="0.8"
    />
    <Sh d="M68 64 L90 40 L92 42 L71 66 Z" fill="#E2E8F0" rim sw={1.1} />
    <Arm from={[61.6, 54]} to={[69, 66]} sleeve={YAS_BLUE} hand={LIGHT} />
    <Arm from={[38.4, 54]} to={[31, 68]} sleeve={YAS_BLUE} hand={LIGHT} />
    {/* shoulder guard */}
    <Sh d="M28 48 Q34 42 42 48 L40 56 Q32 58 28 54 Z" fill="#94A3B8" rim />
    <Sh as="circle" cx={34.6} cy={50.4} r={1.6} fill={P_GOLD} sw={0.8} />
    <Head skin={LIGHT}>
      <path
        d="M37 44 Q40 52 50 53 Q60 52 63 44 Q58 49 50 49 Q42 49 37 44 Z"
        fill="#5A3A22"
        opacity="0.4"
      />
    </Head>
    <Sh
      d="M32.6 36 C31 24 39 18 50 18 C61 18 69 24 67.4 36 L64 30 L61 34 L58 27 L54 31 L50 26 L46 31 L42 27 L39 34 L36 30 Z"
      fill="#2A1E1A"
      rim
    />
    <Sh
      as="rect"
      x={46}
      y={30.4}
      width={8}
      height={2}
      rx={0.8}
      fill="#F3E7C9"
      hl={false}
      sw={0.8}
    />
    <Face eyes="focused" mouth="smirk" brows="thick" browColor="#2A1E1A" blush={false} />
  </g>
);

/* ---------------- Ahri ---------------- */
const TAIL = '#FFF1F5';
const TAIL_TIP = '#F472B6';

const tailAngles = [-104, -78, -52, -26, 0, 26, 52, 78, 104];

export const Ahri: FC = () => (
  <g className="ahri-sprite">
    <g className="ahri-nine-tails">
      {tailAngles.map((a) => (
        <g key={a} transform={`rotate(${a} 50 68)`}>
          <Sh d="M50 68 C41 58 40 40 50 24 C60 40 59 58 50 68 Z" fill={TAIL} hl={false} sw={1.1} />
          <path
            d="M50 24 C46.6 30 45.4 34 45.6 38 Q50 35.6 54.4 38 C54.6 34 53.4 30 50 24 Z"
            fill={TAIL_TIP}
          />
        </g>
      ))}
    </g>
    {/* long hair back */}
    <Sh
      d="M32 34 C28 50 30 64 32 74 Q40 70 40 58 L40 36 Z M68 34 C72 50 70 64 68 74 Q60 70 60 58 L60 36 Z"
      fill="#1E1B3A"
    />
    <Legs pants={PALE} shoes="#E11D48" sole="#881337" w={6} />
    <Sh d="M38 66 L34 82 Q50 86 66 82 L62 66 Z" fill="#F8FAFC" sw={1.2} />
    <Line d="M36 80 Q50 84 64 80" c="#E11D48" w={1.4} />
    <Torso fill="#E11D48" sw={11} hw={10.4} bot={70}>
      <Line d="M44 50.4 L50 57 L56 50.4" c="#F8FAFC" w={1.8} />
      <Sh as="circle" cx={50} cy={64} r={1.8} fill="#FACC15" sw={0.8} />
    </Torso>
    <Arm from={[39.6, 54]} to={[33, 67]} sleeve="#F8FAFC" hand={PALE} />
    <Arm from={[60.4, 54]} to={[67, 62]} via={[66, 60]} sleeve="#F8FAFC" hand={PALE} />
    <Glow className="ahri-orb">
      <circle cx="72" cy="58" r="5" fill="#22D3EE" opacity="0.65" />
      <circle cx="72" cy="58" r="3" fill="#E0F2FE" />
    </Glow>
    {/* fox ears */}
    <Sh d="M35 28 L30 10 L45 22 Z" fill="#1E1B3A" rim />
    <Sh d="M65 28 L70 10 L55 22 Z" fill="#1E1B3A" rim />
    <path d="M35.6 24 L33 15 L41 21.4 Z M64.4 24 L67 15 L59 21.4 Z" fill={TAIL_TIP} />
    <Head skin={PALE} ears={false} />
    <Sh
      d="M32.6 37 C31 24 39 17.6 50 17.6 C61 17.6 69 24 67.4 37 C65 31 62 28 58 27 C56 31 52 32 50 30 C48 32 44 31 42 27 C38 28 35 31 32.6 37 Z"
      fill="#1E1B3A"
      rim
    />
    <Face eyes="open" mouth="smile" brows="soft" iris="#22D3EE" />
    <Line d="M37 44 H40.4 M37 46 L40.4 45.4 M63 44 H59.6 M63 46 L59.6 45.4" c="#E11D48" w={0.9} />
  </g>
);

export const GAMING_SPRITES: Record<string, FC> = {
  ultramarine: Ultramarine,
  hydralisk: Hydralisk,
  ultralisk: Ultralisk,
  terranmarine: TerranMarine,
  'terran-marine': TerranMarine,
  goliath: Goliath,
  zealot: Zealot,
  archon: Archon,
  darktemplar: DarkTemplar,
  'dark-templar': DarkTemplar,
  arthas: Arthas,
  lichking: LichKing,
  'lich-king': LichKing,
  barbarian: Barbarian,
  paladin: Paladin,
  zed: Zed,
  yone: Yone,
  yasuo: Yasuo,
  ahri: Ahri,
};
