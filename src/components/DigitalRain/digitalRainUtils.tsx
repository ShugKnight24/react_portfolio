const BACKGROUND_COLOR = 'black';
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DROP_RESET = 0.975;
const FADE_EFFECT = 'rgba(0, 0, 0, 0.05)';
const FONT_FAMILY = 'monospace';
const FONT_SIZE_MULTIPLIER = 2;
const TEXT_COLOR = '#0F0';

export const createCanvas = (container: HTMLElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  canvas.style.background = BACKGROUND_COLOR;
  return canvas;
};

export const drawMessage = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fontSize: number
) => {
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${fontSize * FONT_SIZE_MULTIPLIER}px ${FONT_FAMILY}`;
  const messages = ['Hello Neo', 'The Matrix has you', 'Follow the white rabbit'];
  messages.forEach((message, index) => {
    ctx.fillText(
      message,
      canvas.width / 4,
      canvas.height / 4 + fontSize * FONT_SIZE_MULTIPLIER * index * 1.25
    );
  });
};

export const drawRain = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  drops: number[],
  fontSize: number
) => {
  ctx.fillStyle = FADE_EFFECT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;

  drops.forEach((drop, i) => {
    const text = CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS.length));
    ctx.fillText(text, i * fontSize, drop * fontSize);

    if (drop * fontSize > canvas.height && Math.random() > DROP_RESET) {
      drops[i] = 0;
    }
    drops[i]++;
  });

  requestAnimationFrame(() => drawRain(ctx, canvas, drops, fontSize));
};

export const resizeCanvas = (
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  fontSize: number
): number[] => {
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  const columns = canvas.width / fontSize;
  return Array(Math.floor(columns)).fill(1);
};
