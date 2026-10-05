import { FC } from 'react';
import {
  Arm,
  darken,
  Eye,
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

const PALE = '#F8DCC6';
const LIGHT = '#F3CBA5';

/* ---------------- Gojo ---------------- */
export const Gojo: FC = () => (
  <g className="gojo-sprite">
    <circle
      cx="50"
      cy="52"
      r="42"
      fill="none"
      stroke="#7DD3FC"
      strokeWidth="1.2"
      strokeDasharray="2 4"
      opacity="0.55"
      className="spin-aura"
    />
    <Legs pants="#111827" shoes="#0B0F1A" sole="#38BDF8" />
    <Torso fill="#1E1B4B">
      <Line d="M50 56 V77" c="#0B0A24" w={1.4} />
      <circle cx="50" cy="61" r="0.9" fill="#FBBF24" />
      <circle cx="50" cy="67" r="0.9" fill="#FBBF24" />
      <circle cx="50" cy="73" r="0.9" fill="#FBBF24" />
    </Torso>
    <Arm from={[38.4, 54]} to={[32, 69]} sleeve="#1E1B4B" hand={PALE} />
    <Arm from={[61.6, 54]} to={[70, 60]} via={[68, 63]} sleeve="#1E1B4B" hand={PALE} />
    {/* Hollow purple */}
    <Glow className="gojo-orb">
      <circle cx="75" cy="53" r="6.4" fill="#A855F7" opacity="0.55" />
      <circle cx="75" cy="53" r="4.4" fill="#C084FC" />
      <circle cx="73.6" cy="51.6" r="1.6" fill="#FFFFFF" opacity="0.9" />
    </Glow>
    <Head skin={PALE} />
    {/* High collar */}
    <Sh d="M38.6 47.6 Q50 54 61.4 47.6 L61.6 53 Q50 58 38.4 53 Z" fill="#1E1B4B" sw={1.2} />
    {/* Upswept white hair */}
    <Sh
      d="M32.6 34 C30 30 27 26 25 18 C30 21 32 22 34 22 C32 16 33 11 36 6 C38 12 41 15 44 16 C44 11 46 6 50 3 C52 8 54 12 56 15 C58 11 62 7 66 5 C66 11 65 16 64 20 C67 19 71 17 75 16 C73 23 70 28 67.4 34 C64 30 60 28 55 28 L53 32 L50 28.6 L46 32 L44 28 C39 28 35 30 32.6 34 Z"
      fill="#F1F5F9"
      rim
    />
    <Line d="M40 12 L43 21 M56 9 L54 20 M62 14 L60 22" c="#CBD5E1" w={1} />
    <Face eyes="open" mouth="smirk" brows="none" blush={false} />
    {/* Blindfold */}
    <Sh d="M33.2 34.4 Q50 31.4 66.8 34.4 L66.6 42 Q50 39.4 33.4 42 Z" fill="#111827" sw={1.2} />
    <Line d="M36 36.4 Q50 34 64 36.4" c="#334155" w={0.8} />
  </g>
);

/* ---------------- Pochita ---------------- */
const POCHI = '#F47A2A';

export const Pochita: FC = () => {
  const { mood } = useKit();
  const eyeKind = mood === 'sleeping' ? 'closed' : mood === 'happy' ? 'happy' : 'open';
  return (
    <g className="pochita-sprite">
      {/* pull-cord tail */}
      <path d="M74 78 Q84 80 85 71" fill="none" stroke="#E2E8F0" strokeWidth="1.6" />
      <Sh
        as="rect"
        x={81}
        y={65}
        width={7}
        height={3}
        rx={1.4}
        fill="#1F2937"
        sw={1.1}
        transform="rotate(-20 84.5 66.5)"
      />
      {/* stubby feet */}
      <Sh as="ellipse" cx={36} cy={91.6} rx={5.4} ry={3.6} fill={darken(POCHI, 0.15)} />
      <Sh as="ellipse" cx={45} cy={93} rx={5.4} ry={3.6} fill={darken(POCHI, 0.15)} />
      <Sh as="ellipse" cx={55} cy={93} rx={5.4} ry={3.6} fill={darken(POCHI, 0.15)} />
      <Sh as="ellipse" cx={64} cy={91.6} rx={5.4} ry={3.6} fill={darken(POCHI, 0.15)} />
      {/* chainsaw blade from the forehead */}
      <g className="pochita-blade" transform="translate(0 6)">
        <Sh d="M45 36 L45.4 14 Q50 7 54.6 14 L55 36 Z" fill="#CBD5E1" rim />
        <path
          d="M45.2 31 L42.4 29.4 L45.2 27 L42.4 25.4 L45.2 23 L42.4 21.4 L45.3 19 L42.8 17.4 L45.4 15 M54.8 31 L57.6 29.4 L54.8 27 L57.6 25.4 L54.8 23 L57.6 21.4 L54.7 19 L57.2 17.4 L54.6 15"
          fill="#94A3B8"
          stroke={INK}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <Line d="M50 12 V34" c="#64748B" w={1} />
      </g>
      {/* round body-head */}
      <Sh
        d="M23 68 C23 51 34 42 50 42 C66 42 77 51 77 68 C77 84 66 91 50 91 C34 91 23 84 23 68 Z"
        fill={POCHI}
        rim
      />
      <Sh as="rect" x={44} y={39} width={12} height={6} rx={2} fill="#475569" sw={1.2} />
      {/* face */}
      <g className={eyeKind === 'open' ? 'sprite-blink' : undefined}>
        <Eye x={40.6} y={61} kind={eyeKind} s={1.35} />
        <Eye x={59.4} y={61} kind={eyeKind} s={1.35} flip />
      </g>
      <ellipse cx="35.6" cy="67" rx="3" ry="1.6" fill="#FF6F91" opacity="0.4" />
      <ellipse cx="64.4" cy="67" rx="3" ry="1.6" fill="#FF6F91" opacity="0.4" />
      {mood === 'eating' || mood === 'bounce' ? (
        <ellipse cx="50" cy="70" rx="3" ry="2.6" fill="#6B1D2E" stroke={INK} strokeWidth="1" />
      ) : mood === 'sleeping' ? (
        <ellipse cx="50" cy="69" rx="1.3" ry="1.5" fill="#6B1D2E" stroke={INK} strokeWidth="1" />
      ) : (
        <>
          <Sh
            d="M48 69.6 Q50 69 52 69.6 Q52.6 74.4 50 74.8 Q47.4 74.4 48 69.6 Z"
            fill="#FF7A93"
            hl={false}
            sw={1}
          />
          <Line d="M45.4 68 Q47.8 70.6 50 69 Q52.2 70.6 54.6 68" c={INK} w={1.2} />
        </>
      )}
    </g>
  );
};

/* ---------------- Goku ---------------- */
export const Goku: FC = () => (
  <g className="goku-sprite">
    <Legs pants="#F97316" shoes="#1D4ED8" sole="#F59E0B" />
    <Sh d="M38.6 73 H61.4 L62.4 85 H52 L50 81 L48 85 H37.6 Z" fill="#F97316" sw={1.3} />
    <Torso fill="#F97316">
      <Sh d="M43 50.2 L50 60 L57 50.2 Z" fill="#1D4ED8" hl={false} sw={1.1} />
      <Sh as="circle" cx={42.6} cy={63.6} r={3} fill="#F8FAFC" hl={false} sw={1} />
      <Line d="M41.4 62.4 H43.8 M42.6 62.4 V65 M41.4 65 H43.8" c={INK} w={0.8} />
      <Sh as="rect" x={38.6} y={70} width={22.8} height={4} rx={1} fill="#1D4ED8" sw={1.1} />
      <Line d="M52 74 L54 79 M48 74 L46.4 79" c="#1D4ED8" w={2} />
    </Torso>
    <Arm from={[38.4, 54]} to={[30, 67]} sleeve="#1D4ED8" hand={LIGHT} />
    <Arm from={[61.6, 54]} to={[70, 67]} sleeve="#1D4ED8" hand={LIGHT} />
    <Sh
      as="rect"
      x={28.4}
      y={60}
      width={5.6}
      height={3.6}
      rx={1}
      fill="#1D4ED8"
      sw={1}
      transform="rotate(30 31 62)"
    />
    <Sh
      as="rect"
      x={66}
      y={60}
      width={5.6}
      height={3.6}
      rx={1}
      fill="#1D4ED8"
      sw={1}
      transform="rotate(-30 69 62)"
    />
    {/* hair back spikes */}
    <Sh
      d="M34 40 L22 36 L30 31 L19 24 L31 22 L26 12 L38 17 L40 8 L47 15 L52 5 L56 15 L64 8 L64 17 L75 13 L70 23 L81 25 L71 31 L79 37 L66 40 Z"
      fill="#141022"
      hl={false}
    />
    <Head skin={LIGHT} />
    {/* bangs */}
    <Sh
      d="M33.2 33.4 C33 24 40 20 50 20 C60 20 67 24 66.8 33.4 L63 28 L60 33 L57 26 L53.6 31 L50 25 L46.4 31 L43 26 L40 33 L37 28 Z"
      fill="#141022"
      hl={false}
    />
    <Line d="M42 21.6 L45 24 M57 21.6 L55 24" c="#3F3A5A" w={0.9} />
    <Face eyes="open" mouth="grin" brows="soft" blush={false} />
  </g>
);

/* ---------------- Spider-Man ---------------- */
const SPIDER_RED = '#E11D2E';
const SPIDER_BLUE = '#1D4ED8';

export const Spiderman: FC = () => {
  const { mood } = useKit();
  const squint = mood === 'happy' || mood === 'sleeping';
  return (
    <g className="spiderman-sprite">
      <Legs pants={SPIDER_BLUE} shoes={SPIDER_RED} sole={darken(SPIDER_RED, 0.4)} />
      <Torso fill={SPIDER_RED}>
        <path
          d="M37.6 56 L36.6 75 Q36.6 78 39 78 H41.6 L40.4 56 Z M62.4 56 L63.4 75 Q63.4 78 61 78 H58.4 L59.6 56 Z"
          fill={SPIDER_BLUE}
        />
        <Sh
          as="rect"
          x={38.6}
          y={74}
          width={22.8}
          height={4}
          fill={SPIDER_BLUE}
          hl={false}
          shade={false}
          ink={false}
        />
        <Line
          d="M42 54 Q50 58 58 54 M42 62 Q50 66 58 62 M43 70 Q50 73 57 70 M50 51 V73"
          c="#7F1020"
          w={0.6}
          o={0.8}
        />
        <path
          d="M50 58 C51.4 58 51.8 60 51.6 62 C51.6 64 50.8 66 50 66 C49.2 66 48.4 64 48.4 62 C48.2 60 48.6 58 50 58 Z"
          fill={INK}
        />
        <Line
          d="M48.6 60 L44.4 57 M51.4 60 L55.6 57 M48.6 62 L44 62.6 M51.4 62 L56 62.6 M48.8 64 L45 67.4 M51.2 64 L55 67.4"
          c={INK}
          w={0.8}
        />
      </Torso>
      <Arm from={[38.4, 54]} to={[31, 68]} sleeve={SPIDER_RED} hand={SPIDER_RED} />
      <Arm from={[61.6, 54]} to={[73, 50]} via={[70, 58]} sleeve={SPIDER_RED} hand={SPIDER_RED} />
      {/* thwip */}
      <path
        d="M75 48 L92 30"
        stroke="#F1F5F9"
        strokeWidth="1.1"
        strokeDasharray="0"
        opacity="0.9"
      />
      <path d="M92 30 L88 30 M92 30 L92 34 M92 30 L95 27" stroke="#F1F5F9" strokeWidth="1" />
      <Head skin={SPIDER_RED} ears={false}>
        <Line
          d="M50 20 V52 M33.4 36 H66.6 M36 26 L64 46 M64 26 L36 46 M40 30 Q50 26 60 30 M37 42 Q50 46 63 42 M43 23 Q50 21 57 23 M42 49 Q50 51 58 49"
          c="#7F1020"
          w={0.6}
          o={0.85}
        />
      </Head>
      {/* lenses */}
      {squint ? (
        <>
          <Sh
            d="M36.6 37.4 Q42 34.8 47.4 38.8 Q42 40.4 36.6 37.4 Z"
            fill="#F8FAFC"
            sw={1.8}
            shade={false}
          />
          <Sh
            d="M63.4 37.4 Q58 34.8 52.6 38.8 Q58 40.4 63.4 37.4 Z"
            fill="#F8FAFC"
            sw={1.8}
            shade={false}
          />
        </>
      ) : (
        <>
          <Sh
            d="M36.4 33.6 Q43 32.6 47.6 40.6 Q41.4 44.6 37.4 40.6 Q35.4 37.6 36.4 33.6 Z"
            fill="#F8FAFC"
            sw={1.9}
            shade={false}
          />
          <Sh
            d="M63.6 33.6 Q57 32.6 52.4 40.6 Q58.6 44.6 62.6 40.6 Q64.6 37.6 63.6 33.6 Z"
            fill="#F8FAFC"
            sw={1.9}
            shade={false}
          />
        </>
      )}
    </g>
  );
};

/* ---------------- Batman ---------------- */
const BAT_GREY = '#6B7280';
const BAT_DARK = '#1F2533';

export const Batman: FC = () => (
  <g className="batman-sprite">
    <Sh
      d="M38 50 Q26 70 20 92 L30 88 L36 93 L43 88 L50 93 L57 88 L64 93 L70 88 L80 92 Q74 70 62 50 Z"
      fill={BAT_DARK}
      rim
    />
    <Legs pants={BAT_GREY} shoes="#111827" sole="#374151" />
    <Torso fill={BAT_GREY}>
      <Sh as="ellipse" cx={50} cy={60} rx={7} ry={4} fill="#FACC15" hl={false} sw={1.1} />
      <path
        d="M43.6 60 Q45 58 46.6 58.6 L48 57 L49 58.6 L50 58 L51 58.6 L52 57 L53.4 58.6 Q55 58 56.4 60 Q54 60.4 53 62 Q51.6 60.6 50 62.6 Q48.4 60.6 47 62 Q46 60.4 43.6 60 Z"
        fill={INK}
      />
      <Sh as="rect" x={38.4} y={71.4} width={23.2} height={4.4} rx={1} fill="#EAB308" sw={1.1} />
      <Line d="M43 71.6 V75.6 M47 71.6 V75.6 M53 71.6 V75.6 M57 71.6 V75.6" c="#A16207" w={0.8} />
    </Torso>
    <Arm from={[38.4, 54]} to={[31, 69]} sleeve={BAT_GREY} hand={BAT_DARK} />
    <Arm from={[61.6, 54]} to={[69, 69]} sleeve={BAT_GREY} hand={BAT_DARK} />
    <path
      d="M30 63 L27 61 M30.6 65 L27.4 64 M70 63 L73 61 M69.4 65 L72.6 64"
      stroke={INK}
      strokeWidth="1.2"
    />
    <Head skin="#F1C7A3" ears={false} />
    {/* cowl */}
    <Sh
      d="M33 37 C33 30 34 26 35.6 23 L34 12 L41.4 20.6 Q50 18.6 58.6 20.6 L66 12 L64.4 23 C66 26 67 30 67 37 C67 40 66 43 64 45 Q58 42 50 42.6 Q42 42 36 45 C34 43 33 40 33 37 Z"
      fill={BAT_DARK}
      rim
    />
    <Face eyes="open" mouth="flat" brows="none" blush={false} eyeY={36} mouthY={48} locked />
    <path d="M37.6 34.4 L46.2 36.4 L45 38.8 L39 38 Z" fill="#F8FAFC" stroke={INK} strokeWidth="1" />
    <path d="M62.4 34.4 L53.8 36.4 L55 38.8 L61 38 Z" fill="#F8FAFC" stroke={INK} strokeWidth="1" />
    <Line d="M39 32 L46.6 34.4 M61 32 L53.4 34.4" c="#475569" w={0.9} />
  </g>
);

/* ---------------- Octocat ---------------- */
const OCTO = '#343B46';
const OCTO_FACE = '#F2D3C2';

export const Octocat: FC = () => (
  <g className="octocat-sprite">
    {/* tentacles */}
    <g className="octo-tentacles">
      <Limb d="M38 66 Q28 74 30 84 Q31 90 26 92" c={OCTO} w={6} />
      <Limb d="M44 70 Q40 80 42 88 Q43 92 39 94" c={OCTO} w={6} />
      <Limb d="M50 70 Q51 82 50 94" c={OCTO} w={6} />
      <Limb d="M56 70 Q60 80 58 88 Q57 92 61 94" c={OCTO} w={6} />
      <Limb d="M62 66 Q72 74 70 84 Q69 90 74 92" c={OCTO} w={6} />
      <g fill="#A78BFA">
        <circle cx="30.4" cy="80" r="0.9" />
        <circle cx="41.6" cy="84" r="0.9" />
        <circle cx="50.6" cy="86" r="0.9" />
        <circle cx="58.4" cy="84" r="0.9" />
        <circle cx="69.6" cy="80" r="0.9" />
      </g>
    </g>
    <Sh d="M34 62 Q50 76 66 62 L64 72 Q50 78 36 72 Z" fill={OCTO} />
    {/* ears */}
    <Sh d="M34 34 L30 14 L45 24 Z" fill={OCTO} />
    <Sh d="M66 34 L70 14 L55 24 Z" fill={OCTO} />
    <path d="M34.6 28 L33 19 L40 24 Z M65.4 28 L67 19 L60 24 Z" fill="#8B5CF6" opacity="0.6" />
    {/* head */}
    <Sh
      d="M30 44 C30 28 39 21 50 21 C61 21 70 28 70 44 C70 58 61 66 50 66 C39 66 30 58 30 44 Z"
      fill={OCTO}
      rim
    />
    <Sh
      d="M36 46 C36 38 42 35 50 36 C58 35 64 38 64 46 C64 55 58 59 50 59 C42 59 36 55 36 46 Z"
      fill={OCTO_FACE}
      hl={false}
      sw={1.2}
    />
    <Face eyes="open" mouth="smile" brows="none" eyeY={46} gap={6.4} mouthY={53.4} iris="#8B5CF6" />
    <ellipse cx="50" cy="50" rx="1.3" ry="0.9" fill="#B45A6A" />
    <Line d="M28 50 L36 49 M28 53 L36 51.6 M72 50 L64 49 M72 53 L64 51.6" c="#94A3B8" w={0.8} />
  </g>
);

/* ---------------- Ferris ---------------- */
const RUST = '#F2621F';

export const Ferris: FC = () => {
  const { mood } = useKit();
  const eyeKind = mood === 'sleeping' ? 'closed' : mood === 'happy' ? 'happy' : 'open';
  return (
    <g className="ferris-sprite">
      {/* legs */}
      <Limb d="M30 72 L21 80 L19 88" c={darken(RUST, 0.12)} w={4} />
      <Limb d="M34 77 L28 85 L28 92" c={darken(RUST, 0.12)} w={4} />
      <Limb d="M70 72 L79 80 L81 88" c={darken(RUST, 0.12)} w={4} />
      <Limb d="M66 77 L72 85 L72 92" c={darken(RUST, 0.12)} w={4} />
      {/* raised claws */}
      <Limb d="M30 62 Q20 56 21 44" c={RUST} w={4.4} />
      <Limb d="M70 62 Q80 56 79 44" c={RUST} w={4.4} />
      <Sh
        d="M21 46 C13 46 10 38 14 30 C16 34 20 36 23 34 C20 31 20 26 23 24 C28 28 29 38 21 46 Z"
        fill={RUST}
        rim
      />
      <Sh
        d="M79 46 C87 46 90 38 86 30 C84 34 80 36 77 34 C80 31 80 26 77 24 C72 28 71 38 79 46 Z"
        fill={RUST}
        rim
      />
      {/* eye stalks */}
      <Limb d="M43 52 L41 40" c={RUST} w={3} />
      <Limb d="M57 52 L59 40" c={RUST} w={3} />
      {/* body with scalloped top */}
      <Sh
        d="M24 66 C24 56 30 52 34 51 Q37 47 41 50 Q45 46 50 49 Q55 46 59 50 Q63 47 66 51 C70 52 76 56 76 66 C76 77 65 84 50 84 C35 84 24 77 24 66 Z"
        fill={RUST}
        rim
      />
      <Sh as="circle" cx={40.6} cy={37} r={5.2} fill="#FFFFFF" shade={false} />
      <Sh as="circle" cx={59.4} cy={37} r={5.2} fill="#FFFFFF" shade={false} />
      <g className={eyeKind === 'open' ? 'sprite-blink' : undefined}>
        <Eye x={41.4} y={37.4} kind={eyeKind} s={0.95} />
        <Eye x={58.6} y={37.4} kind={eyeKind} s={0.95} flip />
      </g>
      <ellipse cx="38" cy="69" rx="3" ry="1.6" fill="#FF6F91" opacity="0.45" />
      <ellipse cx="62" cy="69" rx="3" ry="1.6" fill="#FF6F91" opacity="0.45" />
      <path
        d="M43 67 Q50 75 57 67 Z"
        fill="#6B1D2E"
        stroke={INK}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <ellipse cx="50" cy="70.6" rx="2.4" ry="1.1" fill="#FF7A93" />
    </g>
  );
};

/* ---------------- Jack Reacher ---------------- */
const REACH_SKIN = '#E6B48E';
const REACH_HAIR = '#8A6A3E';

export const Reacher: FC = () => (
  <g className="reacher-sprite">
    <Legs pants="#3B5B8C" shoes="#5A3416" sole="#2B1708" spread={8} w={8.4} />
    <Torso fill="#9CA3AF" sw={16} hw={13.6} top={49}>
      <Sh
        d="M34 53 Q34 49 38 49 H44 L47 78 H38.4 Q36.4 78 36.4 75 Z"
        fill="#1E293B"
        hl={false}
        sw={1.2}
      />
      <Sh
        d="M66 53 Q66 49 62 49 H56 L53 78 H61.6 Q63.6 78 63.6 75 Z"
        fill="#1E293B"
        hl={false}
        sw={1.2}
      />
      <Line d="M47 52 L50 60 L53 52" c="#CBD5E1" w={0.9} />
      <Sh
        as="rect"
        x={48.2}
        y={60}
        width={3.6}
        height={5}
        rx={1.2}
        fill="#E2E8F0"
        hl={false}
        sw={0.9}
      />
    </Torso>
    <Arm from={[36, 54]} to={[29, 72]} sleeve="#1E293B" hand={REACH_SKIN} w={7.6} handR={4.6} />
    <Arm from={[64, 54]} to={[71, 72]} sleeve="#1E293B" hand={REACH_SKIN} w={7.6} handR={4.6} />
    <Head skin={REACH_SKIN}>
      {/* square jaw shadow */}
      <path
        d="M36 44 Q38 52 50 53 Q62 52 64 44 Q62 50 50 51 Q38 50 36 44 Z"
        fill="#9A6A48"
        opacity="0.4"
      />
    </Head>
    <Sh
      d="M33.4 32 C33 22 40 18.6 50 18.6 C60 18.6 67 22 66.6 32 C63 27.4 58 26.4 50 26.6 C42 26.4 37 27.4 33.4 32 Z"
      fill={REACH_HAIR}
      hl={false}
    />
    <Line
      d="M40 21.6 L41 24 M45 20 L45.6 22.6 M55 20 L54.4 22.6 M60 21.6 L59 24"
      c="#B79560"
      w={0.9}
    />
    <Face
      eyes="focused"
      mouth="flat"
      brows="thick"
      browColor="#6B4E2A"
      blush={false}
      iris="#4B7FB0"
    />
  </g>
);

/* ---------------- Denji (Chainsaw Man) ---------------- */
export const Denji: FC = () => {
  const { mood } = useKit();
  return (
    <g className="denji-sprite">
      <Legs pants="#111827" shoes="#0B0F1A" sole="#374151" />
      <Torso fill="#F8FAFC">
        <Line d="M44 50.4 L50 55 L56 50.4" c="#CBD5E1" w={1} />
        <Sh d="M48.6 52 H51.4 L52.6 66 L50 70 L47.4 66 Z" fill="#111827" hl={false} sw={1} />
        <path d="M58 58 Q62 62 58 66" fill="none" stroke="#F97316" strokeWidth="1.3" />
        <circle cx="57.6" cy="66.6" r="1.6" fill="none" stroke={INK} strokeWidth="1.1" />
        <Sh as="rect" x={38.6} y={72.6} width={22.8} height={3} fill="#111827" hl={false} sw={1} />
      </Torso>
      {/* forearm chainsaws */}
      <Sh d="M27 66 L15 46 Q14 43 17 43.6 L31 63 Z" fill="#CBD5E1" sw={1.2} />
      <path
        d="M16 46 L13.4 47.6 M18.6 49.6 L16 51.2 M21.2 53.2 L18.6 54.8 M23.8 56.8 L21.2 58.4 M26.4 60.4 L23.8 62"
        stroke={INK}
        strokeWidth="1.1"
      />
      <Sh d="M73 66 L85 46 Q86 43 83 43.6 L69 63 Z" fill="#CBD5E1" sw={1.2} />
      <path
        d="M84 46 L86.6 47.6 M81.4 49.6 L84 51.2 M78.8 53.2 L81.4 54.8 M76.2 56.8 L78.8 58.4 M73.6 60.4 L76.2 62"
        stroke={INK}
        strokeWidth="1.1"
      />
      <Arm from={[38.4, 54]} to={[30, 66]} sleeve="#F8FAFC" hand="#F47A2A" />
      <Arm from={[61.6, 54]} to={[70, 66]} sleeve="#F8FAFC" hand="#F47A2A" />
      {/* head blade */}
      <Sh d="M45.6 26 L45.6 7 Q50 1 54.4 7 L54.4 26 Z" fill="#CBD5E1" rim />
      <path
        d="M45.6 22 L43 20.6 L45.6 18.4 L43 17 L45.6 14.8 L43 13.4 L45.6 11.2 M54.4 22 L57 20.6 L54.4 18.4 L57 17 L54.4 14.8 L57 13.4 L54.4 11.2"
        fill="none"
        stroke={INK}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <Sh d={HEAD_PATH} fill="#F47A2A" rim />
      <Sh as="rect" x={44.6} y={18} width={10.8} height={5} rx={1.6} fill="#475569" sw={1.1} />
      {/* devil face: hollow eyes and shark grin */}
      {mood === 'sleeping' ? (
        <Line d="M38 37 Q42 39.4 46 37 M54 37 Q58 39.4 62 37" c={INK} w={1.6} />
      ) : (
        <>
          <path d="M37.6 34 L46.4 36.4 L44 40.4 L38.4 39 Z" fill={INK} />
          <path d="M62.4 34 L53.6 36.4 L56 40.4 L61.6 39 Z" fill={INK} />
          <circle cx="42" cy="37.6" r="1" fill="#FDE68A" />
          <circle cx="58" cy="37.6" r="1" fill="#FDE68A" />
        </>
      )}
      <Sh
        d="M37 43 Q50 48 63 43 Q60 51 50 51.6 Q40 51 37 43 Z"
        fill="#3B0A12"
        shade={false}
        hl={false}
        sw={1.2}
      />
      <path
        d="M38.4 44 L40.6 47.4 L42.4 44.8 L44.4 48.4 L46.4 45.4 L48.4 49 L50 45.6 L51.6 49 L53.6 45.4 L55.6 48.4 L57.6 44.8 L59.4 47.4 L61.6 44"
        fill="#F8FAFC"
        stroke={INK}
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </g>
  );
};

/* ---------------- Saitama ---------------- */
const SAITAMA_SKIN = '#F6D2B0';

export const Saitama: FC = () => (
  <g className="saitama-sprite">
    <Sh
      className="sprite-cape"
      d="M38.4 50 Q28 70 24 92 Q37 95 50 92 Q63 95 76 92 Q72 70 61.6 50 Z"
      fill="#F8FAFC"
      rim
    />
    <Legs pants="#FACC15" shoes="#DC2626" sole="#7F1D1D" />
    <Torso fill="#FACC15">
      <Line d="M50 52 V71" c="#A16207" w={0.9} />
      <Sh as="rect" x={38.4} y={70.6} width={23.2} height={4.4} rx={1} fill="#111827" sw={1.1} />
      <Sh as="circle" cx={50} cy={72.8} r={3.4} fill="#FBBF24" sw={1.1} />
    </Torso>
    <Sh as="circle" cx={38.6} cy={52} r={2.6} fill="#111827" sw={1} />
    <Sh as="circle" cx={61.4} cy={52} r={2.6} fill="#111827" sw={1} />
    <Arm from={[38.4, 55]} to={[31, 69]} sleeve="#FACC15" hand="#DC2626" handR={4.4} />
    <Arm from={[61.6, 55]} to={[69, 69]} sleeve="#FACC15" hand="#DC2626" handR={4.4} />
    <Head skin={SAITAMA_SKIN} />
    <path
      d="M39 26 Q45 20.4 53 21.2"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2.6"
      strokeLinecap="round"
      opacity="0.85"
    />
    <circle cx="57.6" cy="22.4" r="1.2" fill="#FFFFFF" opacity="0.8" />
    <Face eyes="dot" mouth="flat" brows="soft" blush={false} eyeY={39} mouthY={47} />
  </g>
);

/* ---------------- Iron Man ---------------- */
const IM_RED = '#C81E1E';
const IM_GOLD = '#F5B531';

export const IronMan: FC = () => (
  <g className="ironman-sprite">
    <Legs pants={IM_RED} shoes={IM_RED} sole={IM_GOLD} />
    <Sh as="circle" cx={43} cy={83} r={2.4} fill={IM_GOLD} sw={1} />
    <Sh as="circle" cx={57} cy={83} r={2.4} fill={IM_GOLD} sw={1} />
    <Torso fill={IM_RED}>
      <Sh d="M43 66 H57 L56 77 H44 Z" fill={IM_GOLD} sw={1.1} />
      <Line d="M43.6 70 H56.4 M44 73.6 H56" c="#A16207" w={0.8} />
      <Line d="M40 56 Q50 61 60 56" c="#7F1D1D" w={1} />
    </Torso>
    <Glow className="arc-reactor">
      <circle cx="50" cy="59" r="4.2" fill="#0EA5E9" />
      <circle cx="50" cy="59" r="2.8" fill="#7DD3FC" />
      <circle cx="50" cy="59" r="1.3" fill="#FFFFFF" />
    </Glow>
    <circle cx="50" cy="59" r="4.2" fill="none" stroke={INK} strokeWidth="1.1" />
    <Sh d="M34.6 51 Q38 48 42 50 L41 57 Q36.6 58 34 55 Z" fill={IM_GOLD} sw={1.1} />
    <Sh d="M65.4 51 Q62 48 58 50 L59 57 Q63.4 58 66 55 Z" fill={IM_GOLD} sw={1.1} />
    <Arm from={[38.4, 55]} to={[31, 69]} sleeve={IM_RED} hand={IM_GOLD} handR={4} />
    <Arm from={[61.6, 55]} to={[72, 58]} via={[70, 64]} sleeve={IM_RED} hand={IM_GOLD} handR={4} />
    <Glow>
      <circle cx="74.6" cy="56" r="2.2" fill="#BAE6FD" />
    </Glow>
    {/* helmet */}
    <Sh d={HEAD_PATH} fill={IM_RED} rim />
    <Sh d="M38 30 Q50 27 62 30 L61 44 L56 50 H44 L39 44 Z" fill={IM_GOLD} sw={1.2} />
    <Line d="M44 50 L45 44 M56 50 L55 44 M47 47 H53" c="#A16207" w={0.9} />
    <Glow>
      <path
        d="M40.6 36.4 L47 37.6 L46.4 39.4 L41 38.6 Z M59.4 36.4 L53 37.6 L53.6 39.4 L59 38.6 Z"
        fill="#E0F7FF"
      />
    </Glow>
  </g>
);

/* ---------------- Hulk ---------------- */
const HULK = '#4CAF50';
const HULK_DARK = '#2E7D32';

export const Hulk: FC = () => (
  <g className="hulk-sprite">
    <Limb d="M42 76 L41 89" c={HULK} w={9} />
    <Limb d="M58 76 L59 89" c={HULK} w={9} />
    <Sh as="ellipse" cx={40} cy={92.4} rx={7} ry={3.6} fill={HULK} />
    <Sh as="ellipse" cx={60} cy={92.4} rx={7} ry={3.6} fill={HULK} />
    <Sh
      d="M34 70 H66 L68 84 L63 81 L59 85 L54 81 L50 84 L46 81 L41 85 L37 81 L32 84 Z"
      fill="#7E22CE"
      sw={1.3}
    />
    <Torso fill={HULK} sw={19} hw={15} top={47} bot={74}>
      <Line
        d="M39 57 Q45 61 50 57 Q55 61 61 57 M50 52 V70 M44 64 H56 M45 68.6 H55"
        c={HULK_DARK}
        w={1.2}
      />
    </Torso>
    <Arm from={[33, 52]} to={[23, 70]} via={[24, 58]} sleeve={HULK} hand={HULK} w={9} handR={6.4} />
    <Arm from={[67, 52]} to={[77, 70]} via={[76, 58]} sleeve={HULK} hand={HULK} w={9} handR={6.4} />
    <Line d="M20 68 H26 M20.4 71 H25.6 M74 68 H80 M74.4 71 H79.6" c={HULK_DARK} w={0.9} />
    <Head skin={HULK} />
    <Sh
      d="M33 35 C30 26 34 18 42 17 L41 13 L48 16 L52 11 L55 16.6 L62 14 L60.6 19 C66 21 69 28 67 35 C64 29 60 26 56 27 L53 24 L50 27.6 L46 24.4 L43 28 C39 28 35 30 33 35 Z"
      fill="#1F2A1B"
      hl={false}
    />
    <Face
      eyes="angry"
      mouth="snarl"
      brows="angry"
      browColor="#1B3B1D"
      blush={false}
      iris="#86EFAC"
      mouthY={47}
    />
  </g>
);

/* ---------------- Vegeta ---------------- */
export const Vegeta: FC = () => (
  <g className="vegeta-sprite">
    <Legs pants="#1E3A8A" shoes="#F8FAFC" sole="#F59E0B" />
    <Torso fill="#1E3A8A">
      <Sh
        d="M37.6 52 Q38 49.6 41 49.6 L45 49.6 L50 56 L55 49.6 L59 49.6 Q62 49.6 62.4 52 L61 70 Q50 73 39 70 Z"
        fill="#F8FAFC"
        sw={1.2}
      />
      <Sh
        d="M37.4 50.6 H44 L45 54 H38 Z M62.6 50.6 H56 L55 54 H62 Z"
        fill="#F5B531"
        hl={false}
        sw={1}
      />
      <Line d="M42 62 H58 M42.6 66 H57.4" c="#CBD5E1" w={0.9} />
    </Torso>
    <Arm from={[38.4, 54]} to={[31, 69]} sleeve="#1E3A8A" hand="#F8FAFC" handR={4} />
    <Arm from={[61.6, 54]} to={[71, 62]} via={[68, 64]} sleeve="#1E3A8A" hand="#F8FAFC" handR={4} />
    <Glow className="ki-orb">
      <circle cx="76" cy="57" r="6" fill="#FACC15" opacity="0.6" />
      <circle cx="76" cy="57" r="3.8" fill="#FEF08A" />
      <circle cx="75" cy="56" r="1.6" fill="#FFFFFF" />
    </Glow>
    {/* flame hair with widow's peak */}
    <Sh
      d="M33 36 C31 28 29 20 26 12 C31 15 33 16 35 17 C34 11 35 6 37 1 C40 7 42 10 44 12 C45 6 47 2 50 -1 C53 2 55 6 56 12 C58 10 60 7 63 1 C65 6 66 11 65 17 C67 16 69 15 74 12 C71 20 69 28 67 36 C64 30 60 27 56 26.6 L50 33 L44 26.6 C40 27 36 30 33 36 Z"
      fill="#141022"
      rim
    />
    <Head skin={LIGHT} ears />
    <Sh
      d="M33.4 35 C33.4 27 38 23 44 22 L50 32 L56 22 C62 23 66.6 27 66.6 35 C63 30 60 28 56 27.4 L50 34 L44 27.4 C40 28 37 30 33.4 35 Z"
      fill="#141022"
      hl={false}
    />
    <Face eyes="angry" mouth="smirk" brows="angry" blush={false} />
    <Line d="M48.6 34 L49.6 36 M51.4 34 L50.4 36" c="#B57C55" w={0.7} />
  </g>
);

export const HEROES_SPRITES: Record<string, FC> = {
  gojo: Gojo,
  pochita: Pochita,
  goku: Goku,
  spiderman: Spiderman,
  batman: Batman,
  octocat: Octocat,
  ferris: Ferris,
  reacher: Reacher,
  denji: Denji,
  saitama: Saitama,
  ironman: IronMan,
  'iron-man': IronMan,
  iron_man: IronMan,
  hulk: Hulk,
  'incredible-hulk': Hulk,
  vegeta: Vegeta,
};
