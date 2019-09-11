import React, { Component } from 'react';
import { Tabs, Tab, Grid, Cell, Card, CardTitle, CardText, CardActions, Button, CardMenu, IconButton } from 'react-mdl';

// TODO: Fill Out All Projects

class Projects extends Component {
	// constructor(props){
	// 	super(props);
	// 	this.state = { activeTab: 0 }
	// }
	//
	// // TODO: Include all projects past and present
	//
	// toggleCategories(){
	// 	if (this.state.activeTab === 0){
	// 		return(
	// 			<div className="projects">
	// 				<h1>Personal Projects</h1>
	// 				<div className="projects-grid">
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 				</div>
	// 			</div>
	// 		)
	// 	}
	//
	// 	if (this.state.activeTab === 1){
	// 		return(
	// 			<div className="projects">
	// 				<h1>GTB</h1>
	// 				<div className="projects-grid">
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 				</div>
	// 			</div>
	// 		)
	// 	}
	//
	// 	if (this.state.activeTab === 2){
	// 		return(
	// 			<div className="projects">
	// 				<h1>LoveBook</h1>
	// 				<div className="projects-grid">
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 				</div>
	// 			</div>
	// 		)
	// 	}
	//
	// 	if (this.state.activeTab === 3){
	// 		return(
	// 			<div className="projects">
	// 				<h1>Progressive Solutions</h1>
	// 				<div className="projects-grid">
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 					<Card shadow={ 5 } className="project-cards">
	// 						<CardTitle className="project-cards-title">Project Name</CardTitle>
	// 						<CardText>
	// 							Project Description!
	// 						</CardText>
	// 						<CardActions border>
	// 							<Button colored>GitHub</Button>
	// 							<Button colored>Live Demo</Button>
	// 						</CardActions>
	// 						<CardMenu className="white-text">
	// 							<IconButton name="share" />
	// 						</CardMenu>
	// 					</Card>
	// 				</div>
	// 			</div>
	// 		)
	// 	}
	// }

	render() {
		return(
			<div className="category-tabs" style={{marginTop: '66px'}}>
				<center>
					<p style={{fontSize: '20px'}}>Projects Under Construction</p>
				</center>
				{/*<Tabs activeTab={ this.state.activeTab } onChange={ (tabId) => this.setState({ activeTab: tabId}) } ripple>
					<Tab>Personal Projects</Tab>
					<Tab>GTB</Tab>
					<Tab>LoveBook</Tab>
					<Tab>Progressive Solutions</Tab>
				</Tabs>
				<Grid>
					<Cell col={ 12 }>
						<div className="content">
							{ this.toggleCategories() }
						</div>
					</Cell>
				</Grid> */}
			</div>
		);
	}
}

export default Projects;
