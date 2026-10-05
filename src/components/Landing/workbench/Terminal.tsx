import { FC, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import styles from '../Workbench.module.css';

export type Line = { id: number; kind: 'in' | 'out' | 'err'; text: string };

type Props = {
  lines: Line[];
  history: string[];
  commands: string[];
  targets: string[];
  // commands whose argument completes against targets
  targetCommands: string[];
  onRun: (raw: string) => void;
};

export const Terminal: FC<Props> = ({ lines, history, commands, targets, targetCommands, onRun }) => {
  const [input, setInput] = useState('');
  const cursor = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lines]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    cursor.current = -1;
    onRun(input);
    setInput('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const max = history.length - 1;
      cursor.current = Math.max(-1, Math.min(max, cursor.current + (e.key === 'ArrowUp' ? 1 : -1)));
      setInput(cursor.current === -1 ? '' : history[cursor.current]);
    }
    if (e.key === 'Tab' && input.trim()) {
      const [cmd, partial] = input.split(/\s+/);
      const completingArg = partial !== undefined;
      if (completingArg && !targetCommands.includes(cmd.toLowerCase())) return;
      const pool = completingArg ? targets : commands;
      const word = (completingArg ? partial : cmd).toLowerCase();
      const match = pool.find((c) => c.startsWith(word));
      if (match) {
        e.preventDefault();
        setInput(completingArg ? `${cmd} ${match}` : `${match} `);
      }
    }
  };

  return (
    <div className={styles.terminal} onClick={() => inputRef.current?.focus()}>
      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-label="Workbench output">
        {lines.map((l) => (
          <p key={l.id} className={styles[l.kind]}>
            {l.kind === 'in' ? '> ' : ''}
            {l.text}
          </p>
        ))}
      </div>
      <form className={styles.prompt} onSubmit={onSubmit}>
        <label htmlFor="workbench-input" className={styles.promptLabel}>
          shug@detroit:~$
        </label>
        <input
          ref={inputRef}
          id="workbench-input"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="workbench-hint"
        />
      </form>
      <p id="workbench-hint" className={styles.hint}>
        Enter to run. Up and down for history. Tab to complete. Try lineup.
      </p>
    </div>
  );
};
