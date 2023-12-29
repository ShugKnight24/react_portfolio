import { FC } from 'react';

export const IndentedParagraph: FC<{ text: string[] }> = ({ text }) => (
  <>
    {text.map((paragraph, index) => (
      <p className="tab" key={index}>
        {paragraph}
      </p>
    ))}
  </>
);
