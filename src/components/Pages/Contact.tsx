import { FC } from 'react';
import { contactText } from '../../data/portfolioStrings';
import { CaptionedImage } from '../CaptionedImage/CaptionedImage';
import { Cell, Grid } from '../Grid';
import { IndentedParagraph } from '../IndentedParagraph';
import { List, ListItem, ListItemContent } from '../List';

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

export const Contact: FC = () => {
  return (
    <div className="contact-body">
      <Grid extraClass="contact-grid">
        <Cell columns={'half'}>
          <CaptionedImage
            src="./img/jbp_shug.jpg"
            alt="Shugmi Shumunov with Jordan Peterson"
            caption="With author, clinical psychologist, lecturer, & professor Jordan B. Peterson"
            link="https://www.jordanbpeterson.com"
            className="jbp-image"
          />
          <h3>Shugmi Shumunov</h3>
          <h6>Telling stories through code</h6>
          <IndentedParagraph text={contactText} />
        </Cell>
        <Cell columns={'half'}>
          <h3 className="centered">Contact Info</h3>
          <hr />
          {/* TODO: Make into a subcomponent */}
          <div className="contact-list">
            <List>
              {contactInfo.map((info, index) => (
                <ListItem key={index}>
                  <ListItemContent>
                    {info.link ? (
                      <a
                        className={info.className}
                        href={info.link}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <i className={info.icon} aria-hidden="true"></i>
                        {info.text}
                      </a>
                    ) : (
                      <>
                        <i className={info.icon} aria-hidden="true" />
                        {info.text}
                      </>
                    )}
                  </ListItemContent>
                </ListItem>
              ))}
            </List>
          </div>
        </Cell>
      </Grid>
    </div>
  );
};
