import { FC } from 'react';
import { contactText } from '../../data/portfolioStrings';
import { CaptionedImage } from '../CaptionedImage/CaptionedImage';
import { IndentedParagraph } from '../IndentedParagraph';

export const ContactHeader: FC = () => (
  <div>
    <CaptionedImage
      src="./img/jbp_shug.jpg"
      alt="With Jordan Peterson"
      caption="With author, clinical psychologist, lecturer, & professor Jordan B. Peterson"
      link="https://www.jordanbpeterson.com"
      className="jbp-image"
    />
    <h3>Shugmi Shumunov</h3>
    <h4>Telling stories through code</h4>
    <IndentedParagraph text={contactText} />
  </div>
);
