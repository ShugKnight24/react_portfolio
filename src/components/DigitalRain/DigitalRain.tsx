import { FC, useEffect, useState } from 'react';
import { createCanvas, drawMessage, drawRain, resizeCanvas } from './digitalRainUtils';

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
