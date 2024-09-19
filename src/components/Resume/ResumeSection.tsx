import { FC } from 'react';
import { ResumeSectionProps } from '../../types/resume';

export const ResumeSection: FC<ResumeSectionProps> = ({ iconClass, title, children }) => (
  <div className="resume-section">
    <div className="resume-heading">
      <i className={iconClass} aria-hidden="true"></i>
      <h2>{title}</h2>
    </div>
    {children}
    <hr />
  </div>
);
