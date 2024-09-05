import { FC } from 'react';
import { List, ListItem, ListItemContent } from '../List';
import { ContactItem } from './ContactItem';

const contactInfo = [
  {
    icon: 'fas fa-envelope-square',
    text: "SShumunov @ Google's email",
  },
  {
    icon: 'fab fa-github-square',
    text: 'GitHub',
    link: 'https://github.com/ShugKnight24',
    className: 'github-icon',
  },
  {
    icon: 'fab fa-linkedin',
    text: 'LinkedIn',
    link: 'https://www.linkedin.com/in/shugmishumunov/',
    className: 'linkedin-icon',
  },
];

export const ContactDetails: FC = () => (
  <div>
    <h3 className="centered">Contact Info</h3>
    <hr />
    <div className="contact-list">
      <List>
        {contactInfo.map((info, index) => (
          <ListItem key={index}>
            <ListItemContent>
              <ContactItem {...info} />
            </ListItemContent>
          </ListItem>
        ))}
      </List>
    </div>
  </div>
);
