import { FC } from 'react';
import { Cell, Grid } from '../Grid';

import { Education } from '../Education';
import { Experience } from '../Experience';
import { techIcons } from '../../data/techIcons';
import { Skills } from '../Skills';
import { IndentedParagraph } from '../IndentedParagraph';

export const ResumePage : FC = () =>{
	return (
		<div className="resume-page">
			<Grid>
				<Cell 
					columns={ 'third' }
					extraClass="resume-left-column"
				>
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
					<p>SShumunov @ Google&apos;s email</p>
					<hr />
				</Cell>
				<Cell 
					columns={ 'two-thirds' }
					extraClass="resume-right-column"
				>
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
						startMonth={ null }
						startYear={ null }
						endMonth={ null }
						endYear={ null }
						jobName={ 'Olive' }
						jobPosition={ 'Software Engineer' }
						jobDescription={ null }
						jobResponsibilities={
							[
								`Healthcare Automations`,
								`AppliedML Team`,
								`Olive Analytics Suite`
							]
						}
					/>

					<hr />

					<Experience
						startMonth={ null }
						startYear={ null }
						endMonth={ null }
						endYear={ null }
						jobName={ 'Nexient' }
						jobPosition={ 'Senior Software Engineer' }
						jobDescription={ null }
						jobResponsibilities={
							[
								`Levis Mobile App`,
							]
						}
					/>

					<hr />

					<Experience
						startMonth={ 'February' }
						startYear={ 2021 }
						endMonth={ 'April' }
						endYear={ 2021 }
						jobName={ 'BoozApp' }
						jobPosition={ 'Consultant / Developer' }
						jobDescription={ null }
						jobResponsibilities={
							[
								`Built My Bar Feature`,
								`Refactored UI`,
								`Refactored project architecture. Seperation of concerns, implemented service layer, and updated API calls`
							]
						}
					/>

					<hr />

					<Experience
						startMonth={ 'February' }
						startYear={ 2021 }
						endMonth={ 'March' }
						endYear={ 2021 }
						jobName={ 'YourCheck' }
						jobPosition={ 'Consultant / Developer' }
						jobDescription={ null }
						jobResponsibilities={
							[
								`Refactored YourCheck's React Native App's UI`
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

					<IndentedParagraph
						text={[
							`I embody the spirit of a lifelong learner, dedicated to mastering my craft and evolving into the best developer possible. 
							Embracing the challenge of acquiring new languages and skills is not just a pursuit; it's a passion that continually broadens my knowledge and enhances my capabilities. 
							This commitment enables me to approach and solve problems with a nuanced perspective. The journey of learning reveals the more knowledge I acquire, the more I recognize there is still so much to explore, understand, and master.`
						]}
					/>

					<div className="skills-container">
						<div className="tech-icon-container">
							{techIcons.map(({
								iconName,
								iconURL,
								nameInLogo,
								progress
							}, index) => {
								return(
									<Skills
										key={ `${ iconName }-${ index }` }
										iconName={ iconName }
										iconURL={ iconURL }
										index={ index }
										nameInLogo={nameInLogo}
										progress={ progress }
									/>
								);
							})}
						</div>
						{/* <h3>Languages</h3>

						<h3>Front-End Frameworks & Libraries</h3>

						<h3>Back-End Frameworks & Libraries</h3>

						<h3>Databases</h3>

						<h3>Programming Tools</h3>

						*/}

{/* TODO: Find SVG Icons for these skills */}
					<h3>Design Tools</h3>
						<Skills
							skill={ 'Photoshop' }
							progress={ 45 }
						/>

						<Skills
							skill={ 'Illustrator' }
							progress={ 45 }
						/>

						<Skills
							skill={ 'XD' }
							progress={ 30 }
						/>

						<Skills
							skill={ 'Figma' }
							progress={ 30 }
						/>

						<h3>Project Management Tools</h3>

						<Skills
							skill={ 'Monday' }
							progress={ 75 }
						/>

						<Skills
							skill={ 'Trello' }
							progress={ 60 }
						/>

						<Skills
							skill={ 'Asana' }
							progress={ 45 }
						/>

						<Skills
							skill={ 'Basecamp' }
							progress={ 45 }
						/>

						<h3>Communication Tools</h3>

						<Skills
							skill={ 'Discord' }
							progress={ null }
						/>
						<Skills
							skill={ 'Google Meet' }
							progress={ null }
						/>
						<Skills
							skill={ 'Slack' }
							progress={ null }
						/>
						<Skills
							skill={ 'Zoom' }
							progress={ null }
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
						startMonth={ 'August' }
						startYear={ 2021 }
						endMonth={ 'February' }
						endYear={ 2022 }
						schoolName={ 'Grand Circus Detroit' }
						degreeName={ 'Data Engineering Bootcamp' }
						majorName={ null }
					/>

					<Education
						startMonth={ 'July' }
						startYear={ 2016 }
						endMonth={ 'September' }
						endYear={ 2016 }
						schoolName={ 'Grand Circus Detroit' }
						degreeName={ 'Front End Development Bootcamp' }
						majorName={ null }
					/>

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

				</Cell>
			</Grid>
		</div>
	);
}
