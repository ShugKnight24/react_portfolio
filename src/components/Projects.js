import React, { Component } from 'react';
import { Tabs, Tab, Grid, Cell, Card, CardTitle, CardText, CardActions, Button } from 'react-mdl';

export default class Projects extends Component {
	constructor(props){
		super(props);
		this.state = { activeTab: 0 }
	}

	toggleCategories(){
		if (this.state.activeTab === 0){
			return(
				<div className="projects">
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title  pomodoro" role="img" aria-label="Image of JavaScript Pomodoro clock built by Shugmi Shumunov">
								<span className="title-background">
									Pomodoro Clock
								</span>
							</CardTitle>
							<CardText className="project-description">Built a Pomodoro clock in JavaScript that uses the pomodoro system and includes todo list functionality</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://github.com/ShugKnight24/pomodoro" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
								</Button>
								<Button colored>
									<a href="https://shugknight24.github.io/pomodoro" rel="noopener noreferrer" target="_blank">Live Demo</a>
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
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title  tetris" role="img" aria-label="Image of JavaScript Tetris clone built by Shugmi Shumunov">
								<span className="title-background">
									JavaScript Tetris Clone
								</span>
							</CardTitle>
							<CardText className="project-description">Rebuilt Tetris with JavaScript and HTML5 Canvas</CardText>
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
							<CardTitle className="project-cards-title flappy-bird" role="img" aria-label="Image of JavaScript Flappy Bird clone built by Shugmi Shumunov">
								<span className="title-background">Flappy Bird Clone</span>
							</CardTitle>
							<CardText className="project-description">
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
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title trex-runner" role="img" aria-label="Image of T-Rex Runner Clone built by Shugmi Shumunov">
								<span className="title-background">T-Rex Runner</span>
							</CardTitle>
							<CardText className="project-description">
								Rebuilt Google Chrome Dino runner game w/ HTML, CSS, & Javascript
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://github.com/ShugKnight24/dino_jump" rel="noopener noreferrer" target="_blank">GitHub Repository</a>
								</Button>
								<Button colored>
									<a href="https://shugknight24.github.io/dino_jump" rel="noopener noreferrer" target="_blank">Live Demo</a>
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
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title optima" role="img" aria-label="Image of Optima Batteries website homepage">
								<span className="title-background">
									Optima Batteries
								</span>
								</CardTitle>
							<CardText>
								Website built for Optima Batteries using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.optimabatteries.com/en-us" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title varta" role="img" aria-label="Image of Varta Europe website homepage">
								<span className="title-background">
									Varta Europe
								</span>
								</CardTitle>
							<CardText className="project-description">
								Website built for Varta Europe using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.varta-automotive.com/en-gb" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title varta-china" role="img" aria-label="Image of Varta China website homepage">
								<span className="title-background">
									Varta China
								</span>
								</CardTitle>
							<CardText className="project-description">
								Website built for Varta China using Concrete5 CMS. Needed their own site due to Chinese regulations. Updated content, built features, and wrote styles as needed.
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.varta-automotive.cn/zh-cn" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title delkor" role="img" aria-label="Image of Delkor Austrailia website homepage">
								<span className="title-background">
									Delkor Austrailia
								</span>
								</CardTitle>
							<CardText className="project-description">
								Website built for Delkor Austrailia using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.delkor.com.au/en-au" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title delkor-korea" role="img" aria-label="Image of Delkor Korea website homepage">
								<span className="title-background">
									Delkor Korea
								</span>
								</CardTitle>
							<CardText className="project-description">
								Website built for Delkor Korea using Concrete5 CMS. Updated content, built features, and wrote styles as needed.
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

		if (this.state.activeTab === 3){
			return(
				<div className="projects">
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title mylovebook" role="img" aria-label="Image of MyLoveBook website">
								<span className="title-background">
									MyLoveBook
								</span>
							</CardTitle>
							<CardText className="project-description">
								Redirect site for LoveBookOnline.com and LoveCoups.com
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.mylovebook.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title lovecoups" role="img" aria-label="Image of LoveCoups website homepage">
								<span className="title-background">
									LoveCoups
								</span>
							</CardTitle>
							<CardText className="project-description">
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

		if (this.state.activeTab === 4){
			return(
				<div className="projects">
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title stationeryhq" role="img" aria-label="Image of StationeryHQ website homepage">
								<span className="title-background">
									StationeryHQ
								</span>
							</CardTitle>
							<CardText className="project-description">
								Customized stationery made easy
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title frecklebox" role="img" aria-label="Image of FreckleBox website homepage">
								<span className="title-background">
									FreckleBox
								</span>
							</CardTitle>
							<CardText className="project-description">
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

		if (this.state.activeTab === 5){
			return(
				<div className="projects">
					<div className="projects-grid">
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title shumunov-solutions" role="img" aria-label="Image of Shumunov Solutions website homepage">
								<span className="title-background">
									Shumunov Solutions
								</span>
							</CardTitle>
							<CardText className="project-description">
								Providing technology solutions to South East Michigan businesses
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.stationeryhq.com" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title jk-unlimited-services" role="img" aria-label="Image of JK Unlimited Services website homepage">
								<span className="title-background">
									JK Unlimited Services
								</span>
							</CardTitle>
							<CardText className="project-description">
								Website for West Bloomfield, MI general contractor
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.jkunlimitedservices.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
								</Button>
							</CardActions>
						</Card>
						<Card shadow={ 5 } className="project-cards">
							<CardTitle className="project-cards-title paper-goods-warehouse" role="img" aria-label="Image of Paper Goods Warehouse website homepage">
								<span className="title-background">
									Paper Goods Warehouse
								</span>
							</CardTitle>
							<CardText className="project-description">
								Website for Oak Park, MI Paper Goods Store
							</CardText>
							<CardActions border>
								<Button colored>
									<a href="https://www.papergoodswarehouse.com/" rel="noopener noreferrer" target="_blank">Live Site</a>
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
				<Tabs className="projects-tabs" activeTab={ this.state.activeTab } onChange={ (tabId) => this.setState({ activeTab: tabId}) } ripple>
					<Tab className="tab-name">Personal Projects</Tab>
					<Tab className="tab-name">Games</Tab>
					<Tab className="tab-name">GTB</Tab>
					<Tab className="tab-name">LoveBook</Tab>
					<Tab className="tab-name">Progressive Solutions</Tab>
					<Tab className="tab-name">Shumunov Solutions</Tab>
				</Tabs>
				<Grid>
					<Cell col={ 12 }>
						<div className="content">
							{ this.toggleCategories() }
						</div>
					</Cell>
				</Grid>
			</div>
		);
	}
}
