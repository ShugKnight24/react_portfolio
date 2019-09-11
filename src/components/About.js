import React, { Component } from 'react';
import { Grid, Cell, List, ListItem, ListItemContent } from 'react-mdl';

class About extends Component {
	render() {
		return(
			<div className="about-page">
				<Grid>
					<Cell col={ 6 }>
						<div className="image-container">
							<figure>
								<img
									className="bpak-image"
									src="./img/shug_bpak.jpg"
									alt="Shugmi Shumunov with Bodybuilder Ben Pakulski"
								/>
								<figcaption>
									With bodybuilder <a href="https://www.benpakulski.com" rel="noopener noreferrer" target="_blank">Ben Pakulski</a>
								</figcaption>
							</figure>
						</div>
					</Cell>
					<Cell col={ 6 }>
						<h3>Programming Background</h3>
						<p className="tab">My entry into web development began when I worked as a property manager where I became quick friends with the company’s programmer. He showed me the tremendous impact that learning to program could have by utilizing automation and the rapid advancements being made in technology. I always had a desire to help people improve their own situations and realized that would be possible through programming. My friend’s passion, in conjunction with emerging technologies like VR inspired me to take the jump and enroll in a boot camp at Grand Circus Detroit and learn these skills for myself.</p>

						<p className="tab">At Grand Circus, I completed the Front-End bootcamp, where I learned the skills needed to be a web developer. I cannot speak more highly of my time at Grand Circus. It was a great experience that taught me the fundamentals of web development. The bootcamp also provided the proper environment with the right support staff to make it thorough. They didn't solely teach us front-end, by showing the skills and mentality necessary to adapt and learn in a field that is constantly changing.</p>

						<p className="tab">After the bootcamp, I joined GTB as a technology intern and worked on their diversified accounts team, which in my opinion was the best team in the entire agency (only <span className="italic-text">slight</span> bias <span role="img" aria-label="Smiley face with tongue sticking out - HaHa =p">😋</span>). GTB provided me with the experience to make me comfortable testing my skills in a startup environment, and I was able to start that journey by joining LoveBook Online. Working at LoveBook was a dream come true. They are a group of extremely passionate artists, creatives, and developers. Most importantly, they are genuinely good human beings conscious of their impact on the world around them. There, I saw the impact that a group of highly motivated people could have when they were united in achieiving a common goal.</p>

						<p className="tab">The startup environment proved to be everything I was hoping for and more. It was exactly the environment I needed to rapidly improve my skills as a developer, but as a human as well. I was able to wear many hats, take on different responsibilties, and do it all in an environment where I could fail safely. I made many mistakes, but each one taught me something that would help me improve as a critical thinker, developer, problem solver, and ultimately improve myself as a man. There, I acquired the skills and confidence to work for myself. I've always wanted to see if I had what I took to do things on my own, and here I am.</p>

						{/* Include Taken Quote - Liam Neeson - Michael Scott - Shugmi Shumunov */}
						<p className="tab">If you'd like to talk with me about how I can help your business grow or a personal project you may have, feel free to reach out.</p>

						<h3>Additional Info</h3>
						<p className="tab">When I'm not programming you'll likely find me working out, reading, or dancing to / singing some EDM. As cheesy as it may sound, I'm a passionate person. What I mean by that is I <span className="italic-text bold-text">really</span> like what I like and tend to dive down the rabbit hole with the things that resonate with me.</p>
						<List className="book-list">
							Some of my favorite books include:
							<ListItem>
								<ListItemContent>
									<span className="italic-text">The Alchemist</span> by Paulo Coelho
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<span className="italic-text">The Little Prince</span> by Antoine de Saint-Exupery
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<span className="italic-text">Meditations</span> by Marcus Aurelius
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<span className="italic-text">The Daily Stoic</span> by Ryan Holiday
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<span className="italic-text">As a Man Thinketh</span> by James Allen
								</ListItemContent>
							</ListItem>
						</List>
					</Cell>
				</Grid>
			</div>
		);
	}
}

export default About;
