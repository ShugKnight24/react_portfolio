import { FC } from 'react';
import { CustomCharacterConfig } from '../types';
import {
  Arm,
  darken,
  Face,
  Glow,
  Head,
  INK,
  Legs,
  lighten,
  Line,
  Num,
  Sh,
  Torso,
} from './spriteKit';

/*
 * The Character Lab hero. Built on the same chibi template as the roster so a
 * custom hero stands next to Kobe or Luna at the same scale and line weight.
 */

const HAND_L: [number, number] = [31, 69];
const HAND_R: [number, number] = [69, 69];

interface OutfitLook {
  top: string;
  trim: string;
  pants: string;
  shoes: string;
  sleeves: boolean;
  number?: string;
  numberFill?: string;
}

const outfitLook = (cfg: CustomCharacterConfig): OutfitLook => {
  switch (cfg.outfit) {
    case 'lakers':
      return {
        top: '#FDB927',
        trim: '#552583',
        pants: '#FDB927',
        shoes: '#552583',
        sleeves: false,
        number: '24',
        numberFill: '#552583',
      };
    case 'bulls':
      return {
        top: '#CE1141',
        trim: '#111111',
        pants: '#CE1141',
        shoes: '#111111',
        sleeves: false,
        number: '23',
        numberFill: '#FFFFFF',
      };
    case 'capitals':
      return {
        top: '#C8102E',
        trim: '#041E42',
        pants: '#041E42',
        shoes: '#1E293B',
        sleeves: true,
        number: '8',
        numberFill: '#FFFFFF',
      };
    case 'superhero':
      return { top: '#2563EB', trim: '#DC2626', pants: '#1D4ED8', shoes: '#DC2626', sleeves: true };
    case 'gi':
      return {
        top: '#F97316',
        trim: '#1D4ED8',
        pants: '#F97316',
        shoes: '#1D4ED8',
        sleeves: false,
      };
    case 'cyber':
      return { top: '#111827', trim: '#00F0FF', pants: '#0F172A', shoes: '#1F2937', sleeves: true };
    case 'hoodie':
    default: {
      const c = cfg.outfitColor || '#0284C7';
      return { top: c, trim: lighten(c, 0.55), pants: '#334155', shoes: '#F8FAFC', sleeves: true };
    }
  }
};

const HairBack: FC<{ style: CustomCharacterConfig['hairStyle']; c: string }> = ({ style, c }) => {
  if (style === 'long') {
    return (
      <Sh
        d="M32 34 C30 48 31 60 30 66 Q36 68 40 64 L40 40 Z M68 34 C70 48 69 60 70 66 Q64 68 60 64 L60 40 Z"
        fill={c}
      />
    );
  }
  if (style === 'afro') {
    return (
      <Sh
        d="M50 8 C58 8 63 11 66 15 C72 15 76 20 75 26 C79 30 79 37 75 41 C75 46 71 49 67 48 L33 48 C29 49 25 46 25 41 C21 37 21 30 25 26 C24 20 28 15 34 15 C37 11 42 8 50 8 Z"
        fill={c}
      />
    );
  }
  return null;
};

