import { FC, useState } from 'react';
import { Cell, Grid } from '../Grid';
import { CurrentProject } from '../Projects/CurrentProject';
import { Tab, Tabs } from '../Tabs';

const projectNames = [
  'Shumunov Solutions',
  'Nexient',
  'Olive AI',
  'Progressive Solutions',
  'LoveBook',
  'Personal Projects',
  'JS30',
  'Games',
  'GTB',
];

export const Projects: FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="projects-page">
      <Tabs extraClass="projects-tabs" activeTab={activeTab}>
        {projectNames.map((name, index) => {
          return (
            <Tab key={index} updateActiveTab={() => setActiveTab(index)}>
              {name}
            </Tab>
          );
        })}
      </Tabs>
      <Grid>
        <Cell columns={'full'}>
          <CurrentProject activeTab={activeTab} />
        </Cell>
      </Grid>
    </div>
  );
};
