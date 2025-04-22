import { FC } from 'react';
import { About } from './About';
import { Contact } from './Contact';

export const AboutContact: FC = () => {
  return (
    <div className="about-contact-page">
      <About />
      <Contact />
    </div>
  );
};
