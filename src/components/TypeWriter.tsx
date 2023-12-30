import { FC, useState, useEffect } from 'react';

type TypewriterProps = {
  textToType: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
}

export const Typewriter: FC<TypewriterProps> = ({
  textToType,
  typingSpeed = 100,
  deletingSpeed = 50
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [text, setText] = useState('');
  const [typingSpeedState, setTypingSpeedState] = useState(typingSpeed);

  useEffect(() => {
    const handleTyping = () => {
      const i = loopNum % textToType.length;
      const fullText = textToType[i];

      setText(
        isDeleting
          ? fullText.substring(0, text.length - 1)
          : fullText.substring(0, text.length + 1)
      );

      setTypingSpeedState(isDeleting ? deletingSpeed : typingSpeed);

      if (!isDeleting && text === fullText) {
        setTimeout(() => setIsDeleting(true), 500);
      } else if (isDeleting && text === '') {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
      }
    };

    const timer = setTimeout(handleTyping, typingSpeedState);
    return () => clearTimeout(timer);
  }, [text, isDeleting, typingSpeedState]);

  return (
    <span>&nbsp;{text}&nbsp;</span>
  );
};
