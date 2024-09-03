export const createCanvas = (container: HTMLElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  canvas.style.background = 'black';
  return canvas;
};

export const drawMessage = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fontSize: number
) => {
  ctx.fillStyle = '#0F0';
  ctx.font = `bold ${fontSize * 2}px monospace`;
  ctx.fillText('Hello Neo', canvas.width / 4, canvas.height / 4);
  ctx.fillText('The Matrix has you', canvas.width / 4, canvas.height / 4 + fontSize * 2.5);
  ctx.fillText('Follow the white rabbit', canvas.width / 4, canvas.height / 4 + fontSize * 5);
};

export const drawRain = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  drops: number[],
  characters: string,
  fontSize: number
) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0F0';
  ctx.font = `${fontSize}px monospace`;

  for (let i = 0; i < drops.length; i++) {
    const text = characters.charAt(Math.floor(Math.random() * characters.length));
    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
  requestAnimationFrame(() => drawRain(ctx, canvas, drops, characters, fontSize));
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
