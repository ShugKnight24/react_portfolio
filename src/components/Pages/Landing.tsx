import { FC } from 'react';
import { Cell, Grid } from '../Grid';

import { DigitalRain } from '../DigitalRain';
import { Feed } from '../Feed';

import { createBannerText, createFeatureText } from './pageUtils';

export const Landing: FC = () => {
  return (
    <div className="landing-container">
      <Grid extraClass="landing-grid">
        <Cell columns={'full'}>
          <div className="home-feature">
            {createFeatureText()}
            <img
              src="./img/shug_lake.jpeg"
              alt="Shugmi Shumunov Relaxing by the water"
              className="splash-img"
            />
          </div>
          <div className="digital-rain-container">
            <DigitalRain />
          </div>
          <Feed truncate={3} />
          {createBannerText()}
        </Cell>
      </Grid>
    </div>
  );
};
