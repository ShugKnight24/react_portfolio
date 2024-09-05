import React from 'react';
import { techIcons } from '../../data/techIcons';
import { TechIcon } from '../TechIcon';
import { Typewriter } from '../Typewriter';

import { developerQualities, names } from '../../data/portfolioStrings';

// Landing Utils
export const createBannerText = () => (
  <div className="banner-text">
    <h2>Full Stack Software Engineer</h2>
    <hr />
    <h3>
      <Typewriter textToType={developerQualities} typingSpeed={50} deletingSpeed={25} />
    </h3>
    <hr />
    <div>
      <span className="bar">|</span>
      {techIcons.map(({ iconName, iconURL, nameInLogo }, index) => (
        <TechIcon
          key={`${iconName}-${index}`}
          iconName={iconName}
          iconURL={iconURL}
          nameInLogo={nameInLogo}
        />
      ))}
    </div>
    {createSocialLinks()}
  </div>
);

export const createFeatureText = () => (
  <div className="feature-text">
    <h1>
      <Typewriter textToType={names} />
    </h1>
    <div>
      {['Autodidact', 'Builder', 'Consultant', 'Developer', 'Learner', 'Problem Solver'].map(
        (quality, index) => (
          <React.Fragment key={index}>
            <p>{quality}</p>
            {index < 5 && <span className="bar">|</span>}
          </React.Fragment>
        )
      )}
    </div>
  </div>
);

const createSocialLinks = () => (
  <div className="social-links">
    <a href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
      <i className="fab fa-github" aria-hidden="true"></i>
    </a>
    <a href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
      <i className="fab fa-linkedin" aria-hidden="true" />
    </a>
  </div>
);
