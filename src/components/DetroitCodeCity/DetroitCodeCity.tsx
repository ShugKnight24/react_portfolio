import { FC, useEffect, useMemo, useRef, useState } from 'react';
import styles from './DetroitCodeCity.module.css';

export const DetroitCodeCity: FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Generate Matrix rain columns for the right section (memoized to prevent render thrashing)
  const matrixColumns = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const xPercent = 58 + Math.random() * 40; // 58%-98% of container width
        const delay = `${0.3 + Math.random() * 2.5}s`;
        const duration = `${2 + Math.random() * 2.5}s`;
        const chars = Array.from({ length: 18 }, () =>
          String.fromCharCode(0x30A0 + Math.random() * 96)
        ).join('');

        return { xPercent, delay, duration, i, chars };
      }),
    []
  );

  return (
    <section className={`${styles.detroitCodeCity} ${isVisible ? styles.visible : ''}`} ref={sectionRef}>
      <div className="scene-container">

        {/* Matrix Rain Overlay (positioned over right third) */}
        <div className="matrix-rain-container">
          {matrixColumns.map((col) => (
            <div
              key={col.i}
              className="matrix-column"
              style={{
                left: `${col.xPercent}%`,
                animationDelay: col.delay,
                animationDuration: col.duration,
              }}
            >
              {col.chars}
            </div>
          ))}
        </div>

        <svg viewBox="0 0 1200 400" className="scene-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="detroit-transition" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="var(--color-primary)" stopOpacity="0.08" />
              <stop offset="60%" stopColor="var(--color-primary)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id="factory-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4a4a4a" />
              <stop offset="100%" stopColor="#2c2c2c" />
            </linearGradient>
            <filter id="detroit-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="screen-glow">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <clipPath id="city-clip">
              <rect x="700" y="0" width="500" height="400" />
            </clipPath>
          </defs>

          {/* Ground line */}
          <line x1="0" y1="350" x2="1200" y2="350" stroke="#333" strokeWidth="1" opacity="0.3" />

          {/* ═══════ LEFT THIRD: Industrial Assembly Line ═══════ */}
          <g className="era-industrial">
            {/* Factory buildings */}
            <path d="M 0 350 L 0 170 L 40 170 L 40 200 L 80 200 L 80 160 L 120 160 L 120 200 L 160 200 L 160 350 Z"
              fill="url(#factory-gradient)" opacity="0.5" />
            <path d="M 100 350 L 100 190 L 160 190 L 160 150 L 200 150 L 200 190 L 280 190 L 280 350 Z"
              fill="#4a4a4a" />
            {/* Factory windows (lit) */}
            <g opacity="0.6">
              <rect x="115" y="210" width="8" height="10" fill="#c45e2c" rx="1" />
              <rect x="135" y="210" width="8" height="10" fill="#c45e2c" rx="1" />
              <rect x="115" y="240" width="8" height="10" fill="#b35520" rx="1" />
              <rect x="135" y="240" width="8" height="10" fill="#b35520" rx="1" />
              <rect x="210" y="210" width="12" height="8" fill="#c45e2c" rx="1" />
              <rect x="240" y="210" width="12" height="8" fill="#b35520" rx="1" />
              <rect x="210" y="240" width="12" height="8" fill="#c45e2c" rx="1" />
              <rect x="240" y="240" width="12" height="8" fill="#b35520" rx="1" />
            </g>

            {/* Smokestacks */}
            <rect x="65" y="90" width="18" height="110" fill="#3a3a3a" rx="2" />
            <rect x="200" y="70" width="22" height="120" fill="#3a3a3a" rx="2" />

            {/* Smoke particles */}
            <g className="smoke-group">
              <circle cx="74" cy="82" r="8" className="smoke p1" fill="#6b6b6b" opacity="0.5" />
              <circle cx="70" cy="60" r="12" className="smoke p2" fill="#5a5a5a" opacity="0.35" />
              <circle cx="78" cy="35" r="16" className="smoke p3" fill="#4a4a4a" opacity="0.2" />
              <circle cx="211" cy="62" r="10" className="smoke p1 delay-1" fill="#6b6b6b" opacity="0.5" />
              <circle cx="207" cy="35" r="14" className="smoke p2 delay-2" fill="#5a5a5a" opacity="0.35" />
              <circle cx="215" cy="10" r="18" className="smoke p3 delay-3" fill="#4a4a4a" opacity="0.2" />
            </g>

            {/* Interlocking gears */}
            <g className="gears" transform="translate(310, 290)">
              <g className="gear-rotate">
                <circle cx="0" cy="0" r="32" fill="#5a5a5a" stroke="#444" strokeWidth="2"/>
                <circle cx="0" cy="0" r="12" fill="#333" />
                {Array.from({ length: 10 }).map((_, i) => (
                  <rect key={i} x="-4" y="-37" width="8" height="10" rx="1" fill="#5a5a5a" transform={`rotate(${i * 36})`} />
                ))}
              </g>
            </g>
            <g className="gears" transform="translate(365, 310)">
              <g className="gear-rotate-reverse">
                <circle cx="0" cy="0" r="22" fill="#c45e2c" stroke="#444" strokeWidth="2"/>
                <circle cx="0" cy="0" r="8" fill="#333" />
                {Array.from({ length: 7 }).map((_, i) => (
                  <rect key={i} x="-3" y="-26" width="6" height="8" rx="1" fill="#c45e2c" transform={`rotate(${i * 51.4})`} />
                ))}
              </g>
            </g>

            {/* Conveyor belt */}
            <line x1="0" y1="335" x2="400" y2="335" stroke="#555" strokeWidth="6" strokeLinecap="round" />
            {/* Rollers */}
            <g opacity="0.4">
              {Array.from({ length: 8 }).map((_, i) => (
                <circle key={i} cx={50 * i + 25} cy="338" r="4" fill="#666" stroke="#444" strokeWidth="1" />
              ))}
            </g>

            {/* Car chassis on conveyor */}
            <g className="conveyor-items">
              <g className="chassis c1">
                <path d="M 20 331 L 32 318 L 65 318 L 75 331 Z" fill="#c45e2c" opacity="0.8" />
                <circle cx="35" cy="331" r="4" fill="#333" />
                <circle cx="65" cy="331" r="4" fill="#333" />
              </g>
              <g className="chassis c2">
                <path d="M 140 331 L 152 318 L 185 318 L 195 331 Z" fill="#6b6b6b" opacity="0.8" />
                <circle cx="155" cy="331" r="4" fill="#333" />
                <circle cx="185" cy="331" r="4" fill="#333" />
              </g>
              <g className="chassis c3">
                <path d="M 260 331 L 272 318 L 305 318 L 315 331 Z" fill="#8a7050" opacity="0.8" />
                <circle cx="275" cy="331" r="4" fill="#333" />
                <circle cx="305" cy="331" r="4" fill="#333" />
              </g>
            </g>
          </g>

          {/* ═══════ CENTER: Transformation Zone ═══════ */}
          <g className="era-transformation">
            <rect x="380" y="0" width="340" height="400" fill="url(#detroit-transition)" />

            {/* Welding sparks at boundary */}
            <g className="sparks">
              <circle cx="400" cy="335" r="2.5" className="spark s1" fill="#ffeb3b" filter="url(#detroit-glow)" />
              <circle cx="420" cy="310" r="3" className="spark s2" fill="var(--color-primary)" filter="url(#detroit-glow)" />
              <circle cx="410" cy="345" r="2" className="spark s3" fill="#fff" filter="url(#detroit-glow)" />
              <circle cx="435" cy="290" r="2.5" className="spark s4" fill="var(--color-primary)" filter="url(#detroit-glow)" />
              <circle cx="395" cy="320" r="1.5" className="spark s5" fill="#ffeb3b" filter="url(#detroit-glow)" />
            </g>

            {/* Circuit board traces emerging from conveyor */}
            <path d="M 400 335 L 480 335 L 520 300 L 600 300 L 650 260 L 700 260"
              className="circuit-path p1" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="700" cy="260" r="5" fill="var(--color-primary)" className="node n1" />

            <path d="M 420 335 L 500 380 L 600 380 L 700 350"
              className="circuit-path p2" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="700" cy="350" r="4" fill="var(--color-primary)" className="node n2" />

            {/* Branch traces */}
            <path d="M 550 300 L 570 270 L 620 270"
              className="circuit-path p3" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />

            {/* Binary digits streaming upward */}
            <g className="binary-rise" fontFamily="monospace" fontSize="11" fontWeight="bold">
              <text x="460" y="370" className="bin b1" fill="var(--color-primary)">01</text>
              <text x="500" y="340" className="bin b2" fill="var(--color-primary)">10</text>
              <text x="540" y="310" className="bin b3" fill="var(--color-primary)">11</text>
              <text x="580" y="355" className="bin b4" fill="var(--color-primary)">01</text>
              <text x="620" y="280" className="bin b5" fill="var(--color-primary)">10</text>
            </g>
          </g>

          {/* ═══════ RIGHT THIRD: Detroit Built by Code ═══════ */}
          <g className="era-digital" clipPath="url(#city-clip)">

            {/* Michigan / Detroit region map outline (stylized) */}
            <g className="michigan-map" opacity="0.08">
              <path d="M 750 50 Q 800 30, 850 45 L 900 40 Q 950 55, 970 90 L 980 140 Q 970 180, 940 200
                L 920 250 Q 900 280, 870 300 L 840 320 Q 810 340, 780 345 L 750 340 Q 730 320, 720 290
                L 710 240 Q 710 190, 720 150 L 730 110 Q 740 75, 750 50 Z"
                fill="var(--color-primary)" stroke="var(--color-primary)" strokeWidth="1" />
              {/* Detroit dot on map */}
              <circle cx="870" cy="280" r="8" fill="var(--color-primary)" opacity="0.5" />
            </g>

            {/* City skyline emerging from code */}
            <g className="city-reveal">
              {/* Modern glass buildings */}
              <g>
                {/* Tall center tower (like Ren Cen) */}
                <path d="M 850 350 L 850 120 L 860 100 L 870 80 L 880 100 L 890 120 L 890 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1.5" opacity="0.9" />
                {/* Left tower */}
                <path d="M 770 350 L 770 180 L 810 160 L 810 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.8" />
                {/* Short wide building */}
                <path d="M 720 350 L 720 240 L 760 240 L 760 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.7" />
                {/* Right tall building */}
                <path d="M 920 350 L 920 150 L 940 130 L 960 150 L 960 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.85" />
                {/* Far right building */}
                <path d="M 980 350 L 980 190 L 1030 190 L 1030 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.75" />
                {/* Additional skyline */}
                <path d="M 1050 350 L 1050 220 L 1090 200 L 1090 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.7" />
                <path d="M 1100 350 L 1100 250 L 1150 250 L 1150 350 Z"
                  fill="var(--color-surface-elevated)" stroke="var(--color-primary)" strokeWidth="1" opacity="0.6" />
              </g>

              {/* Glowing windows */}
              <g className="windows">
                <rect x="860" y="140" width="8" height="12" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="860" y="180" width="8" height="12" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="860" y="220" width="8" height="12" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="872" y="160" width="8" height="12" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="872" y="200" width="8" height="12" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="780" y="200" width="10" height="8" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="780" y="240" width="10" height="8" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="930" y="180" width="10" height="10" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="930" y="220" width="10" height="10" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="930" y="260" width="10" height="10" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="995" y="210" width="12" height="8" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
                <rect x="995" y="250" width="12" height="8" fill="var(--color-primary)" filter="url(#screen-glow)" rx="1" />
              </g>

              {/* Circuit traces emanating from city center */}
              <g className="city-circuits" stroke="var(--color-primary)" strokeWidth="1.5" fill="none" opacity="0.4">
                <path d="M 870 350 L 870 370 L 800 390" />
                <path d="M 870 350 L 920 380 L 1000 385" />
                <path d="M 870 350 L 870 380 L 750 395" />
                <circle cx="800" cy="390" r="3" fill="var(--color-primary)" />
                <circle cx="1000" cy="385" r="3" fill="var(--color-primary)" />
                <circle cx="750" cy="395" r="3" fill="var(--color-primary)" />
              </g>
            </g>

            {/* Floating code symbols */}
            <g className="floating-code" fill="var(--color-primary)" opacity="0.7" fontSize="16" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
              <text x="740" y="130" className="fcode f1">{'{ }'}</text>
              <text x="900" y="90" className="fcode f2">{'< />'}</text>
              <text x="980" y="140" className="fcode f3">$ _</text>
              <text x="1060" y="100" className="fcode f4">git push</text>
              <text x="1100" y="170" className="fcode f5">npm run build</text>
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
};
