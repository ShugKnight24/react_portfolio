import { FC } from 'react';
import {
  Arm,
  darken,
  Eye,
  Face,
  Glow,
  Head,
  INK,
  Legs,
  Limb,
  Line,
  Num,
  Sh,
  Torso,
  useKit,
} from './spriteKit';

/* ---------------- Luna ----------------
 * The owner's late dog: fawn coat, white blaze running down the face into a
 * greying muzzle, and big flyaway ears. Sitting, tail wagging.
 */
const FAWN = '#D79B5E';
const FAWN_DARK = '#A8693A';
const CREAM = '#FFF4E3';
const MUZZLE = '#C8C1BA';

export const Luna: FC = () => {
  const { mood } = useKit();
  const sleeping = mood === 'sleeping';
  const happy = mood === 'happy';
  const eyeKind = sleeping ? 'closed' : happy ? 'happy' : 'open';
  return (
    <g className="luna-sprite">
      {/* Wagging tail */}
      <g className="luna-tail">
        <Sh
          d="M64 84 C74 84 80 76 79 64 C78.6 61 82.6 60.6 83 64 C84.4 79 76 89 65 89 Z"
          fill={FAWN}
          rim
        />
        <Sh
          d="M79.2 64.4 C78.8 61.2 82.6 60.6 83 64 C83.2 66 82.8 68 82.2 69.6 C80.6 68.6 79.6 66.6 79.2 64.4 Z"
          fill={CREAM}
          hl={false}
          shade={false}
          sw={1.1}
        />
      </g>
      {/* Haunches and back paws */}
      <Sh as="ellipse" cx={50} cy={80} rx={20} ry={13.5} fill={FAWN} rim />
      <Sh as="ellipse" cx={31.6} cy={92} rx={6.4} ry={3.6} fill={FAWN} />
      <Sh as="ellipse" cx={68.4} cy={92} rx={6.4} ry={3.6} fill={FAWN} />
      {/* White chest bib */}
      <Sh
        d="M40 62 C40 58 60 58 60 62 C61 72 57 82 50 84 C43 82 39 72 40 62 Z"
        fill={CREAM}
        shade={false}
      />
      {/* Front legs with white socks */}
      <Limb d="M43 72 L42.4 89" c={FAWN} w={7} />
      <Limb d="M57 72 L57.6 89" c={FAWN} w={7} />
      <Sh as="ellipse" cx={42} cy={92} rx={5.4} ry={3.6} fill={CREAM} />
      <Sh as="ellipse" cx={58} cy={92} rx={5.4} ry={3.6} fill={CREAM} />
      <Line
        d="M40.4 93.6 V91.4 M43.4 93.6 V91.4 M56.6 93.6 V91.4 M59.6 93.6 V91.4"
        c={darken(CREAM, 0.35)}
        w={0.8}
      />
      {/* Collar and tag */}
      <Sh
        d="M36.6 56.6 Q50 63.6 63.4 56.6 L63.4 60.4 Q50 67.4 36.6 60.4 Z"
        fill="#E11D48"
        sw={1.2}
      />
      <Sh as="circle" cx={50} cy={66.4} r={2.8} fill="#FBBF24" rim sw={1.1} />
      {/* Big flyaway ears */}
      <g className="luna-ear luna-ear-left">
        <Sh
          d="M38 27 C33 20 23 17.6 15.4 19.6 C10.4 21 10 27.4 12.8 31.4 C16.4 36.4 23.4 39.6 30 39 C33.4 36.4 36.2 31.6 38 27 Z"
          fill={FAWN_DARK}
          rim
        />
        <path
          d="M34.6 28.4 C30.6 23.4 23.4 21.4 17.6 22.6 C15.4 25 17.6 30 22 33 C25.4 35.2 28.6 36 31 36 C32.6 33.8 33.8 31.2 34.6 28.4 Z"
          fill="#E9B394"
        />
        <Line d="M14.6 26 Q22 28 29 33" c="#7A4522" w={0.9} o={0.6} />
      </g>
      <g className="luna-ear luna-ear-right">
        <Sh
          d="M62 27 C67 20 77 17.6 84.6 19.6 C89.6 21 90 27.4 87.2 31.4 C83.6 36.4 76.6 39.6 70 39 C66.6 36.4 63.8 31.6 62 27 Z"
          fill={FAWN_DARK}
          rim
        />
        <path
          d="M65.4 28.4 C69.4 23.4 76.6 21.4 82.4 22.6 C84.6 25 82.4 30 78 33 C74.6 35.2 71.4 36 69 36 C67.4 33.8 66.2 31.2 65.4 28.4 Z"
          fill="#E9B394"
        />
        <Line d="M85.4 26 Q78 28 71 33" c="#7A4522" w={0.9} o={0.6} />
      </g>
      {/* Head */}
      <Sh
        d="M30 40 C30 26 39 20 50 20 C61 20 70 26 70 40 C70 51.6 61.6 58 50 58 C38.4 58 30 51.6 30 40 Z"
        fill={FAWN}
        rim
      />
      {/* White blaze from forehead into the muzzle */}
      <path
        d="M47.6 20.6 Q50 19.8 52.4 20.6 L53.4 34 Q56 37 57 41 L43 41 Q44 37 46.6 34 Z"
        fill={CREAM}
      />
      {/* Greying muzzle */}
      <Sh as="ellipse" cx={50} cy={47.6} rx={10.4} ry={7.6} fill={MUZZLE} shade={false} />
      <path d="M43 43 Q50 40 57 43 Q55 45.6 50 45.6 Q45 45.6 43 43 Z" fill={CREAM} />
      <g fill="#8E8781" opacity="0.6">
        <circle cx={44} cy={49} r={0.6} />
        <circle cx={45.6} cy={51} r={0.55} />
        <circle cx={56} cy={49} r={0.6} />
        <circle cx={54.4} cy={51} r={0.55} />
      </g>
      {/* Brow spots */}
      <ellipse cx={42.4} cy={32.6} rx={1.8} ry={1.1} fill={FAWN_DARK} opacity="0.75" />
      <ellipse cx={57.6} cy={32.6} rx={1.8} ry={1.1} fill={FAWN_DARK} opacity="0.75" />
      {/* Eyes */}
      <g className={eyeKind === 'open' ? 'sprite-blink' : undefined}>
        <Eye x={42.4} y={37.6} kind={eyeKind} iris="#5B3416" s={1.12} />
        <Eye x={57.6} y={37.6} kind={eyeKind} iris="#5B3416" flip s={1.12} />
      </g>
      {/* Nose and mouth */}
      <Sh
        d="M46.4 43.6 Q50 42 53.6 43.6 Q53.4 46.6 50 47.6 Q46.6 46.6 46.4 43.6 Z"
        fill="#2A1E1E"
        shade={false}
        sw={1}
      />
      <ellipse cx={48.8} cy={44} rx={1.1} ry={0.6} fill="#FFFFFF" opacity="0.7" />
      <Line d="M50 47.6 V49.4 M45.6 49 Q47.8 51.6 50 49.4 Q52.2 51.6 54.4 49" c={INK} w={1.1} />
      {(happy || mood === 'idle' || mood === 'bounce') && !sleeping && (
        <Sh
          className="luna-tongue"
          d="M47.6 50.4 Q50 50 52.4 50.4 Q53 55.6 50 56 Q47 55.6 47.6 50.4 Z"
          fill="#FF7A93"
          hl={false}
          sw={1}
        />
      )}
      {mood === 'eating' && (
        <ellipse cx={50} cy={52} rx={2.6} ry={2.2} fill="#6B1D2E" stroke={INK} strokeWidth={1} />
      )}
      <ellipse cx={39} cy={45} rx={2.6} ry={1.3} fill="#FF6F91" opacity="0.35" />
      <ellipse cx={61} cy={45} rx={2.6} ry={1.3} fill="#FF6F91" opacity="0.35" />
    </g>
  );
};

