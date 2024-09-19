import { FC } from 'react';
import { Cell, Grid } from '../Grid';

import { ResumeEducation } from '../Resume/ResumeEducation';
import { ResumeExperience } from '../Resume/ResumeExperience';
import { ResumeHeader } from '../Resume/ResumeHeader';
import { ResumeSection } from '../Resume/ResumeSection';
import { ResumeSkills } from '../Resume/ResumeSkills';

export const Resume: FC = () => {
  return (
    <div className="resume-page">
      <Grid>
        <Cell columns={'third'} extraClass="resume-left-column">
          <ResumeHeader />
        </Cell>
        <Cell columns={'two-thirds'} extraClass="resume-right-column">
          {/* TODO: Further refactor to automatically build all resume sections */}
          <ResumeSection iconClass="fa fa-briefcase" title="Experience">
            <ResumeExperience />
          </ResumeSection>
          <ResumeSection iconClass="fa fa-laptop" title="Skills">
            <ResumeSkills />
          </ResumeSection>
          <ResumeSection iconClass="fa fa-graduation-cap" title="Education">
            <ResumeEducation />
          </ResumeSection>
        </Cell>
      </Grid>
    </div>
  );
};
