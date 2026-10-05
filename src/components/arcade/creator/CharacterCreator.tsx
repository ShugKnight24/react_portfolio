import {
  CSSProperties,
  FC,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { sound } from '../audio/audioSynth';
import { saveCustomCharacter } from '../data/characterRoster';
import {
  BasketballIcon,
  BoltIcon,
  DownloadIcon,
  LaptopIcon,
  MaskIcon,
  SaveIcon,
  SparkleIcon,
} from '../icons/ArcadeIcons';
import { SpriteRenderer } from '../sprites/SpriteRenderer';
import { CharacterStats, CustomCharacterConfig, SpriteAction, SpriteCharacter } from '../types';
import styles from './CharacterCreator.module.css';

interface CharacterCreatorProps {
  onCharacterCreated?: (character: SpriteCharacter) => void;
  onGoToPlayground?: (charName: string) => void;
}

interface Option<T extends string> {
  id: T;
  label: string;
}

const SKIN_TONES: Option<string>[] = [
  { id: '#fbd38d', label: 'Fair' },
  { id: '#e2a76f', label: 'Warm tan' },
  { id: '#c68642', label: 'Bronze' },
  { id: '#8d5524', label: 'Deep amber' },
  { id: '#5c3818', label: 'Espresso' },
  { id: '#7dd3fc', label: 'Cyber synth' },
];

const HAIR_COLORS: Option<string>[] = [
  { id: '#0f172a', label: 'Midnight black' },
  { id: '#b45309', label: 'Chestnut' },
  { id: '#fbbf24', label: 'Golden blonde' },
  { id: '#ef4444', label: 'Crimson red' },
  { id: '#38bdf8', label: 'Neon cyan' },
  { id: '#a855f7', label: 'Violet' },
  { id: '#ffffff', label: 'Silver white' },
];

const HOODIE_COLORS: Option<string>[] = [
  { id: '#0284c7', label: 'Ocean blue' },
  { id: '#16a34a', label: 'Phosphor green' },
  { id: '#db2777', label: 'Magenta' },
  { id: '#7c3aed', label: 'Purple' },
  { id: '#ea580c', label: 'Orange' },
  { id: '#334155', label: 'Slate' },
];

const EXPRESSIONS: Option<CustomCharacterConfig['expression']>[] = [
  { id: 'happy', label: 'Happy' },
  { id: 'focused', label: 'Coder glasses' },
  { id: 'wink', label: 'Wink' },
  { id: 'shades', label: 'Cyber shades' },
  { id: 'fire', label: 'Fire eyes' },
];

const HAIR_STYLES: Option<CustomCharacterConfig['hairStyle']>[] = [
  { id: 'spiky', label: 'Spiky' },
  { id: 'afro', label: 'Afro' },
  { id: 'buzz', label: 'Buzz cut' },
  { id: 'long', label: 'Long' },
  { id: 'headband', label: 'Ninja band' },
  { id: 'bald', label: 'Bald' },
];

const OUTFITS: Option<CustomCharacterConfig['outfit']>[] = [
  { id: 'hoodie', label: 'Tech hoodie' },
  { id: 'lakers', label: 'Lakers #24' },
  { id: 'bulls', label: 'Bulls #23' },
  { id: 'capitals', label: 'Capitals #8' },
  { id: 'superhero', label: 'Cape and emblem' },
  { id: 'gi', label: 'Turtle gi' },
  { id: 'cyber', label: 'Cyber armor' },
];

const ACCESSORIES: Option<CustomCharacterConfig['accessory']>[] = [
  { id: 'laptop', label: 'Laptop' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'hockeystick', label: 'Hockey stick' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'sword', label: 'Katana' },
  { id: 'glasses', label: 'None' },
];

const POSES: Option<SpriteAction>[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'bounce', label: 'Jump' },
  { id: 'happy', label: 'Cheer' },
  { id: 'sleeping', label: 'Sleep' },
];

const STAT_FIELDS: { id: keyof CharacterStats; label: string }[] = [
  { id: 'power', label: 'Power' },
  { id: 'agility', label: 'Agility' },
  { id: 'brain', label: 'Brain' },
  { id: 'charisma', label: 'Charisma' },
];

