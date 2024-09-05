import { FC } from 'react';
import { ContactItemProps } from '../../types/contact';

export const ContactItem: FC<ContactItemProps> = ({ icon, text, link, className }) => (
  <div className="contact-item">
    {link ? (
      <a className={className} href={link} rel="noopener noreferrer" target="_blank">
        <i className={icon} aria-hidden="true"></i>
        {text}
      </a>
    ) : (
      <>
        <i className={icon} aria-hidden="true" />
        {text}
      </>
    )}
  </div>
);
