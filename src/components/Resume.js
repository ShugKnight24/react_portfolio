import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

import Education from './Education';
import Experience from './Experience';
import Skills from './Skills';

export default class Resume extends Component {
	render() {
		return(
			<div className="resume-page">
				<Grid>
					<Cell className="resume-left-column" col={ 4 }>
						<img
							className="resume-avatar"
							src="./img/shumunov_avatar.jpg"
							alt="Shugmi Shumunov Avatar"
						/>
						<h2>Shugmi Shumunov</h2>
						<h4>Full Stack Web Developer</h4>
						<hr />
						<p className="programming-quote">
							<span className="italic-text">Programming is all about laziness</span>
							&nbsp;-&nbsp;
							<a href="https://maxogden.com/" rel="noopener noreferrer" target="_blank">Maxwell Ogden</a>
						</p>
						<hr />
						<h5>Email</h5>
						<p>SShumunov @ Google's email</p>
						<hr />
					</Cell>
					<Cell className="resume-right-column" col={ 8 }>
						<div className="resume-heading">
							<span>
								<i className="fa fa-briefcase" aria-hidden="true"></i>
							</span>
							<h2>Experience</h2>
						</div>

						<Experience
							startMonth={ 'October' }
							startYear={ 2019 }
							endMonth={ 'Present' }
							endYear={ null }
							jobName={ 'Shumunov Solutions' }
							jobPosition={ 'Owner / Developer' }
							jobDescription={ 'Providing website development services to businesses in Southeast Michigan and around the globe' }
							jobResponsibilities={
								[
									`Providing web development solutions using HTML, CSS / SASS, JavaScript, & php`,
									`Providing project management / task management services`,
									`Providing devloper management and mentorship services`
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'February' }
							startYear={ 2021 }
							endMonth={ 'Present' }
							endYear={ null }
							jobName={ 'Serendip' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									`Providing React Native consulting and development to startups in the Ann Arbor tech community`,
									`More TBA soon 😁😏`
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'December' }
							startYear={ 2020 }
							endMonth={ 'Present' }
							endYear={ null }
							jobName={ 'JK Unlimited Services' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									`Built <a href="https://www.jkunlimitedservices.com/" rel="noopener noreferrer" target="_blank">JK Unlimited Services</a> website`,
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'July' }
							startYear={ 2020 }
							endMonth={ 'Present' }
							endYear={ null }
							jobName={ 'Paper Goods Warehouse' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									'Built <a href="https://www.papergoodswarehouse.com/" rel="noopener noreferrer" target="_blank">Paper Goods Warehouse</a> website',
								]
							}
						/>


						<hr />

						<Experience
							startMonth={ 'October' }
							startYear={ 2020 }
							endMonth={ 'October' }
							endYear={ 2020 }
							jobName={ 'Link Magnet' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									'Updated design via <span class="bold-text">CSS</span> on a few <span class="bold-text">WordPress</span> pages on <a href="https://freedomforfamilies.com/" rel="noopener noreferrer" target="_blank">Freedom For Families</a> website',
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'February' }
							startYear={ 2020 }
							endMonth={ 'June' }
							endYear={ 2020 }
							jobName={ 'Neuron Publishing' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									'Updated and maintained <a class="bold-text" href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">StationeryHQ</a> and <a class="bold-text" href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">FreckleBox</a>',
									'Maintained codebases via <span class="bold-text">Git, <span class="bold-text">Bitbucket</span>, <span class="bold-text">Github</span>, and <span class="bold-text">Shopify ThemeKit</span>',
									'Provided development and project management consulting to ensure tasks were completed in a timely manner via <span class="bold-text">Monday</span> and <span class="bold-text">Slack</span>',
									'Acted as a liaison between tech, graphics, and marketing teams located in San Jose, CA and Detroit, MI',
									'Built the new responsive customization preview engine for Frecklebox',
									'Monitored installation and accuracy of results from <span class="bold-text">Google AdWords</span>, <span class="bold-text">Google Analytics</span>, and <span class="bold-text">Facebook Marketing</span> accounts'
								]
							}
						/>

						<Experience
							startMonth={ 'December' }
							startYear={ 2019 }
							endMonth={ 'June' }
							endYear={ 2020 }
							jobName={ 'LoveBook Online' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ null }
							jobResponsibilities={
								[
									'Same as above'
								]
							}
						/>

						<Experience
							startMonth={ 'February' }
							startYear={ 2019 }
							endMonth={ 'June' }
							endYear={ 2020 }
							jobName={ 'Progressive Solutions' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ 'Developer responsible for updating Shopify store themes' }
							jobResponsibilities={
								[
									'Develop and maintain <a class="bold-text" href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">StationeryHQ</a> and <a class="bold-text" href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">FreckleBox</a> Shopify stores using <span class="bold-text">jQuery</span>, <span class="bold-text">SCSS</span>, & <span class="bold-text">Liquid</span>. Update themes, build and update features, and resolve bugs',
									'Building a <span class="bold-text">JavaScript</span> video recorder for FreckleBox',
									'Working on site and storefront overhaul utilizing <span class="bold-text">XMPie',
									'Version control systems - <span class="bold-text">GIT</span> via <span class="bold-text">BitBucket</span> for websites and <span class="bold-text">Mercurial</span> for web servers',
									'Use <span class="bold-text">BaseCamp 3</span> for ticketing and issue resolution'
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'December' }
							startYear={ 2016 }
							endMonth={ 'March' }
							endYear={ 2018 }
							jobName={ 'LoveBook Online' }
							jobPosition={ 'Full Stack Developer' }
							jobDescription={ 'Developer responsible for building in house back-end GUI systems and transforming PSDs concepts to reality' }
							jobResponsibilities={
								[
									'Part of team responsible for redesigning <a class="bold-text" href="https://lovecoups.com" rel="noopener noreferrer" target="_blank">LoveCoups</a>. Primarily worked on adding new features with <span class="bold-text">jQuery</span>, building site according to PSD designs using <span class="bold-text">CSS</span>, using <span class="bold-text">php</span> to display dynamic content, and writing queries in <span class="bold-text">mySQL</span>',
									'Built a GUI for LoveCoups and Frecklebox that allows graphics team to update and create new products. Built with <span class="bold-text">jQuery</span>, <span class="bold-text">php</span>, and <span class="bold-text">mySQL</span>',
									'Created two backend GUIs for <a class="bold-text" href="https://www.lovebookonline.com" rel="noopener noreferrer" target="_blank">LoveBookOnline</a> that allows graphics team members to easily update book pages and book covers for the website. Built using <span class="bold-text">jQuery</span>, <span class="bold-text">php</span>, and <span class="bold-text">mySQl</span>',
									'Redevelop <a class="bold-text" href="https://www.mylovebook.com" rel="noopener noreferrer" target="_blank">MyLoveBook</a>, which serves as a redirect page for LoveBookOnline and LoveCoups',
									'Used <span class="bold-text">GIT</span> via <span class="bold-text">GitHub</span> as version control system'
								]
							}
						/>

						<hr />

						<Experience
							startMonth={ 'December' }
							startYear={ 2016 }
							endMonth={ 'December' }
							endYear={ 2016 }
							jobName={ 'GTB (Formerly Team Detroit)' }
							jobPosition={ 'Web Developer' }
							jobDescription={ 'Web developer on GTB’s diversified accounts team responsible for redesigning 12 websites for Johnson Controls subsidiaries' }
							jobResponsibilities={
								[
									'Develop websites and AMP pages with <span class="bold-text">HTML</span>, <span class="bold-text">jQuery</span>, <span class="bold-text">SASS</span>, <span class="bold-text">php</span>, and <span class="bold-text">SVN</span>',
									'Update content of websites using the <span class="bold-text">Concrete5',
									'Troubleshoot and resolve issues using <span class="bold-text">JIRA</span>'
								]
							}
						/>

						<Experience
							startMonth={ 'September' }
							startYear={ 2016 }
							endMonth={ 'December' }
							endYear={ 2016 }
							jobName={ null }
							jobPosition={ 'Technology Intern' }
							jobDescription={ 'Intern on GTB’s diversified accounts team responsible for redesigning 12 websites for Johnson Controls subsidiaries. In addition to our team responsibilities, interns were tasked with shadowing different departments to understand how GTB operated as a whole.' }
							jobResponsibilities={
								[
									'Develop websites using <span class="bold-text">jQuery</span>, <span class="bold-text">SASS</span>, <span class="bold-text">php</span>, and <span class="bold-text">SVN</span>.',
									'Update content of websites using the <span class="bold-text">Concrete5 CMS.',
									'Troubleshoot and resolve issues using <span class="bold-text">JIRA</span>',
									'Redesigned GTB’s community outreach program to entice employees to volunteer with local nonprofits by creating a community fair with other interns'
								]
							}
						/>

						<hr />

						<div className="resume-heading">
							<i className="fa fa-laptop" aria-hidden="true"></i>
							<h2>Skills</h2>
						</div>

						<p className="tab">I consider myself a lifelong learner. Someone who is committed to mastering their craft to become the best developer they can be. I enjoy the challenge of picking up additional languages and skills to expand my knowledge and abilities. It allows me to approach and solve the problems I encounter in a nuanced way. The more I learn, the more I realize I don't know.</p>

						<div className="skills-container">
							<h3>Languages</h3>

							<Skills
								skill={ 'HTML' }
								progress={ 95 }
							/>

							<Skills
								skill={ 'CSS / SASS / LESS' }
								progress={ 85 }
							/>

							<Skills
								skill={ 'JavaScript' }
								progress={ 80 }
							/>

							<Skills
								skill={ 'TypeScript' }
								progress={ 50 }
							/>

							<Skills
								skill={ 'PHP' }
								progress={ 40 }
							/>

							<h3>Front-End Frameworks & Libraries</h3>

							<Skills
								skill={ 'jQuery' }
								progress={ 75 }
							/>

							<Skills
								skill={ 'React' }
								progress={ 60 }
							/>

							<Skills
								skill={ 'React Native' }
								progress={ 50 }
							/>

							<h3>Back-End Frameworks & Libraries</h3>

							<Skills
								skill={ 'Node.js' }
								progress={ 50 }
							/>

							<h3>Databases</h3>

							<Skills
								skill={ 'MySQL' }
								progress={ 40 }
							/>

							<Skills
								skill={ 'MongoDB' }
								progress={ 30 }
							/>

							<h3>Additional Tools</h3>

							<Skills
								skill={ 'GIT / GitHub' }
								progress={ 60 }
							/>

							<Skills
								skill={ 'Shopify' }
								progress={ 80 }
							/>

							<Skills
								skill={ 'Liquid' }
								progress={ 90 }
							/>
						</div>

						<hr />

						<div className="resume-heading">
							<span>
								<i className="fa fa-graduation-cap" aria-hidden="true"></i>
							</span>
							<h2>Education</h2>
						</div>

						<Education
							startMonth={ 'July' }
							startYear={ 2008 }
							endMonth={ 'May' }
							endYear={ 2013 }
							schoolName={ 'Wayne State University' }
							degreeName={ 'Bachelors of Science in Biological Sciences' }
							majorName={ 'Honors Biological Sciences' }
						/>

						<Education
							startMonth={ 'July' }
							startYear={ 2008 }
							endMonth={ 'May' }
							endYear={ 2013 }
							schoolName={ 'Wayne State University' }
							degreeName={ 'Bachelors of Arts in Slavic Studies' }
							majorName={ 'Honors Slavic Studies' }
						/>

						<Education
							startMonth={  'July'  }
							startYear={  2016  }
							endMonth={  'September'  }
							endYear={  2016  }
							schoolName={  'Grand Circus Detroit'  }
							degreeName={  'Front End Development Bootcamp'  }
							majorName={  null  }
						/>

					</Cell>
				</Grid>
			</div>
		);
	}
}