const HairFront: FC<{ style: CustomCharacterConfig['hairStyle']; c: string }> = ({ style, c }) => {
  const streak = lighten(c, 0.35);
  switch (style) {
    case 'spiky':
      return (
        <g>
          <Sh
            d="M32.6 34 L28 24 L35 25 L33 14 L41 19 L44 9 L50 17 L56 8 L59 18 L67 13 L65.5 24 L72 23 L67.4 34 C64 28 58 25.6 50 26.4 C42 25.6 36 28 32.6 34 Z"
            fill={c}
            rim
          />
          <Line d="M44 14 L46 20 M56 13 L54.6 19.6" c={streak} w={1.1} o={0.7} />
        </g>
      );
    case 'afro':
      return (
        <Sh
          d="M33.5 31 C35 24 42 21 50 21 C58 21 65 24 66.5 31 C62 27.5 56 27 50 28 C44 27 38 27.5 33.5 31 Z"
          fill={c}
          hl={false}
        />
      );
    case 'long':
      return (
        <g>
          <Sh
            d="M32.6 37 C31 24 39 17.6 50 17.6 C61 17.6 69 24 67.4 37 C64 30 59 27 55 26.6 C53 30 47 31.4 41 30.6 C38 32 35 34 32.6 37 Z"
            fill={c}
            rim
          />
          <Line d="M45 21 Q41 24 38.6 29" c={streak} w={1.1} o={0.7} />
        </g>
      );
    case 'headband':
      return (
        <g>
          <Sh
            d="M33.2 31 C33.6 22 41 18.4 50 18.4 C59 18.4 66.4 22 66.8 31 L33.2 31 Z"
            fill={c}
            hl={false}
          />
          <Sh d="M32.8 27.6 Q50 24 67.2 27.6 L67.4 32.4 Q50 29 32.6 32.4 Z" fill="#EF4444" />
          <Sh d="M66 29 L74 25 L73 30 L76 33 L67 32 Z" fill="#EF4444" hl={false} />
          <Sh
            as="rect"
            x={46.6}
            y={26.6}
            width={6.8}
            height={3.6}
            rx={1}
            fill="#F1F5F9"
            hl={false}
            sw={1}
          />
        </g>
      );
    case 'bald':
      return (
        <path
          d="M40 25 Q45 21.4 51 22"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
        />
      );
    case 'buzz':
    default:
      return (
        <g>
          <Sh
            d="M33.2 33 C33 22.4 41 18.6 50 18.6 C59 18.6 67 22.4 66.8 33 C63 27.4 57.4 25.6 50 25.6 C42.6 25.6 37 27.4 33.2 33 Z"
            fill={c}
            hl={false}
          />
          <Line
            d="M40 22.4 L41 24.4 M46 20.6 L46.6 22.8 M53 20.6 L52.6 22.8 M59.6 22.2 L58.8 24.2"
            c={streak}
            w={0.9}
            o={0.6}
          />
        </g>
      );
  }
};

const OutfitBody: FC<{ cfg: CustomCharacterConfig; look: OutfitLook; skin: string }> = ({
  cfg,
  look,
  skin,
}) => {
  const { top, trim } = look;
  return (
    <g>
      <Torso fill={top} />
      {(cfg.outfit === 'lakers' || cfg.outfit === 'bulls') && (
        <g>
          <Line d="M43.4 50.4 L50 56.6 L56.6 50.4" c={trim} w={2.4} />
          <Line d="M39.6 50.6 L39.4 58 M60.4 50.6 L60.6 58" c={trim} w={2} />
          <Num n={look.number || ''} y={70} fill={look.numberFill || '#fff'} stroke={trim} />
        </g>
      )}
      {cfg.outfit === 'capitals' && (
        <g>
          <Line d="M38.4 72 H61.6" c="#FFFFFF" w={2} />
          <Line d="M38.2 75 H61.8" c={trim} w={2} />
          <Line d="M45 50.4 L50 54.6 L55 50.4" c={trim} w={2.2} />
          <Num n={look.number || ''} y={68} fill="#FFFFFF" stroke={trim} />
        </g>
      )}
      {cfg.outfit === 'superhero' && (
        <g>
          <Sh d="M50 56 L56.4 60 L54.4 67 H45.6 L43.6 60 Z" fill="#FBBF24" sw={1.1} />
          <Line d="M47.4 62 H52.6" c="#B45309" w={1.2} />
          <Sh
            as="rect"
            x={38.4}
            y={71.6}
            width={23.2}
            height={3.6}
            rx={1}
            fill="#FBBF24"
            hl={false}
            sw={1.1}
          />
        </g>
      )}
      {cfg.outfit === 'gi' && (
        <g>
          <Sh d="M43 50.2 L50 60 L57 50.2 Z" fill="#1D4ED8" hl={false} sw={1.1} />
          <Sh as="rect" x={38.6} y={68} width={22.8} height={4} rx={1} fill="#1D4ED8" sw={1.1} />
          <Line d="M52 72 L54 77.6 M48 72 L46.4 77.4" c="#1D4ED8" w={2} />
        </g>
      )}
      {cfg.outfit === 'cyber' && (
        <g>
          <Glow>
            <Line d="M41 56 H47 L50 60 H59 M50 60 V74 M41 70 H46" c={trim} w={1.2} />
          </Glow>
          <circle cx={50} cy={60} r={1.6} fill="#F43F5E" />
        </g>
      )}
      {cfg.outfit === 'hoodie' && (
        <g>
          <Sh
            d="M40 50.4 Q50 57 60 50.4 Q58 47.4 50 47.4 Q42 47.4 40 50.4 Z"
            fill={darken(top, 0.18)}
            hl={false}
            sw={1.1}
          />
          <Line d="M47 53.4 L46.6 60 M53 53.4 L53.4 60" c={trim} w={1.1} />
          <circle cx={46.6} cy={60.6} r={0.9} fill={trim} />
          <circle cx={53.4} cy={60.6} r={0.9} fill={trim} />
          <Sh d="M42 68 H58 L56.6 74.4 H43.4 Z" fill={darken(top, 0.12)} hl={false} sw={1} />
        </g>
      )}
      {/* tiny skin neckline for sleeveless jerseys */}
      {!look.sleeves && cfg.outfit !== 'gi' && (
        <path d="M45.6 50.6 L50 54.6 L54.4 50.6 Z" fill={skin} />
      )}
    </g>
  );
};

