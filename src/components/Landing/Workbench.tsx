import { CSSProperties, FC, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeProvider';
import { NATIVE_THEME } from '../../data/themes';
import { usePauseOffscreen } from '../../utils/usePauseOffscreen';
import {
  Project,
  findProject,
  hrefOf,
  initialLineup,
  isInternal,
  positionOf,
  promote,
  statusOf,
  verbOf,
} from './workbench/lineup';
import { prefersReducedMotion, springEasing } from './workbench/spring';
import { Line, Terminal } from './workbench/Terminal';
import { SLOTS, WorkbenchScene, slotStyle } from './workbench/WorkbenchScene';
import styles from './Workbench.module.css';

const commands = ['help', 'ls', 'lineup', 'open', 'bat', 'play', 'read', 'visit', 'browse', 'theme', 'whoami', 'history', 'clear'];
const targetCommands = ['open', 'bat', 'play', 'read', 'visit', 'browse'];

const helpText = [
  'ls                 list every build by name',
  'lineup             who is at bat, on deck, in the hole',
  'open <name>        open a build (try: open brawler)',
  'bat <name>         send a build to the plate',
  'theme <name>       tint the site (try: dracula, nord, matrix, default)',
  'whoami             a short answer',
  'history            what you have typed',
  'clear              clear the screen',
];

type Rect = { x: number; y: number; w: number; h: number };
type Flight = { key: number; title: string; from: Rect; to: Rect };

// The card that flies from its spot in the lineup to the plate
const Ghost: FC<{ flight: Flight; onDone: () => void }> = ({ flight, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.animate) return onDone();
    const { from, to } = flight;
    // land over the title side of the plate, sized to its height
    const dx = to.x + to.w * 0.3 - (from.x + from.w / 2);
    const dy = to.y + to.h / 2 - (from.y + from.h / 2);
    const s = Math.max(0.6, Math.min(1.4, to.h / from.h));
    const { easing, duration } = springEasing();
    const flightAnim = el.animate(
      [{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
      { duration, easing, fill: 'forwards' }
    );
    const fade = el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], {
      duration,
      easing: 'linear',
      fill: 'forwards',
    });
    fade.onfinish = onDone;
    return () => {
      flightAnim.cancel();
      fade.cancel();
    };
    // flight is keyed, so this runs once per mount
  }, []);

  const { from } = flight;
  return (
    <div
      ref={ref}
      className={styles.ghost}
      style={{ left: from.x, top: from.y, width: from.w, height: from.h }}
      aria-hidden="true"
    >
      <span className={styles.ghostTitle}>{flight.title}</span>
    </div>
  );
};