/* ---------------- Shugmi ----------------
 * The owner: bald, full dark beard, builder hoodie and a glowing laptop.
 */
const SHUG_SKIN = '#EBC29B';
const BEARD = '#2B201B';

export const Shugmi: FC = () => (
  <g className="shugmi-sprite">
    <Legs pants="#1E293B" shoes="#F8FAFC" sole="#00F0FF" />
    <Torso fill="#0E7490">
      <Sh
        d="M39.4 50.6 Q50 58 60.6 50.6 Q58 47 50 47 Q42 47 39.4 50.6 Z"
        fill="#7928CA"
        hl={false}
        sw={1.1}
      />
      <Line d="M46.8 54 L46.4 61 M53.2 54 L53.6 61" c="#00F0FF" w={1.1} />
      <circle cx={46.4} cy={61.6} r={0.9} fill="#00F0FF" />
      <circle cx={53.6} cy={61.6} r={0.9} fill="#00F0FF" />
    </Torso>
    <Arm from={[38.4, 54]} to={[38, 68]} via={[33, 62]} sleeve="#0E7490" hand={SHUG_SKIN} />
    <Arm from={[61.6, 54]} to={[62, 68]} via={[67, 62]} sleeve="#0E7490" hand={SHUG_SKIN} />
    {/* Laptop */}
    <Sh d="M38.6 62 H61.4 L60 74 H40 Z" fill="#1E293B" sw={1.3} />
    <Glow>
      <path d="M41.2 64 H58.8 L57.8 72 H42.2 Z" fill="#00F0FF" opacity="0.85" />
    </Glow>
    <Line
      d="M45.4 66.4 L44 68 L45.4 69.6 M54.6 66.4 L56 68 L54.6 69.6 M51 66 L49 70"
      c="#083344"
      w={0.9}
    />
    <Sh
      as="rect"
      x={36.4}
      y={73.4}
      width={27.2}
      height={3}
      rx={1.4}
      fill="#94A3B8"
      hl={false}
      sw={1.2}
    />
    <Sh as="circle" cx={38} cy={72} r={3.4} fill={SHUG_SKIN} />
    <Sh as="circle" cx={62} cy={72} r={3.4} fill={SHUG_SKIN} />
    {/* Head: bald, shiny */}
    <Head skin={SHUG_SKIN} />
    <path
      d="M39.4 25.6 Q45 21 52 21.6"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.75"
    />
    <circle cx={56.6} cy={22.6} r={1} fill="#FFFFFF" opacity="0.6" />
    {/* Full dark beard with mustache */}
    <Sh
      d="M33.2 36 C33 46 39.4 56.4 50 56.6 C60.6 56.4 67 46 66.8 36 C65.6 40 63.6 42.6 61 43.4 C57.6 41.4 53.6 41.4 50 42.6 C46.4 41.4 42.4 41.4 39 43.4 C36.4 42.6 34.4 40 33.2 36 Z"
      fill={BEARD}
      rim
    />
    <Line
      d="M40 48 Q41 50 42.6 51 M58.6 48 Q59 50 57.4 51 M47 53.4 Q50 54.6 53 53.4"
      c="#4A3A32"
      w={0.9}
      o={0.9}
    />
    <Face
      eyes="open"
      mouth="grin"
      brows="thick"
      browColor={BEARD}
      blush={false}
      mouthY={46.8}
      iris="#4A2C17"
    />
  </g>
);