const HeldItem: FC<{ kind: CustomCharacterConfig['accessory'] }> = ({ kind }) => {
  switch (kind) {
    case 'basketball':
      return (
        <g className="accessory-bounce">
          <Sh as="circle" cx={74.6} cy={66} r={7.2} fill="#EA6A1F" rim />
          <Line
            d="M67.6 66 H81.6 M74.6 59 V73 M69.4 61 Q73 66 69.4 71 M79.8 61 Q76.2 66 79.8 71"
            c="#5A1E08"
            w={0.9}
          />
        </g>
      );
    case 'hockeystick':
      return (
        <g>
          <Sh
            d="M71.4 52 L74 52 L76.6 90 L85 90 Q87 90 87 92.6 L75 93 Q73.6 93 73.6 91.4 Z"
            fill="#D9C6A5"
            sw={1.2}
          />
          <Line d="M75.6 82 L76 88" c="#111" w={1.6} />
          <Sh as="ellipse" cx={84} cy={95} rx={3.6} ry={1.4} fill="#111827" hl={false} sw={1} />
        </g>
      );
    case 'laptop':
      return (
        <g>
          <Sh d="M39 62 H61 L59.6 74 H40.4 Z" fill="#334155" sw={1.3} />
          <Glow>
            <path d="M41.6 64 H58.4 L57.4 72 H42.6 Z" fill="#22D3EE" opacity="0.9" />
          </Glow>
          <Line
            d="M45 66.6 L43.6 68 L45 69.4 M55 66.6 L56.4 68 L55 69.4 M51 66 L49 70"
            c="#0E3A4A"
            w={0.9}
          />
          <Sh
            as="rect"
            x={36.6}
            y={73.4}
            width={26.8}
            height={3}
            rx={1.4}
            fill="#94A3B8"
            hl={false}
            sw={1.2}
          />
        </g>
      );
    case 'coffee':
      return (
        <g>
          <Sh
            d="M68.6 61 H77.4 L76.4 74 Q76.2 75.4 74.8 75.4 H71.2 Q69.8 75.4 69.6 74 Z"
            fill="#F1F5F9"
            sw={1.2}
          />
          <Sh
            as="rect"
            x={67.8}
            y={59.6}
            width={10.4}
            height={2.8}
            rx={1.2}
            fill="#0284C7"
            hl={false}
            sw={1.1}
          />
          <path
            d="M77 64.4 Q81.4 65 80.6 68.6 Q80 71 76.6 70.8"
            fill="none"
            stroke={INK}
            strokeWidth="1.3"
          />
          <Sh
            as="rect"
            x={69.6}
            y={66}
            width={7}
            height={3.6}
            fill="#92400E"
            shade={false}
            hl={false}
            ink={false}
          />
          <path
            className="steam"
            d="M71.6 57 Q70.4 54.6 72 52.6 M75 57 Q73.8 54.4 75.4 52"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      );
    case 'sword':
      return (
        <g>
          <Sh d="M71.4 66 L84.6 35.4 Q86.4 33.6 86.6 36 L74.2 67.2 Z" fill="#E2E8F0" sw={1.2} rim />
          <Line d="M73.2 65 L84.6 37" c="#FFFFFF" w={0.8} o={0.8} />
          <Sh d="M66.6 64.2 L77.4 68.6 L76.6 70.6 L65.8 66.2 Z" fill="#F59E0B" sw={1.1} />
          <Sh d="M70.4 68 L68 73.6 L70.2 74.6 L72.6 69 Z" fill="#7C2D12" sw={1} hl={false} />
        </g>
      );
    default:
      return null;
  }
};

