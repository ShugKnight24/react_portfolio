// Thin SFX layer over the shared chiptune synth. Throttles repeats so a
// multi-hit special doesn't stack dozens of oscillators in one frame.
import { sound } from '../../audio/audioSynth';

type Sfx =
  | 'hit'
  | 'heavy'
  | 'whiff'
  | 'jump'
  | 'land'
  | 'special'
  | 'pickup'
  | 'food'
  | 'ko'
  | 'block'
  | 'clear'
  | 'select'
  | 'confirm'
  | 'throw'
  | 'boss'
  | 'alarm'
  | 'hurt';

const last: Partial<Record<Sfx, number>> = {};
const GAP: Partial<Record<Sfx, number>> = {
  hit: 45,
  heavy: 60,
  whiff: 60,
  block: 60,
  land: 90,
  hurt: 80,
};

export const sfx = (name: Sfx): void => {
  if (!sound.enabled) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const gap = GAP[name] ?? 30;
  const prev = last[name];
  if (prev !== undefined && now - prev < gap) return;
  last[name] = now;
  try {
    switch (name) {
      case 'hit':
        sound.playBeep(150 + Math.random() * 60, 0.05);
        break;
      case 'heavy':
        sound.playBeep(90 + Math.random() * 20, 0.11);
        sound.playBeep(55, 0.14);
        break;
      case 'whiff':
        sound.playBeep(700, 0.02);
        break;
      case 'jump':
        sound.playJump();
        break;
      case 'land':
        sound.playBeep(70, 0.04);
        break;
      case 'special':
        sound.playLaser();
        break;
      case 'pickup':
        sound.playCoin();
        break;
      case 'food':
        sound.playEat();
        break;
      case 'ko':
        sound.playSleep();
        break;
      case 'block':
        sound.playBeep(1200, 0.03);
        break;
      case 'clear':
        sound.playPowerUp();
        break;
      case 'select':
        sound.playBeep(660, 0.04);
        break;
      case 'confirm':
        sound.playBeep(880, 0.08);
        break;
      case 'throw':
        sound.playBeep(300, 0.06);
        break;
      case 'boss':
        sound.playLaser();
        sound.playBeep(110, 0.3);
        break;
      case 'alarm':
        sound.playBeep(520, 0.09);
        break;
      case 'hurt':
        sound.playBeep(210, 0.07);
        break;
    }
  } catch {
    // audio is best-effort
  }
};
