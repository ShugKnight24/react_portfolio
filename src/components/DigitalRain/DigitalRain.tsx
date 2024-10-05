import { FC, useEffect, useState } from 'react';
import { createCanvas, drawMessage, drawRain, resizeCanvas } from './digitalRainUtils';

const FONT_SIZE = 16;

export const DigitalRain: FC = () => {
  const [showMessage, setShowMessage] = useState(true);

  // TODO: Fix resizing - Resizing still increases the canvas size
  const handleResize = (canvas: HTMLCanvasElement, container: HTMLElement) => {
    const aspectRatio = container.offsetWidth / container.offsetHeight;
    const newWidth = container.offsetWidth;
    const newHeight = newWidth / aspectRatio;

    canvas.width = newWidth;
    canvas.height = newHeight;

    resizeCanvas(canvas, container, FONT_SIZE);
  };

  useEffect(() => {
    const container = document.querySelector('.digital-rain-container') as HTMLElement;
    if (!container) return;

    const canvas = createCanvas(container);

    handleResize(canvas, container);

    const onResize = () => handleResize(canvas, container);

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
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

    let drops = resizeCanvas(canvas, container, FONT_SIZE);

    if (showMessage) {
      drawMessage(ctx, canvas, FONT_SIZE, () => {
        setShowMessage(false);
      });
    } else {
      drawRain(ctx, canvas, drops, FONT_SIZE);
    }
  }, [showMessage]);

  return null;
};
