import { FC } from 'react';
import { Cell, Grid } from '../Grid';
import { List, ListItem, ListItemContent } from '../List';

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
					<p className="tab">
						Whether you&apos;re exploring new opportunities in the expanding digital marketplace or your development needs have fallen short, I step in to provide insights and deliver a creative solutions that bridge the gap between concept and reality.
					</p>
					<p className="tab">
						I provide consulting, development, development mentorship, management, and project management services.
					</p>
					<p className="tab">
						I pride myself on providing honest, insightful, and thoughtful guidance to my clients
					</p>
					<p className="tab">
						Reach out if you&apos;d like to work with me.
					</p>
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