const EyeWear: FC<{ cfg: CustomCharacterConfig }> = ({ cfg }) => {
  if (cfg.expression === 'shades') {
    return (
      <g>
        <Sh
          d="M38 35.6 H48.6 Q48.6 42.4 43.4 42.4 Q38.4 42.4 38 35.6 Z M51.4 35.6 H62 Q61.6 42.4 56.6 42.4 Q51.4 42.4 51.4 35.6 Z"
          fill="#0B1020"
          shade={false}
          sw={1.2}
        />
        <Line d="M48.6 36.6 H51.4 M38 36 L34 35 M62 36 L66 35" c={INK} w={1.3} />
        <path
          d="M40 37.4 L43 37.4 M53.4 37.4 L56.4 37.4"
          stroke="#00F0FF"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.9"
        />
      </g>
    );
  }
  if (cfg.expression === 'focused' || cfg.accessory === 'glasses') {
    return (
      <g fill="none" stroke="#2563EB" strokeWidth="1.4">
        <circle cx={42.8} cy={39} r={4.4} fill="#BFDBFE" fillOpacity="0.18" />
        <circle cx={57.2} cy={39} r={4.4} fill="#BFDBFE" fillOpacity="0.18" />
        <path d="M47.2 38.6 Q50 37.2 52.8 38.6 M38.4 38.4 L34 37.4 M61.6 38.4 L66 37.4" />
        <path
          d="M40.6 36.4 L42.2 35.6 M55 36.4 L56.6 35.6"
          stroke="#FFFFFF"
          strokeWidth="1"
          opacity="0.8"
        />
      </g>
    );
  }
  return null;
};

