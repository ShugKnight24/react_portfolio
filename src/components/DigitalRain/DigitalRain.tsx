import { FC, useEffect, useState } from 'react';

export const DigitalRain: FC = () => {
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);

  useEffect(() => {
    const container = document.querySelector('.digital-rain-container') as HTMLElement;
    if (!container) return;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    canvas.style.background = 'black';

    const fontSize = 16;
    let columns = canvas.width / fontSize;
    let drops = Array(Math.floor(columns)).fill(1);

    function resizeCanvas() {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetWidth;
      columns = canvas.width / fontSize;
      drops = Array(Math.floor(columns)).fill(1);
    }

    // Handle window resize
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
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
    let columns = canvas.width / fontSize;
    let drops = Array(Math.floor(columns)).fill(1);

    function draw() {
      if (!ctx) return;
      if (!canvas) return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0F0'; // Neon green
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      requestAnimationFrame(draw);
    }

    function drawWelcomeMessage() {
      if (!ctx) return;
      if (!canvas) return;
      ctx.fillStyle = '#0F0';
      ctx.font = `bold ${fontSize * 2}px monospace`;
      ctx.fillText('Hello Neo', canvas.width / 4, canvas.height / 4);
      ctx.fillText('The Matrix has you', canvas.width / 4, canvas.height / 4 + fontSize * 2.5);
      ctx.fillText('Follow the white rabbit', canvas.width / 4, canvas.height / 4 + fontSize * 5);
    }

    // Start the animation
    if (showWelcomeMessage) {
      drawWelcomeMessage();
      setTimeout(() => {
        setShowWelcomeMessage(false);
      }, 3000);
    } else {
      draw();
    }
  }, [showWelcomeMessage]);

  return null;
};
