// Action-based input: two keyboard layouts, up to two gamepads (auto-assigned on
// first press), and a virtual touch pad for P1. Gameplay reads PlayerInput only.
import { MAX_PLAYERS } from './constants';

export interface PlayerInput {
  x: number;
  y: number;
  attack: boolean;
  jump: boolean;
  special: boolean;
  start: boolean;
  attackP: boolean;
  jumpP: boolean;
  specialP: boolean;
  startP: boolean;
  leftP: boolean;
  rightP: boolean;
  upP: boolean;
  downP: boolean;
  /** double-tap run is active */
  run: boolean;
  anyP: boolean;
}

type Action = 'left' | 'right' | 'up' | 'down' | 'attack' | 'jump' | 'special' | 'start';

const KEYMAPS: Record<string, Action>[] = [
  {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyJ: 'attack',
    KeyK: 'jump',
    Space: 'jump',
    KeyL: 'special',
    Enter: 'start',
  },
  {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Numpad1: 'attack',
    Comma: 'attack',
    Numpad2: 'jump',
    Period: 'jump',
    Numpad3: 'special',
    Slash: 'special',
    NumpadEnter: 'start',
  },
];

const PAUSE_CODES = new Set(['Escape', 'KeyP']);

const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'start'];

type ActionState = Record<Action, boolean>;
const emptyState = (): ActionState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  attack: false,
  jump: false,
  special: false,
  start: false,
});

const emptyInput = (): PlayerInput => ({
  x: 0,
  y: 0,
  attack: false,
  jump: false,
  special: false,
  start: false,
  attackP: false,
  jumpP: false,
  specialP: false,
  startP: false,
  leftP: false,
  rightP: false,
  upP: false,
  downP: false,
  run: false,
  anyP: false,
});

const DOUBLE_TAP_TICKS = 14;

export class InputManager {
  readonly players: PlayerInput[] = [emptyInput(), emptyInput()];
  /** true for exactly one poll after Escape/P */
  pausePressed = false;

  private held = new Set<string>();
  private downQueue = new Set<string>();
  private pauseQueued = false;
  private prev: ActionState[] = [emptyState(), emptyState()];
  private cur: ActionState[] = [emptyState(), emptyState()];
  private padSlot = new Map<number, number>();
  private kbUsed = [false, false];
  private touch: ActionState = emptyState();
  private touchDown = new Set<Action>();
  private tick = 0;
  private lastTapDir = [0, 0];
  private lastTapTick = [-99, -99];
  private runDir = [0, 0];
  private listeners: Array<() => void> = [];

  /** isActive() gates keyboard capture (canvas focused). */
  constructor(private isActive: () => boolean) {}

