import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

import Education from './Education';
import Experience from './Experience';
import Skills from './Skills';

class Resume extends Component {
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
							startMonth={ 'February' }
							startYear={ 2019 }
							endMonth={ 'Present' }
							endYear={ null }
							jobName={ 'Progressive Solutions' }
							jobPosition={ 'Consultant / Developer' }
							jobDescription={ 'Developer responsible for updating Shopify store themes' }
							jobResponsibilities={
								[
									'Develop and maintain <a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">StationeryHQ</a> and <a href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">FreckleBox</a> Shopify stores using jQuery, SCSS, & Liquid. Update themes, build and update features, and resolve bugs.',
									'Building a JavaScript video recorder for FreckleBox',
									'Working on site and storefront overhaul utilizing XMPie'
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
									'Part of team responsible for redesigning <a href="https://lovecoups.com" rel="noopener noreferrer" target="_blank">LoveCoups</a>. Primarily worked on adding new features with jQuery, building site according to PSD designs using CSS, using php to display dynamic content, and writing queries in mySQL',
									'Built a GUI for LoveCoups and Frecklebox that allows graphics team to update and create new products. Built with jQuery, php, and mySQL',
									'Created two backend GUIs for <a href="https://www.lovebookonline.com" rel="noopener noreferrer" target="_blank">LoveBookOnline</a> that allows graphics team members to easily update book pages and book covers for the website. Built using jQuery, php, and mySQl',
									'Redevelop <a href="https://www.mylovebook.com" rel="noopener noreferrer" target="_blank">MyLoveBook</a>, which serves as a redirect page for both LoveBookOnline.com and LoveCoups.com'
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
									'Develop websites and AMP pages with HTML, jQuery, Sass, php, and SVN',
									'Update content of websites using the Concrete5',
									'Troubleshoot and resolve issues using JIRA'
								]
							}
						/>

						<Experience
							startMonth={ 'September' }
							startYear={ 2016 }
							endMonth={ 'December' }
							endYear={ 2016 }
							jobName={ 'GTB (Formerly Team Detroit)' }
							jobPosition={ 'Technology Intern' }
							jobDescription={ 'Intern on GTB’s diversified accounts team responsible for redesigning 12 websites for Johnson Controls subsidiaries. In addition to our team responsibilities, interns were tasked with shadowing different departments to understand how GTB operated as a whole.' }
							jobResponsibilities={
								[
									'Develop websites using jQuery, Sass, php, and SVN.',
									'Update content of websites using the Concrete5 CMS.',
									'Troubleshoot and resolve issues using JIRA',
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

export default Resume;
