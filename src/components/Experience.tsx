import { FC } from 'react';
import { ExperienceInterface } from '../types/experience';
import { Cell, Grid } from './Grid';
import { List, ListItem } from './List';

export const Experience: FC<ExperienceInterface> = ({
  jobDescription,
  jobResponsibilities,
  jobName,
  jobPosition,
  startMonth,
  startYear,
  endMonth,
  endYear,
}) => {
  const jobResponsibilitiesList = jobResponsibilities.map(function (jobResponsibility, index) {
    return (
      <ListItem
        extraClass="job-responsibility"
        jobResponsibility={jobResponsibility}
        key={index}
      ></ListItem>
    );
  });

  // TODO: Consider updating the data structure for these
  // Consider displaying skills and tech used in a different manner
  return (
    <Grid extraClass="experience-container">
      <Cell columns={'full'}>
        <h3>{jobName}</h3>
        <h4>{jobPosition}</h4>
        <span className={`date-of-employment ${startMonth === null ? 'hidden' : ''}`}>
          {startMonth} {startYear} ➔ {endMonth} {endYear}
        </span>
        <p>{jobDescription}</p>
        <List extraClass="job-responsibilities-list">{jobResponsibilitiesList}</List>
      </Cell>
    </Grid>
  );
};