/* ---------------- Kobe ---------------- */
const KOBE_SKIN = '#8A5634';

export const Kobe: FC = () => (
  <g className="kobe-sprite">
    <Legs pants={KOBE_SKIN} shoes="#552583" sole="#FDB927" />
    <Sh d="M38.6 73 H61.4 L62.6 84 H52 L50 81 L48 84 H37.4 Z" fill="#FDB927" sw={1.3} />
    <Line d="M39.6 80 L38.4 83.4 M60.4 80 L61.6 83.4" c="#552583" w={1.6} />
    <Torso fill="#FDB927">
      <path d="M45.4 50.4 L50 55 L54.6 50.4 Z" fill={KOBE_SKIN} />
      <Line d="M43.4 50.4 L50 56.6 L56.6 50.4" c="#552583" w={2.4} />
      <Line d="M39.4 50.6 L39.2 58 M60.6 50.6 L60.8 58" c="#552583" w={2} />
      <Num n="24" y={70.4} fill="#552583" stroke="#FFFFFF" />
    </Torso>
    <Arm from={[38.4, 54]} to={[31, 69]} sleeve={KOBE_SKIN} hand={KOBE_SKIN} />
    <Sh
      as="rect"
      x={30}
      y={62}
      width={4.6}
      height={3.4}
      rx={1}
      fill="#552583"
      hl={false}
      sw={1}
      transform="rotate(25 32.3 63.7)"
    />
    {/* Ball on the hip */}
    <g className="ball-spin">
      <Sh as="circle" cx={73.4} cy={68} r={7.4} fill="#E8692A" rim />
      <Line
        d="M66 68 H80.8 M73.4 60.6 V75.4 M68.2 62.8 Q71.8 68 68.2 73.2 M78.6 62.8 Q75 68 78.6 73.2"
        c="#5A1E08"
        w={0.9}
      />
    </g>
    <Arm from={[61.6, 54]} to={[68, 66]} sleeve={KOBE_SKIN} hand={KOBE_SKIN} />
    <Head skin={KOBE_SKIN}>
      {/* close-shaved hairline */}
      <path
        d="M34 32 C34 23 41 19.8 50 19.8 C59 19.8 66 23 66 32 C62 27 57 25.4 50 25.4 C43 25.4 38 27 34 32 Z"
        fill="#24160E"
        opacity="0.85"
      />
      <path
        d="M39 26 Q44.6 22.4 51 22.8"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* goatee */}
      <path d="M46 49.4 Q50 53.4 54 49.4 Q53 52.6 50 52.8 Q47 52.6 46 49.4 Z" fill="#24160E" />
    </Head>
    <Sh d="M33.4 29.6 Q50 25.4 66.6 29.6 L66.8 33.4 Q50 29.4 33.2 33.4 Z" fill="#552583" sw={1.1} />
    <Face
      eyes="open"
      mouth="smirk"
      brows="thick"
      browColor="#24160E"
      blush={false}
      iris="#3B2314"
    />
  </g>
);

