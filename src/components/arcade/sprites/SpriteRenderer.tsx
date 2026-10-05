import { FC, useId } from 'react';
import { CustomCharacterConfig, SpriteAction, SpriteCharacter } from '../types';
import { CustomSprite } from './CustomSprite';
import { PRESET_SPRITES } from './presets';
import { Shugmi } from './presetsOriginals';
import { KitDefs, KitIds, KitProvider, moodFromAction } from './spriteKit';
import styles from './SpriteRenderer.module.css';

interface SpriteRendererProps {
  character?: SpriteCharacter;
  customConfig?: CustomCharacterConfig;
  action?: SpriteAction;
  size?: number; // size in px, default 120
  className?: string;
  onClick?: () => void;
}

export const SpriteRenderer: FC<SpriteRendererProps> = ({
  character,
  customConfig,
  action = 'idle',
  size = 120,
  className = '',
  onClick,
}) => {
  const config = customConfig || character?.customConfig;
  const charId = character?.id || (config ? 'custom' : 'shugmi');
  const label = character?.name || config?.name || 'Character sprite';

  // Gradient ids must be unique per instance: many sprites share a page.
  const uid = `spr${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ids: KitIds = {
    cel: `${uid}-cel`,
    hl: `${uid}-hl`,
    rim: `${uid}-rim`,
    glow: `${uid}-glow`,
  };
  const mood = moodFromAction(action);

  const Preset = PRESET_SPRITES[charId] || Shugmi;

  return (
    <div
      className={`${styles.arcadeSpriteContainer} sprite-action-${action} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      role="img"
      aria-label={label}
    >
      <svg
        viewBox="0 0 100 100"
        className="arcade-sprite-svg"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <KitDefs ids={ids} />
        </defs>

        {/* Ground shadow */}
        <ellipse
          cx="50"
          cy="96"
          rx="25"
          ry="3.6"
          fill={`url(#${uid}-shadow)`}
          className="sprite-ground-shadow"
        />

        {/* Sleep Zzz particles */}
        {action === 'sleeping' && (
          <g
            className="sleep-zzz"
            fontWeight="900"
            fontFamily="'Arial Black', Arial, sans-serif"
            stroke="#0B1020"
            strokeWidth="0.8"
            paintOrder="stroke"
          >
            <text x="70" y="30" fill="#7DD3FC" fontSize="8">
              Z
            </text>
            <text x="77" y="21" fill="#7DD3FC" fontSize="10">
              z
            </text>
            <text x="84" y="12" fill="#7DD3FC" fontSize="12">
              z
            </text>
          </g>
        )}

        {/* Eating crumb particles */}
        {action === 'eating' && (
          <g className="eating-crumbs">
            <circle cx="62" cy="56" r="1.5" fill="#F59E0B" />
            <circle cx="66" cy="60" r="1.2" fill="#FDE68A" />
            <circle cx="58" cy="62" r="1" fill="#F59E0B" />
          </g>
        )}

        {/* Main sprite */}
        <KitProvider ids={ids} mood={mood}>
          <g className="sprite-body">{config ? <CustomSprite cfg={config} /> : <Preset />}</g>
        </KitProvider>

        {/* Happy hearts and sparkles */}
        {(action === 'happy' || action === 'celebrate') && (
          <g className="happy-hearts">
            <path
              d="M14 22 C14 19 18 18 19 21 C20 18 24 19 24 22 C24 25.6 19 29 19 29 C19 29 14 25.6 14 22 Z"
              fill="#FB7185"
              stroke="#0B1020"
              strokeWidth="1"
            />
            <path
              d="M78 14 C78 11.4 81.4 10.6 82.4 13.2 C83.4 10.6 86.8 11.4 86.8 14 C86.8 17.2 82.4 20 82.4 20 C82.4 20 78 17.2 78 14 Z"
              fill="#FB7185"
              stroke="#0B1020"
              strokeWidth="1"
            />
            <path
              d="M86 32 L87.2 35 L90.2 36.2 L87.2 37.4 L86 40.4 L84.8 37.4 L81.8 36.2 L84.8 35 Z"
              fill="#FDE68A"
            />
            <path
              d="M12 40 L12.9 42.3 L15.2 43.2 L12.9 44.1 L12 46.4 L11.1 44.1 L8.8 43.2 L11.1 42.3 Z"
              fill="#FDE68A"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
