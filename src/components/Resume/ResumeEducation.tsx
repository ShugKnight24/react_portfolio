import { FC } from 'react';
import { educationHistory } from '../../data/resumeData';
import { Education } from '../Education';

export const ResumeEducation: FC = () => (
  <>
    {educationHistory.map((edu, index) => (
      <Education key={index} {...edu} />
    ))}
  </>
);