/* ---------------- Jordan ---------------- */
const MJ_SKIN = '#6B4226';

export const Jordan: FC = () => (
  <g className="jordan-sprite">
    <g transform="translate(0 -3)">
      {/* tucked leg and extended leg: mid-flight */}
      <Limb d="M43 76 Q35.6 81 39 88" c={MJ_SKIN} w={7} />
      <Limb d="M57 76 L59 90" c={MJ_SKIN} w={7} />
      <Sh d="M32.6 92.6 Q32 86.6 38.4 86.4 Q45 86.4 45 92 Z" fill="#CE1141" />
      <Sh d="M52.6 96.2 Q52.6 90.4 59.2 90.4 Q65.8 90.4 65.8 96.2 Z" fill="#111111" />
      <Line d="M33 91 H44.6 M53 94.6 H65.4" c="#F8FAFC" w={1.3} />
      <Line d="M37 88.6 L41.4 90.4 M57.6 92.4 L62 94" c="#F8FAFC" w={0.9} />
      <Sh d="M38.6 73 H61.4 L62.6 84 H52 L50 81 L48 84 H37.4 Z" fill="#CE1141" sw={1.3} />
      <Line d="M39.6 79.6 L38.4 83.4 M60.4 79.6 L61.6 83.4" c="#111111" w={1.6} />
      <Torso fill="#CE1141">
        <path d="M45.4 50.4 L50 55 L54.6 50.4 Z" fill={MJ_SKIN} />
        <Line d="M43.4 50.4 L50 56.6 L56.6 50.4" c="#111111" w={2.4} />
        <Line d="M39.4 50.6 L39.2 58 M60.6 50.6 L60.8 58" c="#111111" w={2} />
        <Num n="23" y={70.4} fill="#FFFFFF" stroke="#111111" />
      </Torso>
      <Arm from={[38.4, 54]} to={[25, 60]} via={[30, 62]} sleeve={MJ_SKIN} hand={MJ_SKIN} />
      <Arm from={[61.6, 54]} to={[71, 26]} via={[71, 46]} sleeve={MJ_SKIN} hand={MJ_SKIN} />
      <Sh
        as="rect"
        x={68.6}
        y={36}
        width={5}
        height={3.4}
        rx={1}
        fill="#F8FAFC"
        hl={false}
        sw={1}
      />
      <g className="ball-spin">
        <Sh as="circle" cx={75} cy={18.6} r={7.4} fill="#E8692A" rim />
        <Line
          d="M67.6 18.6 H82.4 M75 11.2 V26 M69.8 13.4 Q73.4 18.6 69.8 23.8 M80.2 13.4 Q76.6 18.6 80.2 23.8"
          c="#5A1E08"
          w={0.9}
        />
      </g>
      <Sh as="circle" cx={71} cy={26} r={3.6} fill={MJ_SKIN} />
      <Head skin={MJ_SKIN}>
        <path
          d="M38.6 26.4 Q44.6 21.4 52 22"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path d="M45.4 44.6 Q50 43 54.6 44.6 L54 45.6 Q50 44.4 46 45.6 Z" fill="#20130B" />
      </Head>
      <Face
        eyes="open"
        mouth="tongue"
        brows="soft"
        browColor="#20130B"
        blush={false}
        iris="#3A2414"
        mouthY={47}
      />
    </g>
  </g>
);

