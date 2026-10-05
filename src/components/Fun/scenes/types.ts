export interface SceneOptions {
  /** Render a still frame; only user input starts brief bursts of motion */
  reducedMotion: boolean;
  /** Start silent; scenes never make sound until the viewer interacts and unmutes */
  muted: boolean;
  /** Tile previews pass false: no pointer or keyboard handling */
  interactive?: boolean;
}

export interface SceneHandle {
  dispose(): void;
  pause(): void;
  resume(): void;
  setMuted?(muted: boolean): void;
}

export type MountScene = (container: HTMLElement, opts: SceneOptions) => SceneHandle;

export interface SceneModule {
  mount: MountScene;
}

export type FunCategory = 'anime' | 'games' | 'comics' | 'movies' | 'studio';

export interface FunSceneMeta {
  id: string;
  /** Gallery section the scene is grouped under */
  category: FunCategory;
  title: string;
  /** One line shown under the title */
  caption: string;
  /** How to interact, shown in the player */
  hint: string;
  /** Tile accent colour */
  accent: string;
  load: () => Promise<SceneModule>;
}
