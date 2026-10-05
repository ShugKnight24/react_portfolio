import { FC, useEffect, useState, useSyncExternalStore } from 'react';
import { TypewriterInterface } from '../types/typewriter';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (onChange: () => void) => {
  const mql = window.matchMedia(reducedMotionQuery);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;

export const Typewriter: FC<TypewriterInterface> = ({
  textToType,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseMs = 1800,
}) => {
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const [loopNum, setLoopNum] = useState(0);
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fullText = textToType[loopNum % textToType.length] ?? '';

  useEffect(() => {
    if (reduceMotion) {
      const timer = setTimeout(() => setLoopNum((n) => n + 1), pauseMs * 2);
      return () => clearTimeout(timer);
    }

    const doneTyping = !isDeleting && text === fullText;
    const doneDeleting = isDeleting && text === '';
    const delay = doneTyping ? pauseMs : isDeleting ? deletingSpeed : typingSpeed;

    const timer = setTimeout(() => {
      if (doneTyping) return setIsDeleting(true);
      if (doneDeleting) {
        setIsDeleting(false);
        setLoopNum((n) => n + 1);
        return;
      }
      setText(fullText.substring(0, text.length + (isDeleting ? -1 : 1)));
    }, delay);
    return () => clearTimeout(timer);
  }, [text, isDeleting, fullText, reduceMotion, pauseMs, typingSpeed, deletingSpeed]);

  return (
    <span className="typewriter">
      <span className="sr-only">{textToType[0]}</span>
      <span aria-hidden="true">
        {reduceMotion ? fullText : text}
        <span className="typewriter-caret" />
      </span>
    </span>
  );
};
