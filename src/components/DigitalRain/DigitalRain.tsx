import { FC, useEffect, useState } from 'react';

const createCanvas = (container: HTMLElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  canvas.style.background = 'black';
  return canvas;
};

const drawMessage = (
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

const drawRain = (
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

const resizeCanvas = (
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  fontSize: number
): number[] => {
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  const columns = canvas.width / fontSize;
  return Array(Math.floor(columns)).fill(1);
};

export const DigitalRain: FC = () => {
  const [showMessage, setShowMessage] = useState(true);

  useEffect(() => {
    const container = document.querySelector('.digital-rain-container') as HTMLElement;
    if (!container) return;

    const canvas = createCanvas(container);

    const fontSize = 16;
    resizeCanvas(canvas, container, fontSize);

    const handleResize = () => {
      resizeCanvas(canvas, container, fontSize);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    const container = document.querySelector('.digital-rain-container') as HTMLElement;
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const fontSize = 16;
    let drops = resizeCanvas(canvas, container, fontSize);

    if (showMessage) {
      drawMessage(ctx, canvas, fontSize);
      setTimeout(() => {
        setShowMessage(false);
      }, 3000);
    } else {
      drawRain(ctx, canvas, drops, characters, fontSize);
    }
  }, [showMessage]);

  return null;
};
