import { FC } from 'react';
import { approachText } from '../../data/portfolioStrings';
import { techIcons } from '../../data/techIcons';
import { IndentedParagraph } from '../IndentedParagraph';
import { Skills } from '../Skills';

export const ResumeSkills: FC = () => (
  <>
    <IndentedParagraph text={approachText} />
    <div className="skills-container">
      <div className="tech-icon-container">
        {techIcons.map(({ iconName, iconURL, nameInLogo, progress }, index) => (
          <Skills
            key={`${iconName}-${index}`}
            iconName={iconName}
            iconURL={iconURL}
            index={index}
            nameInLogo={nameInLogo}
            progress={progress}
          />
        ))}
      </div>
    </div>
  </>
);