  attach(): void {
    const kd = (e: KeyboardEvent) => this.onKeyDown(e);
    const ku = (e: KeyboardEvent) => this.onKeyUp(e);
    const blur = () => this.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.listeners.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur)
    );
  }

  detach(): void {
    this.listeners.forEach((off) => off());
    this.listeners = [];
    this.clear();
  }

  clear(): void {
    this.held.clear();
    this.downQueue.clear();
    this.touch = emptyState();
    this.touchDown.clear();
  }

  private bound(code: string): boolean {
    return KEYMAPS.some((m) => m[code] !== undefined) || PAUSE_CODES.has(code);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isActive()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.bound(e.code)) return;
    e.preventDefault();
    if (PAUSE_CODES.has(e.code)) {
      if (!e.repeat) this.pauseQueued = true;
      return;
    }
    if (!e.repeat) this.downQueue.add(e.code);
    this.held.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.held.delete(e.code);
  }

  /** Touch controls feed P1 through these. */
  setTouch(action: Action, down: boolean): void {
    if (down && !this.touch[action]) this.touchDown.add(action);
    this.touch[action] = down;
  }

  private padState: ActionState = emptyState();

  private readPads(): void {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') return;
    let pads: ArrayLike<Gamepad | null>;
    try {
      pads = nav.getGamepads();
    } catch {
      return;
    }
    const st = this.padState;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      const btn = pad.buttons;
      const b = (k: number) => !!btn[k] && btn[k].pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      st.left = b(14) || ax < -0.4;
      st.right = b(15) || ax > 0.4;
      st.up = b(12) || ay < -0.4;
      st.down = b(13) || ay > 0.4;
      st.attack = b(2) || b(5);
      st.jump = b(0);
      st.special = b(1) || b(3);
      st.start = b(9);
      let slot = this.padSlot.get(pad.index);
      if (slot === undefined) {
        // auto-assign on first press: P1 unless P1 is already on keyboard
        let anyBtn = false;
        for (let k = 0; k < btn.length; k++) if (btn[k].pressed) anyBtn = true;
        if (!anyBtn) continue;
        const taken = new Set(this.padSlot.values());
        const pref =
          !this.kbUsed[0] && !taken.has(0)
            ? 0
            : [0, 1].find((s) => !taken.has(s) && !(s === 0 && this.kbUsed[0]));
        if (pref === undefined) continue;
        slot = pref;
        this.padSlot.set(pad.index, slot);
      }
      const into = this.cur[slot];
      for (let k = 0; k < ACTIONS.length; k++) {
        const a = ACTIONS[k];
        if (st[a]) into[a] = true;
      }
    }
  }

  /** Sample all devices; call exactly once per fixed tick. */
  poll(): void {
    this.tick++;
    this.pausePressed = this.pauseQueued;
    this.pauseQueued = false;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const prev = this.prev[p];
      const cur = this.cur[p];
      ACTIONS.forEach((a) => (prev[a] = cur[a]));
      ACTIONS.forEach((a) => (cur[a] = false));
    }
    const queuedByPlayer: Array<Set<Action>> = [new Set(), new Set()];
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const map = KEYMAPS[p];
      for (const code in map) {
        if (this.held.has(code)) {
          this.cur[p][map[code]] = true;
          this.kbUsed[p] = true;
        }
        if (this.downQueue.has(code)) {
          queuedByPlayer[p].add(map[code]);
          this.kbUsed[p] = true;
        }
      }
    }
    this.downQueue.clear();
    ACTIONS.forEach((a) => (this.cur[0][a] = this.cur[0][a] || this.touch[a]));
    this.touchDown.forEach((a) => queuedByPlayer[0].add(a));
    this.touchDown.clear();
    this.readPads();

    for (let p = 0; p < MAX_PLAYERS; p++) {
      const cur = this.cur[p];
      const prev = this.prev[p];
      const q = queuedByPlayer[p];
      const out = this.players[p];
      const edge = (a: Action) => (cur[a] && !prev[a]) || q.has(a);
      out.x = (cur.right || q.has('right') ? 1 : 0) - (cur.left || q.has('left') ? 1 : 0);
      out.y = (cur.down ? 1 : 0) - (cur.up ? 1 : 0);
      out.attack = cur.attack;
      out.jump = cur.jump;
      out.special = cur.special;
      out.start = cur.start;
      out.attackP = edge('attack');
      out.jumpP = edge('jump');
      out.specialP = edge('special');
      out.startP = edge('start');
      out.leftP = edge('left');
      out.rightP = edge('right');
      out.upP = edge('up');
      out.downP = edge('down');
      out.anyP = out.attackP || out.jumpP || out.specialP || out.startP;

      // double-tap run detection
      const tapDir = out.leftP ? -1 : out.rightP ? 1 : 0;
      if (tapDir !== 0) {
        if (this.lastTapDir[p] === tapDir && this.tick - this.lastTapTick[p] <= DOUBLE_TAP_TICKS)
          this.runDir[p] = tapDir;
        this.lastTapDir[p] = tapDir;
        this.lastTapTick[p] = this.tick;
      }
      if (this.runDir[p] !== 0 && out.x !== this.runDir[p]) this.runDir[p] = 0;
      out.run = this.runDir[p] !== 0;
    }
  }

  /** Cancel an active run (e.g. after a run attack). */
  stopRun(p: number): void {
    this.runDir[p] = 0;
    this.players[p].run = false;
  }
}
