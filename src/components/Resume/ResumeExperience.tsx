import { FC } from 'react';
import { Experience } from '../Experience';

import { techExperience } from '../../data/resumeData';

export const ResumeExperience: FC = () => (
  <>
    {techExperience.map((experience, index) => (
      <Experience key={index} {...experience} />
    ))}
  </>
);
