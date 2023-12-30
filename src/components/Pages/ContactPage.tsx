import { FC } from 'react';
import { Cell, Grid } from '../Grid';
import { List, ListItem, ListItemContent } from '../List';
import { IndentedParagraph } from '../IndentedParagraph';

export const ContactPage: FC = () => {
	return (
		<div className="contact-body">
			<Grid extraClass="contact-grid">
				<Cell columns={ 'half' }>
					<div className="image-container">
						<figure>
							<img
								className="jbp-image"
								src="./img/jbp_shug.jpg"
								alt="Shugmi Shumunov with Jordan Peterson"
							/>
							<figcaption>
								With author, clinical psychologist, lecturer, & professor <a href="https://www.jordanbpeterson.com/" rel="noopener noreferrer" target="_blank">Jordan B. Peterson</a>
							</figcaption>
						</figure>
					</div>
					<h3>Shugmi Shumunov</h3>
					<h6>
						Telling stories through code
					</h6>
					<IndentedParagraph
						text={[
							`Embark on a journey of innovation and success with my expertise in navigating the dynamic digital landscape. Whether you're venturing into new opportunities or facing development challenges, 
							I'm here to offer invaluable insights and craft creative solutions that seamlessly bridge the gap between concept and reality.`,
							`My comprehensive range of services includes consulting, development, mentorship, management, and project management. 
							With a commitment to honesty, insightfulness, and thoughtful guidance, I take pride in empowering my clients to achieve their goals.`,
							`Ready to turn your visions into tangible results? Let's collaborate! Reach out and let's create something exceptional together.`
						]}
					/>
				</Cell>
				<Cell columns={ 'half' }>
					<h3 className="centered">Contact Info</h3>
					<hr />
					<div className="contact-list">
						<List>
							<ListItem>
								<ListItemContent>
									<i className="fa fa-envelope-square" aria-hidden="true"/>
									SShumunov @ Google&apos;s email
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
								<a className="github-icon" href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
									<i className="fab fa-github-square" aria-hidden="true"></i>GitHub
								</a>
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<a className="linkedin-icon" href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
										<i className="fab fa-linkedin" aria-hidden="true" />LinkedIn
									</a>
								</ListItemContent>
							</ListItem>
						</List>
					</div>
				</Cell>
			</Grid>
		</div>
	);
}