export const CustomSprite: FC<{ cfg: CustomCharacterConfig }> = ({ cfg }) => {
  const skin = cfg.skinTone || '#FFDBAC';
  const hair = cfg.hairColor || '#1F2937';
  const look = outfitLook(cfg);
  const sleeve = look.sleeves ? look.top : skin;
  const holds =
    cfg.accessory === 'basketball' ||
    cfg.accessory === 'coffee' ||
    cfg.accessory === 'sword' ||
    cfg.accessory === 'hockeystick';
  const laptop = cfg.accessory === 'laptop';
  const handR: [number, number] =
    cfg.accessory === 'sword'
      ? [70, 66]
      : cfg.accessory === 'hockeystick'
        ? [72.6, 60]
        : holds
          ? [70, 66]
          : laptop
            ? [62, 68]
            : HAND_R;
  const handL: [number, number] = laptop ? [38, 68] : HAND_L;
  const gloves = cfg.outfit === 'superhero' ? '#DC2626' : skin;

  let eyes: 'open' | 'wink' | 'angry' = 'open';
  let mouth: 'smile' | 'smirk' | 'grin' = 'smile';
  if (cfg.expression === 'wink') {
    eyes = 'wink';
    mouth = 'smirk';
  } else if (cfg.expression === 'fire') {
    eyes = 'angry';
    mouth = 'grin';
  } else if (cfg.expression === 'shades') {
    mouth = 'smirk';
  }

  return (
    <g className="custom-character-sprite">
      {cfg.outfit === 'superhero' && (
        <Sh
          className="sprite-cape"
          d="M38 51 Q30 70 26 90 Q38 94 50 91 Q62 94 74 90 Q70 70 62 51 Z"
          fill="#DC2626"
          rim
        />
      )}
      <HairBack style={cfg.hairStyle} c={hair} />
      <Legs
        pants={cfg.outfit === 'lakers' || cfg.outfit === 'bulls' ? skin : look.pants}
        shoes={look.shoes}
      />
      {(cfg.outfit === 'lakers' || cfg.outfit === 'bulls') && (
        <Sh d="M38.6 74 H61.4 L62.4 83 H52 L50 80 L48 83 H37.6 Z" fill={look.pants} sw={1.3} />
      )}
      {cfg.outfit === 'gi' && (
        <Sh d="M38.6 74 H61.4 L62 84 H52 L50 81 L48 84 H38 Z" fill={look.pants} sw={1.3} />
      )}
      <OutfitBody cfg={cfg} look={look} skin={skin} />
      <Arm from={[38.4, 54]} to={handL} sleeve={sleeve} hand={gloves} />
      {cfg.accessory === 'hockeystick' && <HeldItem kind="hockeystick" />}
      <Arm from={[61.6, 54]} to={handR} sleeve={sleeve} hand={gloves} />
      {cfg.outfit === 'gi' && (
        <>
          <Sh
            as="rect"
            x={handL[0] - 2.8}
            y={handL[1] - 6}
            width={5.6}
            height={3}
            rx={1}
            fill="#1D4ED8"
            hl={false}
            sw={1}
          />
          <Sh
            as="rect"
            x={handR[0] - 2.8}
            y={handR[1] - 6}
            width={5.6}
            height={3}
            rx={1}
            fill="#1D4ED8"
            hl={false}
            sw={1}
          />
        </>
      )}
      <Head skin={skin} />
      <HairFront style={cfg.hairStyle} c={hair} />
      {cfg.expression === 'shades' ? (
        <Face eyes="open" mouth={mouth} brows="none" blush />
      ) : (
        <Face
          eyes={eyes}
          mouth={mouth}
          iris={cfg.expression === 'fire' ? '#EF4444' : undefined}
          brows={cfg.expression === 'fire' ? 'none' : 'soft'}
          browColor={darken(hair, 0.1)}
        />
      )}
      {cfg.expression === 'fire' && (
        <Glow>
          <path
            d="M40 32.6 Q42.6 30.4 45 33.4 M60 32.6 Q57.4 30.4 55 33.4"
            fill="none"
            stroke="#F97316"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </Glow>
      )}
      <EyeWear cfg={cfg} />
      {cfg.accessory === 'headphones' && (
        <g>
          <path
            d="M33 37 C31 18 69 18 67 37"
            fill="none"
            stroke={INK}
            strokeWidth="4.6"
            strokeLinecap="round"
          />
          <path
            d="M33 37 C31 18 69 18 67 37"
            fill="none"
            stroke="#22D3EE"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <Sh as="rect" x={28.6} y={34} width={7} height={11} rx={3} fill="#0F172A" sw={1.3} />
          <Sh as="rect" x={64.4} y={34} width={7} height={11} rx={3} fill="#0F172A" sw={1.3} />
          <Glow>
            <rect x={30} y={36.6} width={2} height={6} rx={1} fill="#22D3EE" />
            <rect x={68} y={36.6} width={2} height={6} rx={1} fill="#22D3EE" />
          </Glow>
        </g>
      )}
      {cfg.accessory !== 'hockeystick' && <HeldItem kind={cfg.accessory} />}
      {/* re-draw the gripping hand over held props */}
      {holds && cfg.accessory !== 'basketball' && (
        <Sh as="circle" cx={handR[0]} cy={handR[1]} r={3.6} fill={gloves} />
      )}
      {laptop && (
        <>
          <Sh as="circle" cx={handL[0]} cy={handL[1] + 4} r={3.4} fill={gloves} />
          <Sh as="circle" cx={handR[0]} cy={handR[1] + 4} r={3.4} fill={gloves} />
        </>
      )}
    </g>
  );
};

export default CustomSprite;
