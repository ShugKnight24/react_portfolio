import { FC, useEffect, useState } from 'react';
import { createCanvas, drawMessage, drawRain, resizeCanvas } from './digitalRainUtils';

const FONT_SIZE = 16;

export const DigitalRain: FC = () => {
  const [showMessage, setShowMessage] = useState(true);

  useEffect(() => {
    const container = document.querySelector('.digital-rain-container') as HTMLElement;
    if (!container) return;

    const canvas = createCanvas(container);

    resizeCanvas(canvas, container, FONT_SIZE);

    const handleResize = () => {
      resizeCanvas(canvas, container, FONT_SIZE);
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

    let drops = resizeCanvas(canvas, container, FONT_SIZE);

    if (showMessage) {
      drawMessage(ctx, canvas, FONT_SIZE);
      setTimeout(() => {
        setShowMessage(false);
      }, 3000);
    } else {
      drawRain(ctx, canvas, drops, FONT_SIZE);
    }
  }, [showMessage]);

  return null;
};
