import { EducationInterface } from '../types/education';
import { ExperienceInterface } from '../types/experience';

export const educationHistory: EducationInterface[] = [
  {
    startMonth: 'August',
    startYear: 2021,
    endMonth: 'February',
    endYear: 2022,
    schoolName: 'Grand Circus Detroit',
    degreeName: 'Data Engineering Bootcamp',
  },
  {
    startMonth: 'July',
    startYear: 2016,
    endMonth: 'September',
    endYear: 2016,
    schoolName: 'Grand Circus Detroit',
    degreeName: 'Front End Development Bootcamp',
  },
  {
    startMonth: 'July',
    startYear: 2008,
    endMonth: 'May',
    endYear: 2013,
    schoolName: 'Wayne State University',
    degreeName: 'Bachelors of Science in Biological Sciences',
    majorName: 'Honors Biological Sciences',
  },
  {
    startMonth: 'July',
    startYear: 2008,
    endMonth: 'May',
    endYear: 2013,
    schoolName: 'Wayne State University',
    degreeName: 'Bachelors of Arts in Slavic Studies',
    majorName: 'Honors Slavic Studies',
  },
];

export const techExperience: ExperienceInterface[] = [
  {
    startMonth: 'October',
    startYear: 2019,
    endMonth: 'Present',
    jobName: 'Shumunov Solutions',
    jobPosition: 'Owner / Developer',
    jobDescription:
      'Empowering local businesses in Southeast Michigan and across the globe with custom software solutions',
    jobResponsibilities: [
      'Web Dev - JK Unlimited Services, Papergoods Warehouse, RegenHealthGlorbal, C Spire Passport',
      'Mobile App Developer - Serendip, BoozApp, YourCheck,',
      'System design and architecture',
      'Product & project management',
    ],
  },
  {
    jobName: 'Olive',
    jobPosition: 'Software Engineer',
    jobDescription: null,
    jobResponsibilities: [
      'Automated healthcare billing process at Yale New Haven Hospital',
      'Wrote Python, FastAPI routes using Pydantic and created a basic frontend that enabled the AppliedML team to interact with their LLMs and visualize their output',
    ],
  },
  {
    startMonth: 'June',
    startYear: 2021,
    endMonth: 'April',
    endYear: 2023,
    jobName: 'Nexient / NTT Data (Acquisition)',
    jobPosition: 'Senior Software Engineer',
    jobDescription: null,
    jobResponsibilities: [
      "Levi's Mobile App - Implemented third party payment integrations (Afterpay, Apple Pay, & Google Pay), Reengineered user onboarding & product return flows to be API driven solutions, Led upskilling initiatives",
      'VectorForm - UI developer for a greenfield 3D configurator for integration in a Shopify store',
      'Built the foundation for a proof of concept project management tool (React, TypeScript, NodeJS)',
    ],
  },
  {
    startMonth: 'February',
    startYear: 2019,
    endMonth: 'June',
    endYear: 2020,
    jobName: 'Progressive Solutions / LoveBook Online / Neuron Publishing',
    jobPosition: 'Consultant / Developer',
    jobDescription: null,
    jobResponsibilities: [
      'Develop and maintained <a class="bold-text" href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">StationeryHQ</a> and <a class="bold-text" href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">FreckleBox</a> Shopify stores using <span class="bold-text">jQuery</span>, <span class="bold-text">SCSS</span>, & <span class="bold-text">Liquid</span>. Update themes, build and update features, and resolve bugs',
      'Built a custom <span class="bold-text">JavaScript</span> video recorder for FreckleBox',
      'Maintained codebases via version control <span class="bold-text">Git</span>, <span class="bold-text">Github</span>, <span>Mercurial</span>, <span>BitBucket</span>, and <span class="bold-text">Shopify ThemeKit</span>',
      'Provided development and project management consulting to ensure tasks were completed in a timely manner via <span class="bold-text">Monday</span>, <span class="bold-text">BaseCamp</span>, <span class="bold-text">Slack</span>',
      'Liaison between tech, graphics, and marketing teams located in San Jose, CA and Detroit, MI',
      'Reengineered a new responsive customization preview engine for Frecklebox and updated the C# processing engine',
      'Utilized SEO via <span class="bold-text">Google AdWords</span>, <span class="bold-text">Google Analytics</span>, and <span class="bold-text">Facebook Pixel</span> to track marketing spend and impact',
    ],
  },
  {
    startMonth: 'December',
    startYear: 2016,
    endMonth: 'March',
    endYear: 2018,
    jobName: 'LoveBook Online',
    jobPosition: 'Full Stack Developer',
    jobDescription:
      'Developer responsible for building in house back-end GUI systems and transforming PSDs concepts to reality',
    jobResponsibilities: [
      'UI developer for <a class="bold-text" href="https://lovecoups.com" rel="noopener noreferrer" target="_blank">LoveCoups</a>. Added new features using <span class="bold-text">jQuery</span>, built pixel perfect designs utilizing PSDs, used <span class="bold-text">php</span> to display dynamic content, and wrote queries using <span class="bold-text">mySQL</span>',
      'Built a GUI for LoveCoups and Frecklebox that allows graphics team to update and create new products',
      'Created two backend GUIs for <a class="bold-text" href="https://www.lovebookonline.com" rel="noopener noreferrer" target="_blank">LoveBookOnline</a> that allows graphics team members to easily update book pages and book covers for products',
      'Redevelop <a class="bold-text" href="https://www.mylovebook.com" rel="noopener noreferrer" target="_blank">MyLoveBook</a>, which served as a redirect page for LoveBookOnline and LoveCoups',
    ],
  },
  {
    startMonth: 'September',
    startYear: 2016,
    endMonth: 'December',
    endYear: 2016,
    jobName: 'GTB (Previously Team Detroit)',
    jobPosition: 'Web Developer',
    jobDescription:
      'Web developer on GTB’s diversified accounts team responsible for redesigning 12 websites for Johnson Controls subsidiaries',
    jobResponsibilities: [
      'Develop websites and AMP pages with <span class="bold-text">HTML</span>, <span class="bold-text">jQuery</span>, <span class="bold-text">SASS</span>, <span class="bold-text">php</span>, and <span class="bold-text">SVN</span>',
      'Update content of websites using <span class="bold-text">Concrete5</span> CMS',
      'Troubleshoot issues and resolve bugs using <span class="bold-text">JIRA</span>',
    ],
  },
];
