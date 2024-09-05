import { FC } from 'react';
import { aboutText } from '../../data/portfolioStrings';
import { CaptionedImage } from '../CaptionedImage/CaptionedImage';
import { Cell, Grid } from '../Grid';
import { IndentedParagraph } from '../IndentedParagraph';

export const About: FC = () => {
  return (
    <div className="about-page">
      <Grid>
        <Cell columns={'half'}>
          <CaptionedImage
            src="./img/shug_bpak.jpg"
            alt="With Bodybuilder Ben Pakulski"
            caption="With bodybuilder Ben Pakulski"
            link="https://www.benpakulski.com"
            className="bpak-image"
          />
        </Cell>
        <Cell columns={'half'}>
          <h3>About Me</h3>

          <IndentedParagraph text={aboutText} />

          <img className="luna" src="./img/gallery/luna.JPG" alt="Luna is the best doggo" />
        </Cell>
      </Grid>
    </div>
  );
};
