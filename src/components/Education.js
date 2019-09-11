import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Education extends Component {
	render(){
		return(
			<Grid className="education-container">
				<Cell col={ 4 }>
					<p>{ this.props.startMonth } { this.props.startYear } - { this.props.endMonth } { this.props.endYear }</p>
				</Cell>
				<Cell col={ 8 }>
					<h3>{ this.props.schoolName }</h3>
					<h4>{ this.props.degreeName }</h4>
					<h5>{ this.props.majorName }</h5>
				</Cell>
			</Grid>
		)
	}
}

export default Education;
