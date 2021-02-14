import React, { Component } from 'react';
import { Grid, Cell, ProgressBar } from 'react-mdl';

export default class Skills extends Component {
	render(){
		return(
			<Grid>
				<Cell col={ 12 }>
					<div className="progress-container">
						<span className={`bold-text ${ this.props.progress === null && 'skill-name-centered'}`}>{ this.props.skill }</span>
						{
							this.props.progress !== null &&
							<ProgressBar className="skill-progress" progress={ this.props.progress }/>
						}
					</div>
				</Cell>
			</Grid>
		)
	}
}
