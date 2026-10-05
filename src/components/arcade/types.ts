export type CharacterCategory = 'sports' | 'anime' | 'superheroes' | 'tech' | 'gaming' | 'custom' | 'original';

export interface CharacterStats {
  power: number;
  agility: number;
  brain: number;
  charisma: number;
}

export interface CustomCharacterConfig {
  skinTone: string;
  hairStyle: 'spiky' | 'afro' | 'buzz' | 'long' | 'headband' | 'bald';
  hairColor: string;
  outfit: 'hoodie' | 'lakers' | 'bulls' | 'capitals' | 'superhero' | 'gi' | 'cyber';
  outfitColor?: string;
  accessory: 'laptop' | 'basketball' | 'hockeystick' | 'glasses' | 'headphones' | 'coffee' | 'sword';
  expression: 'happy' | 'focused' | 'wink' | 'shades' | 'fire';
  name: string;
  title: string;
  catchphrase: string;
}

export interface SpriteCharacter {
  id: string;
  name: string;
  nickname?: string;
  category: CharacterCategory;
  title: string;
  quote: string;
  signatureMove: string;
  stats: CharacterStats;
  primaryColor: string;
  secondaryColor: string;
  customConfig?: CustomCharacterConfig;
}

export type SpriteAction = 'idle' | 'bounce' | 'eating' | 'sleeping' | 'happy' | 'celebrate';

export interface TamagotchiVitals {
  hunger: number; // 0 = starving, 100 = full
  happiness: number; // 0-100
  energy: number; // 0-100
  level: number;
  exp: number;
  lastInteraction: number;
}

export type SceneId = 'detroit' | 'matrix' | 'arcade' | 'court' | 'devroom' | 'rooftop';

export interface SceneStageItem {
  instanceId: string;
  characterId: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number;
  facingLeft: boolean;
  rotation?: number; // degrees
  zIndex?: number;
  speech?: string;
}

export type LightingMood = 'studio' | 'cyber' | 'dusk' | 'noir' | 'matrixGreen';

export type WeatherEffect = 'none' | 'matrixRain' | 'codeFloat' | 'sakura' | 'confetti' | 'stars';

export type ArcadeDisplayMode = 'arcade' | 'gameboy' | 'fullscreen';
export type ArcadeTabId = 'hero' | 'playground' | 'studio' | 'gallery' | 'creator' | 'scenes' | 'chronicles' | 'brawler';

export type BrawlerFighterAction = 'idle' | 'walking' | 'punch' | 'kick' | 'jump' | 'special' | 'synergy' | 'hit' | 'ko';
export type BrawlerEnemyAction = 'idle' | 'walking' | 'attack' | 'hit' | 'ko';

export interface BrawlerFighter {
  slot: 'P1' | 'P2' | 'P3' | 'P4';
  character: SpriteCharacter;
  isLeader: boolean; // P1 is player controlled, P2-P4 are AI co-op squad
  hp: number;
  maxHp: number;
  lives: number;
  score: number;
  x: number;
  y: number;
  facingLeft: boolean;
  action: BrawlerFighterAction;
  currentCombo: number;
  specialMeter: number;
  holdingItem?: string;
}

export interface BrawlerEnemy {
  id: string;
  name: string;
  archetype: 'goon' | 'thug' | 'clown' | 'drone' | 'boss';
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facingLeft: boolean;
  action: BrawlerEnemyAction;
  damage: number;
  color: string;
  secondaryColor: string;
  width: number;
  height: number;
  points: number;
  bossPhase?: number;
}

export interface BrawlerHitEffect {
  id: number;
  text: string;
  x: number;
  y: number;
}

export interface BrawlerItem {
  id: string;
  type: 'donut' | 'pizza' | 'mallet' | 'bowling_ball' | 'nuclear_rod';
  x: number;
  y: number;
  name: string;
  effect: 'heal' | 'weapon';
  value: number;
}

export interface BrawlerStage {
  id: 'streets' | 'carnival' | 'nuclear';
  levelNumber: number;
  name: string;
  subtitle: string;
  backdropTheme: string;
  bossName: string;
  bossTitle: string;
  musicTrackTitle: string;
}