const PRESETS: {
  id: string;
  label: string;
  icon: typeof LaptopIcon;
  config: Partial<CustomCharacterConfig>;
}[] = [
  {
    id: 'founder',
    label: 'Dev founder',
    icon: LaptopIcon,
    config: {
      skinTone: '#e2a76f',
      hairStyle: 'buzz',
      hairColor: '#0f172a',
      outfit: 'hoodie',
      accessory: 'laptop',
      expression: 'focused',
      name: 'ShugKnight',
      title: 'Detroit Craftsman',
      catchphrase: 'Ship with grit, intention & soul.',
    },
  },
  {
    id: 'mamba',
    label: 'Mamba',
    icon: BasketballIcon,
    config: {
      skinTone: '#8d5524',
      hairStyle: 'buzz',
      hairColor: '#0f172a',
      outfit: 'lakers',
      accessory: 'basketball',
      expression: 'fire',
      name: 'Mamba Spirit',
      title: 'Relentless Competitor',
      catchphrase: 'Job finished? Job not finished.',
    },
  },
  {
    id: 'anime',
    label: 'Anime sorcerer',
    icon: BoltIcon,
    config: {
      skinTone: '#fbd38d',
      hairStyle: 'spiky',
      hairColor: '#ffffff',
      outfit: 'gi',
      accessory: 'sword',
      expression: 'shades',
      name: 'Limitless Satoru',
      title: 'Domain Expansion',
      catchphrase: 'Throughout heaven and earth, I alone am the honored one.',
    },
  },
  {
    id: 'hero',
    label: 'Superhero',
    icon: MaskIcon,
    config: {
      skinTone: '#e2a76f',
      hairStyle: 'long',
      hairColor: '#ef4444',
      outfit: 'superhero',
      accessory: 'headphones',
      expression: 'wink',
      name: 'Urban Vigilante',
      title: 'Guardian of Detroit',
      catchphrase: 'With great bandwidth comes great responsibility.',
    },
  },
];

interface Draft {
  config: CustomCharacterConfig;
  stats: CharacterStats;
  signatureMove: string;
}

const DEFAULT_DRAFT: Draft = {
  config: {
    skinTone: '#e2a76f',
    hairStyle: 'spiky',
    hairColor: '#0f172a',
    outfit: 'hoodie',
    outfitColor: '#0284c7',
    accessory: 'laptop',
    expression: 'happy',
    name: 'Pixel Pioneer',
    title: 'Code Alchemist',
    catchphrase: 'Building tomorrow, one pixel at a time.',
  },
  stats: { power: 90, agility: 90, brain: 95, charisma: 92 },
  signatureMove: 'Dynamic Vector Surge',
};

