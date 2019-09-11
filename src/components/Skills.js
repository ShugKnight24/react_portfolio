import React, { Component } from 'react';
import { Grid, Cell, ProgressBar } from 'react-mdl';

class Skills extends Component {
	render(){
		return(
			<Grid>
				<Cell col={ 12 }>
					<div className="progress-container">
						<span>{ this.props.skill }</span>
						<ProgressBar className="skill-progress" progress={ this.props.progress }/>
					</div>
				</Cell>
			</Grid>
		)
	}
}

export default Skills;
