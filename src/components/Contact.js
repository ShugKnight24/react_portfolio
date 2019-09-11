import React, { Component } from 'react';
import { Grid, Cell, List, ListItem, ListItemContent } from 'react-mdl';

class Contact extends Component {
	render() {
		return(
			<div className="contact-body">
				<Grid className="contact-grid">
					<Cell col={ 6 }>
						<h2>Shugmi Shumunov</h2>
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
						<p>
							I enjoy telling stories through code.
						</p>
						<p>
							Whether you're exploring new opportunities or if you've found your development needs coming up just a little short, I can step in with insights to deliver a creative solution that will bridge that gap.
						</p>
						<p>
							I provide development, management, and consulting services.
						</p>
						<p>
							I pride myself on providing honest, insightful, and thoughtful guidance to my customers.
						</p>
						<p>
							Feel free to reach out if you'd like to work with me.
						</p>
					</Cell>
					<Cell col={ 6 }>
						<h2>Contact Info</h2>
						<hr />
						<div className="contact-list">
							<List>
								<ListItem>
									<ListItemContent>
										<i className="fa fa-envelope-square" aria-hidden="true"/>
										SShumunov @ Google's email
									</ListItemContent>
								</ListItem>
								<ListItem>
									<ListItemContent>
									<a className="github-icon" href="https://github.com/ShugKnight24" rel="noopener noreferrer" target="_blank">
										<i className="fa fa-github-square" aria-hidden="true" />GitHub
									</a>
									</ListItemContent>
								</ListItem>
								<ListItem>
									<ListItemContent>
										<a className="linkedin-icon" href="https://www.linkedin.com/in/shugmishumunov/" rel="noopener noreferrer" target="_blank">
											<i className="fa fa-linkedin-square" aria-hidden="true" />LinkedIn
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
}

export default Contact;
