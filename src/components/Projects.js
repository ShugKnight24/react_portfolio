import React, { Component } from 'react';
import { Tabs, Tab, Grid, Cell, Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

class Projects extends Component {
	constructor(props){
		super(props);
		this.state = { activeTab: 0 }
	}

	toggleCategories(){
		if (this.state.activeTab === 0){
			return(
				<div className="projects">
					<h1>Personal Projects</h1>
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">JavaScript Tetris Clone</CardTitle>
							<CardText>
								Rebuilt Tetris with JavaScript and HTML5 Canvas
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://github.com/ShugKnight24/js_tetris/" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
								</Button>
								<Button colored>
									<a href="https://shugknight24.github.io/js_tetris/" rel="noopener noreferrer" target="_blank">Live Demo</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Flappy Bird Clone</CardTitle>
							<CardText>
								Rebuilt Flappy Bird with JavaScript and HTML5 Canvas
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://github.com/ShugKnight24/flappy_bird" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
								</Button>
								<Button colored>
									<a href="https://shugknight24.github.io/flappy_bird" rel="noopener noreferrer" target="_blank">Live Demo</a>
								</Button>
							</CardActions>
						</Card>
					</div>
				</div>
			)
		}

		if (this.state.activeTab === 1){
			return(
				<div className="projects">
					<h1>GTB</h1>
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Optima Batteries</CardTitle>
							<CardText>
								Website built for Optima Batteries using Concrete5 CMS
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.optimabatteries.com/en-us" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Varta Europe</CardTitle>
							<CardText>
								Website built for Varta Europe using Concrete5 CMS
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.varta-automotive.com/en-gb" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Varta China</CardTitle>
							<CardText>
								Website built for Varta China using Concrete5 CMS. Needed their own site due to Chinese regulations
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.varta-automotive.cn/zh-cn" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Delkor Austrailia</CardTitle>
							<CardText>
								Website built for Delkor Austrailia using Concrete5 CMS
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.delkor.com.au/en-au" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">Delkor Korea</CardTitle>
							<CardText>
								Website built for Delkor Korea using Concrete5 CMS
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.delkor.kr/ko-kr" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
					</div>
				</div>
			)
		}

		if (this.state.activeTab === 2){
			return(
				<div className="projects">
					<h1>LoveBook</h1>
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">MyLoveBook.com</CardTitle>
							<CardText>
								Redirect site for LoveBookOnline.com and LoveCoups.com
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.mylovebook.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">LoveCoups.com</CardTitle>
							<CardText>
								Build personalized coupon books for those you love
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://lovecoups.com" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
					</div>
				</div>
			)
		}

		if (this.state.activeTab === 3){
			return(
				<div className="projects">
					<h1>Progressive Solutions</h1>
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">StationeryHQ</CardTitle>
							<CardText>
								Customized stationery made easy
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title">FreckleBox</CardTitle>
							<CardText>
								Personalized gifts for kids
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.frecklebox.com" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
					</div>
				</div>
			)
		}
	}

	render() {
		return(
			<div className="projects-page">
				<Tabs activeTab={ this.state.activeTab } onChange={ (tabId) => this.setState({ activeTab: tabId}) } ripple>
					<Tab>Personal Projects</Tab>
					<Tab>GTB</Tab>
					<Tab>LoveBook</Tab>
					<Tab>Progressive Solutions</Tab>
				</Tabs>
				<Grid>
					<Cell col={ 12 }>
						<p>Pardon the dust, the projects section is currently under construction</p>
						<div className="content">
							{ this.toggleCategories() }
						</div>
					</Cell>
				</Grid>
			</div>
		);
	}
}

export default Projects;