export const Workbench: FC = () => {
  const navigate = useNavigate();
  const { setTheme, allThemes } = useTheme();
  const [lineup, setLineup] = useState<Project[]>(initialLineup);
  const [lines, setLines] = useState<Line[]>([
    { id: 0, kind: 'out', text: "Type 'help' or 'lineup', or send someone to the plate." },
  ]);
  const [arrivals, setArrivals] = useState(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  const history = useRef<string[]>([]);
  const nextId = useRef(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  usePauseOffscreen(sectionRef);

  const [atBat, onDeck, inHole, ...bench] = lineup;

  const print = (kind: Line['kind'], ...texts: string[]) =>
    setLines((prev) => [...prev, ...texts.map((text) => ({ id: nextId.current++, kind, text }))].slice(-40));

  const open = (p: Project) => {
    print('out', `opening ${p.title}...`);
    if (isInternal(p)) navigate(hrefOf(p));
    else window.open(hrefOf(p), '_blank', 'noopener,noreferrer');
  };

  const sendToBat = (id: string, source?: HTMLElement | null) => {
    const index = lineup.findIndex((p) => p.id === id);
    const picked = lineup[index];
    if (!picked) return;
    if (index === 0) return print('out', `${picked.title} is already at bat`);

    const stage = stageRef.current;
    const plate = plateRef.current;
    const from = source ?? stage?.querySelector<HTMLElement>(`[data-project="${id}"]`);
    if (stage && plate && from && !prefersReducedMotion()) {
      const base = stage.getBoundingClientRect();
      const rel = (r: DOMRect): Rect => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
      const a = from.getBoundingClientRect();
      if (a.width > 0) setFlight({ key: Date.now(), title: picked.title, from: rel(a), to: rel(plate.getBoundingClientRect()) });
    }

    // stacked layout: the plate can be a screen away, so bring it into view
    const top = plate?.getBoundingClientRect().top ?? 0;
    if (plate && (top < 0 || top > window.innerHeight * 0.8))
      plate.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    setLineup((prev) => promote(prev, id));
    setArrivals((n) => n + 1);
    print('out', `now batting: ${picked.title}. ${atBat.title} heads to the bench.`);
  };

  const run = (raw: string) => {
    const [cmd = '', ...args] = raw.trim().toLowerCase().split(/\s+/);
    const arg = args.join(' ');
    if (!cmd) return;
    history.current.unshift(raw.trim());
    print('in', raw.trim());

    if (cmd === 'clear') return setLines([]);
    if (cmd === 'help') return print('out', ...helpText);
    if (cmd === 'ls') return print('out', ...lineup.map((p) => `${p.id.padEnd(10)} ${p.title}, ${statusOf(p)}`));
    if (cmd === 'lineup')
      return print('out', ...lineup.map((p, i) => `${positionOf(i).toLowerCase().padEnd(12)} ${p.title}`));
    if (cmd === 'history')
      return print('out', ...[...history.current].reverse().map((h, i) => `${String(i + 1).padStart(3)}  ${h}`));
    if (cmd === 'whoami')
      return print('out', 'Shugmi Shumunov. Full stack engineer in Detroit. Builds things for fun and for a living.');
    if (cmd === 'theme') {
      const key = arg === 'default' ? NATIVE_THEME : Object.keys(allThemes).find((k) => k === arg);
      if (!key) return print('err', `no theme '${arg}'. try: ${Object.keys(allThemes).slice(0, 6).join(', ')}, default`);
      setTheme(key);
      return print('out', `theme set to ${arg}`);
    }
    if (cmd === 'bat') {
      const p = findProject(lineup, arg);
      return p ? sendToBat(p.id) : print('err', `nobody called '${arg}' in the lineup. try 'ls'`);
    }
    if (targetCommands.includes(cmd)) {
      const p = findProject(lineup, arg);
      return p ? open(p) : print('err', `nothing called '${arg}'. try 'ls'`);
    }
    print('err', `unknown command '${cmd}'. try 'help'`);
  };

  const enter = arrivals > 0 ? styles.enter : undefined;
  const plateDelay = { '--enter-delay': flight ? '260ms' : '0ms' } as CSSProperties;

  const card = (p: Project, index: number, variant: string) => (
    <button
      type="button"
      data-project={p.id}
      className={`${styles.card} ${variant}`}
      onClick={(e) => sendToBat(p.id, e.currentTarget)}
      aria-label={`${p.title}, ${positionOf(index).toLowerCase()}. Send to bat`}
    >
      <span key={p.id} className={`${styles.cardInner} ${enter ?? ''}`}>
        <span className={styles.position}>{positionOf(index)}</span>
        <span className={styles.cardTitle}>{p.title}</span>
        <span className={styles.cardMeta}>{statusOf(p)}</span>
      </span>
    </button>
  );

  return (
    <section ref={sectionRef} className={styles.workbench} aria-labelledby="workbench-title">
      <div className={styles.intro}>
        <h2 id="workbench-title" className={styles.title}>
          On the bench
        </h2>
        <p className={styles.lede}>My current builds, in batting order. Pick one to send it to the plate.</p>
      </div>

      <div className={styles.frame}>
        <div ref={stageRef} className={styles.stage}>
          <WorkbenchScene />

          <div className={styles.monitor} style={slotStyle(SLOTS.monitor)}>
            <div ref={plateRef} className={styles.plate} aria-label="At bat" role="group">
              <div key={atBat.id} className={`${styles.plateInner} ${enter ?? ''}`} style={plateDelay}>
                <p className={styles.position}>
                  <span className={styles.liveDot} aria-hidden="true" />
                  At bat
                </p>
                <p className={styles.plateTitle}>{atBat.title}</p>
                <p className={styles.plateStatus}>{atBat.description}</p>
              </div>
              <button type="button" className={styles.swing} onClick={() => open(atBat)}>
                {verbOf(atBat)} <span className={styles.visuallyHidden}>{atBat.title}</span>
                <span aria-hidden="true">{isInternal(atBat) ? ' →' : ' ↗'}</span>
              </button>
            </div>
            <Terminal
              lines={lines}
              history={history.current}
              commands={commands}
              targets={lineup.map((p) => p.id)}
              targetCommands={targetCommands}
              onRun={run}
            />
          </div>

          {onDeck && (
            <div className={styles.deck} style={slotStyle(SLOTS.deck)}>
              {card(onDeck, 1, styles.deckCard)}
            </div>
          )}

          {inHole && (
            <div className={styles.hole} style={slotStyle(SLOTS.hole)}>
              {card(inHole, 2, styles.holeCard)}
            </div>
          )}

          {bench.length > 0 && (
            <div className={styles.bench} style={slotStyle(SLOTS.bench)}>
              <h3 className={styles.benchTitle} id="workbench-bench">
                The bench
              </h3>
              <ul className={styles.benchList} aria-labelledby="workbench-bench">
                {bench.map((p, i) => (
                  <li key={i}>{card(p, i + 3, styles.benchCard)}</li>
                ))}
              </ul>
            </div>
          )}

          {flight && <Ghost key={flight.key} flight={flight} onDone={() => setFlight(null)} />}
        </div>
      </div>
    </section>
  );
};