/* ---------------- Ovechkin ---------------- */
const OVI_SKIN = '#F0C29E';

export const Ovechkin: FC = () => (
  <g className="ovi-sprite">
    {/* skates */}
    <Limb d="M43 77 L43 88" c="#C8102E" w={7} />
    <Limb d="M57 77 L57 88" c="#C8102E" w={7} />
    <Line d="M39.6 82 H46.4 M53.6 82 H60.4" c="#FFFFFF" w={1.4} />
    <Sh d="M35.6 92 Q35.6 86.4 42 86.4 Q47.6 86.4 47.6 92 Z" fill="#111827" />
    <Sh d="M52.4 92 Q52.4 86.4 58 86.4 Q64.4 86.4 64.4 92 Z" fill="#111827" />
    <Line d="M35 94.6 H48 M52 94.6 H65" c="#CBD5E1" w={1.6} />
    <Line d="M37.6 92 V94.4 M45.4 92 V94.4 M54.6 92 V94.4 M62.4 92 V94.4" c={INK} w={0.9} />
    {/* breezers */}
    <Sh d="M37.6 72 H62.4 L63.6 81.4 H52 L50 79 L48 81.4 H36.4 Z" fill="#041E42" sw={1.3} />
    <Torso fill="#C8102E" sw={13} hw={12.4}>
      <Line d="M38 71.6 H62" c="#FFFFFF" w={2} />
      <Line d="M37.8 74.6 H62.2" c="#041E42" w={2} />
      <Sh d="M44.6 50.2 L50 55.4 L55.4 50.2 Z" fill="#041E42" hl={false} sw={1} />
      <Num n="8" y={68.4} fill="#FFFFFF" stroke="#041E42" size={12} />
    </Torso>
    {/* stick held across the body */}
    <Sh
      d="M27 58 L29.4 56.6 L79.6 88.6 L88.6 89 Q90.6 89.4 89.6 91.6 L78.4 91.6 Z"
      fill="#E7D3B0"
      sw={1.2}
    />
    <Line d="M74.6 86 L79 89" c={INK} w={1.8} />
    <Sh as="ellipse" cx={86} cy={95} rx={4} ry={1.5} fill="#111827" hl={false} sw={1} />
    <Arm from={[37.4, 54]} to={[33, 62]} via={[32, 58]} sleeve="#C8102E" hand="#041E42" handR={4} />
    <Arm from={[62.6, 54]} to={[58, 71]} via={[66, 64]} sleeve="#C8102E" hand="#041E42" handR={4} />
    <Line d="M62 64 L66 61.6" c="#FFFFFF" w={1.4} />
    <Head skin={OVI_SKIN}>
      {/* stubble beard */}
      <path
        d="M34.6 40 C35.6 48 41.4 52.4 50 52.4 C58.6 52.4 64.4 48 65.4 40 C62 44.6 57 45.6 50 45.4 C43 45.6 38 44.6 34.6 40 Z"
        fill="#6B4A33"
        opacity="0.55"
      />
    </Head>
    {/* helmet with visor */}
    <Sh
      d="M32 37 C31 22 40 16.6 50 16.6 C60 16.6 69 22 68 37 L65 37 C64 31 60 29.4 50 29.4 C40 29.4 36 31 35 37 Z"
      fill="#C8102E"
      rim
    />
    <Line d="M50 16.8 V29" c="#FFFFFF" w={1.6} />
    <Sh
      d="M35 33.6 Q50 30.4 65 33.6 L64.4 38.6 Q50 36 35.6 38.6 Z"
      fill="#9BD3F5"
      opacity={0.55}
      shade={false}
      sw={1.1}
    />
    <Face
      eyes="open"
      mouth="gap"
      brows="thick"
      browColor="#5A3A22"
      blush={false}
      iris="#3B6E9E"
      eyeY={40.6}
      mouthY={47}
    />
  </g>
);