const TABS = [
  { id: 'name', label: 'Name' },
  { id: 'face', label: 'Face' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'colors', label: 'Colors' },
  { id: 'stats', label: 'Stats' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const HISTORY_LIMIT = 40;

/* ------------------------------------------------------------------ */
/* Radio group with roving tabindex: arrows move and select, like native radios */
/* ------------------------------------------------------------------ */

interface ChoiceGroupProps<T extends string> {
  label: string;
  hint?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  variant: 'chip' | 'swatch';
}

function ChoiceGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  variant,
}: ChoiceGroupProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: number | null = null;
    if (e.key in keys) next = (selectedIndex + keys[e.key] + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  const selectedLabel = options[selectedIndex]?.label;

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <span id={labelId} className={styles.fieldLabel}>
          {label}
        </span>
        {variant === 'swatch' && <span className={styles.fieldValue}>{selectedLabel}</span>}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        className={variant === 'swatch' ? styles.swatchRow : styles.chipGrid}
        onKeyDown={handleKeyDown}
      >
        {options.map((opt, idx) => {
          const checked = idx === selectedIndex;
          return (
            <button
              key={opt.id}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={variant === 'swatch' ? opt.label : undefined}
              title={variant === 'swatch' ? opt.label : undefined}
              tabIndex={checked ? 0 : -1}
              className={variant === 'swatch' ? styles.swatch : styles.chip}
              style={variant === 'swatch' ? { backgroundColor: opt.id } : undefined}
              onClick={() => onChange(opt.id)}
            >
              {variant === 'chip' && opt.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className={styles.fieldHint}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  onFocus: () => void;
  onChange: (value: string) => void;
}

const TextField: FC<TextFieldProps> = ({
  label,
  value,
  maxLength,
  placeholder,
  onFocus,
  onChange,
}) => {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        <span className={styles.fieldValue} aria-hidden="true">
          {value.length}/{maxLength}
        </span>
      </div>
      <input
        id={id}
        type="text"
        className={styles.textInput}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

export const CharacterCreator: FC<CharacterCreatorProps> = ({
  onCharacterCreated,
  onGoToPlayground,
}) => {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [history, setHistory] = useState<Draft[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('name');
  const [pose, setPose] = useState<SpriteAction>('idle');
  const [facingLeft, setFacingLeft] = useState(false);
  const [changeTick, setChangeTick] = useState(0);
  const [savedName, setSavedName] = useState<string | null>(null);

  const spriteWrapRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const baseId = useId();

  const { config, stats } = draft;

  useEffect(
    () => () => {
      clearTimeout(poseTimer.current);
      clearTimeout(saveTimer.current);
    },
    []
  );

  const snapshot = () => setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), draft]);

  const commit = (next: Draft) => {
    snapshot();
    setDraft(next);
    setChangeTick((t) => t + 1);
  };

  const setAppearance = <K extends keyof CustomCharacterConfig>(
    field: K,
    val: CustomCharacterConfig[K]
  ) => {
    if (config[field] === val) return;
    sound.playBeep(480, 0.03);
    commit({ ...draft, config: { ...config, [field]: val } });
  };

  // Text fields snapshot once on focus so one Undo reverts a whole edit
  const setText = (field: 'name' | 'title' | 'catchphrase', val: string) =>
    setDraft((d) => ({ ...d, config: { ...d.config, [field]: val } }));

  const setStat = (field: keyof CharacterStats, val: number) =>
    setDraft((d) => ({ ...d, stats: { ...d.stats, [field]: val } }));

  const loadPreset = (preset: (typeof PRESETS)[number]) => {
    sound.playPowerUp();
    commit({ ...draft, config: { ...config, ...preset.config } });
  };

  const randomize = () => {
    sound.playPowerUp();
    commit({
      ...draft,
      config: {
        ...config,
        skinTone: pick(SKIN_TONES).id,
        hairStyle: pick(HAIR_STYLES).id,
        hairColor: pick(HAIR_COLORS).id,
        outfit: pick(OUTFITS).id,
        outfitColor: pick(HOODIE_COLORS).id,
        accessory: pick(ACCESSORIES).id,
        expression: pick(EXPRESSIONS).id,
      },
      stats: {
        power: 40 + Math.floor(Math.random() * 61),
        agility: 40 + Math.floor(Math.random() * 61),
        brain: 40 + Math.floor(Math.random() * 61),
        charisma: 40 + Math.floor(Math.random() * 61),
      },
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    sound.playBeep(360, 0.04);
    setDraft(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setChangeTick((t) => t + 1);
  };

  const reset = () => {
    sound.playBeep(300, 0.05);
    commit(DEFAULT_DRAFT);
  };

  const playPose = (next: SpriteAction) => {
    clearTimeout(poseTimer.current);
    if (next === 'bounce') sound.playJump();
    else if (next === 'happy') sound.playPowerUp();
    else if (next === 'sleeping') sound.playSleep();
    else sound.playBeep(440, 0.05);
    setPose(next);
    // Jump and Cheer are one-shot moves that settle back to Idle
    if (next === 'bounce' || next === 'happy') {
      poseTimer.current = setTimeout(() => setPose('idle'), 1200);
    }
  };

  const turn = () => {
    sound.playBeep(520, 0.03);
    setFacingLeft((f) => !f);
  };

  const handleSave = () => {
    sound.playCoin();
    const newChar: SpriteCharacter = {
      id: `custom_${Date.now()}`,
      name: config.name.trim() || 'Custom Hero',
      category: 'custom',
      title: config.title.trim() || 'Creator Champion',
      quote: config.catchphrase.trim() || 'Crafted in the Character Lab',
      signatureMove: draft.signatureMove.trim() || 'Dynamic Vector Surge',
      stats,
      primaryColor: config.skinTone,
      secondaryColor: config.hairColor,
      customConfig: config,
    };
    saveCustomCharacter(newChar);
    onCharacterCreated?.(newChar);
    setSavedName(newChar.name);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSavedName(null), 8000);
  };

  const handleExportSvg = () => {
    const svgEl = spriteWrapRef.current?.querySelector('svg');
    if (!svgEl) return;
    sound.playCoin();
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(config.name || 'hero').toLowerCase().replace(/\s+/g, '_')}_sprite.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setActiveTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const tabId = (id: TabId) => `${baseId}-tab-${id}`;
  const panelId = (id: TabId) => `${baseId}-panel-${id}`;

  const panel = (id: TabId, children: ReactNode) => (
    <div
      key={id}
      id={panelId(id)}
      role="tabpanel"
      aria-labelledby={tabId(id)}
      hidden={activeTab !== id}
      className={styles.panel}
    >
      {children}
    </div>
  );

  const total = stats.power + stats.agility + stats.brain + stats.charisma;

  return (
    <div className={styles.shell}>
      <div className={styles.lab} role="region" aria-label="Character Lab editor">
        {/* Live preview */}
        <section className={styles.previewCol} aria-label="Live preview">
          <div className={styles.stage}>
            <div className={styles.stageGrid} aria-hidden="true" />
            <span key={changeTick} className={styles.stageFlash} aria-hidden="true" />
            <div
              ref={spriteWrapRef}
              className={`${styles.spriteTurn} ${facingLeft ? styles.facingLeft : ''}`}
            >
              <SpriteRenderer
                customConfig={config}
                action={pose}
                size={200}
                className={styles.sprite}
              />
            </div>
            <span className={styles.floorShadow} aria-hidden="true" />
          </div>

          <div className={styles.poseBar}>
            <div className={styles.segmented} role="group" aria-label="Preview pose">
              {POSES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={pose === p.id}
                  className={styles.segment}
                  onClick={() => playPose(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.ghostBtn}
              aria-pressed={facingLeft}
              onClick={turn}
            >
              Turn
            </button>
          </div>

          <div className={styles.card}>
            <p className={styles.cardName}>{config.name || 'Hero'}</p>
            <p className={styles.cardTitle}>{config.title || 'Novice'}</p>
            {config.catchphrase && <p className={styles.cardQuote}>"{config.catchphrase}"</p>}
            <dl className={styles.cardStats}>
              {STAT_FIELDS.map((s) => (
                <div key={s.id} className={styles.cardStat}>
                  <dt>{s.label}</dt>
                  <dd>
                    <span className={styles.meter} aria-hidden="true">
                      <span style={{ transform: `scaleX(${stats[s.id] / 100})` }} />
                    </span>
                    <span className={styles.meterValue}>{stats[s.id]}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Controls */}
        <section className={styles.controlsCol} aria-label="Customize">
          <div className={styles.presetRow}>
            <span className={styles.presetLabel}>Start from</span>
            <div className={styles.presetList}>
              {PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => loadPreset(p)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Customize categories"
            onKeyDown={handleTabKeyDown}
          >
            {TABS.map((t, idx) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                aria-controls={panelId(t.id)}
                tabIndex={activeTab === t.id ? 0 : -1}
                className={styles.tab}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {panel(
            'name',
            <>
              <TextField
                label="Name"
                value={config.name}
                maxLength={18}
                placeholder="Hero Name"
                onFocus={snapshot}
                onChange={(v) => setText('name', v)}
              />
              <TextField
                label="Title"
                value={config.title}
                maxLength={24}
                placeholder="Class or Archetype"
                onFocus={snapshot}
                onChange={(v) => setText('title', v)}
              />
              <TextField
                label="Catchphrase"
                value={config.catchphrase}
                maxLength={60}
                placeholder="Signature Quote"
                onFocus={snapshot}
                onChange={(v) => setText('catchphrase', v)}
              />
            </>
          )}

          {panel(
            'face',
            <>
              <ChoiceGroup
                label="Expression"
                variant="chip"
                options={EXPRESSIONS}
                value={config.expression}
                onChange={(v) => setAppearance('expression', v)}
              />
              <ChoiceGroup
                label="Hair style"
                variant="chip"
                options={HAIR_STYLES}
                value={config.hairStyle}
                onChange={(v) => setAppearance('hairStyle', v)}
              />
            </>
          )}

          {panel(
            'outfit',
            <>
              <ChoiceGroup
                label="Outfit"
                variant="chip"
                options={OUTFITS}
                value={config.outfit}
                onChange={(v) => setAppearance('outfit', v)}
              />
              <ChoiceGroup
                label="Accessory"
                variant="chip"
                options={ACCESSORIES}
                value={config.accessory}
                onChange={(v) => setAppearance('accessory', v)}
              />
            </>
          )}

          {panel(
            'colors',
            <>
              <ChoiceGroup
                label="Skin tone"
                variant="swatch"
                options={SKIN_TONES}
                value={config.skinTone}
                onChange={(v) => setAppearance('skinTone', v)}
              />
              <ChoiceGroup
                label="Hair color"
                variant="swatch"
                options={HAIR_COLORS}
                value={config.hairColor}
                onChange={(v) => setAppearance('hairColor', v)}
              />
              <ChoiceGroup
                label="Hoodie color"
                variant="swatch"
                hint={
                  config.outfit === 'hoodie'
                    ? undefined
                    : 'Shows when the outfit is the Tech hoodie.'
                }
                options={HOODIE_COLORS}
                value={config.outfitColor || HOODIE_COLORS[0].id}
                onChange={(v) => setAppearance('outfitColor', v)}
              />
            </>
          )}

          {panel(
            'stats',
            <>
              {STAT_FIELDS.map((s) => {
                const id = `${baseId}-stat-${s.id}`;
                return (
                  <div key={s.id} className={styles.field}>
                    <div className={styles.fieldHead}>
                      <label htmlFor={id} className={styles.fieldLabel}>
                        {s.label}
                      </label>
                      <output htmlFor={id} className={styles.fieldValue}>
                        {stats[s.id]}
                      </output>
                    </div>
                    <input
                      id={id}
                      type="range"
                      min={1}
                      max={100}
                      value={stats[s.id]}
                      className={styles.slider}
                      style={{ '--fill': `${stats[s.id]}%` } as CSSProperties}
                      onPointerDown={snapshot}
                      onKeyDown={(e) => {
                        if (!e.repeat && e.key.startsWith('Arrow')) snapshot();
                      }}
                      onChange={(e) => setStat(s.id, Number(e.target.value))}
                    />
                  </div>
                );
              })}
              <p className={styles.statTotal}>
                Total <strong>{total}</strong> / 400
              </p>
              <TextField
                label="Signature move"
                value={draft.signatureMove}
                maxLength={28}
                placeholder="Finishing Move"
                onFocus={snapshot}
                onChange={(v) => setDraft((d) => ({ ...d, signatureMove: v }))}
              />
            </>
          )}

          <div className={styles.toolRow}>
            <button type="button" className={styles.ghostBtn} onClick={randomize}>
              <SparkleIcon size={14} aria-hidden="true" />
              <span>Randomize</span>
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={undo}
              disabled={history.length === 0}
            >
              Undo
            </button>
            <button type="button" className={styles.ghostBtn} onClick={reset}>
              Reset
            </button>
          </div>

          <div className={styles.actionRow}>
            <button type="button" className={styles.primaryBtn} onClick={handleSave}>
              <SaveIcon size={16} aria-hidden="true" />
              <span>Save to roster</span>
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleExportSvg}>
              <DownloadIcon size={16} aria-hidden="true" />
              <span>Export SVG</span>
            </button>
          </div>

          <div className={styles.saveStatus} role="status">
            {savedName && (
              <>
                <span>
                  <strong>{savedName}</strong> joined the roster.
                </span>
                {onGoToPlayground && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => onGoToPlayground(savedName)}
                  >
                    Adopt in Tamagotchi
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CharacterCreator;
