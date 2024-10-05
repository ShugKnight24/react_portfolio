const BACKGROUND_COLOR = 'black';
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DROP_RESET = 0.975;
const FADE_EFFECT = 'rgba(0, 0, 0, 0.05)';
const FONT_FAMILY = 'monospace';
const FONT_SIZE_MULTIPLIER = 2;
const TEXT_COLOR = '#0F0';
const messages = [
  'Are you sure this line is clean?',
  "Yeah, of course I'm sure",
  'I better go...',
  '...',
  'Wake up, Neo...',
  'The Matrix has you... ',
  'Follow the white rabbit.',
  'Knock, knock, Neo.',
];

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
  fontSize: number,
  onComplete: () => void
) => {
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${fontSize * FONT_SIZE_MULTIPLIER}px ${FONT_FAMILY}`;

  let messageIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const typeMessage = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const message = messages[messageIndex];
    const displayText = message.substring(0, charIndex);

    // Calculate the position to center the text
    const textWidth = ctx.measureText(displayText).width;
    const x = (canvas.width - textWidth) / 2;
    const y = canvas.height / 2;

    ctx.fillText(displayText, x, y);

    if (!deleting) {
      if (charIndex < message.length) {
        charIndex++;
      } else {
        deleting = true;
        setTimeout(typeMessage, 1000); // Pause before deleting
        return;
      }
    } else {
      if (charIndex > 0) {
        charIndex = 0; // Instantly delete the string
        setTimeout(typeMessage, 1000); // Pause before typing the next message
        return;
      } else {
        deleting = false;
        messageIndex = (messageIndex + 1) % messages.length;
        if (messageIndex === 0) {
          onComplete();
          return;
        }
      }
    }

    setTimeout(typeMessage, 100);
  };

  typeMessage();
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
