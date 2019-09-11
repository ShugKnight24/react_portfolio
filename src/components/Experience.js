import React, { Component } from 'react';
import { Grid, Cell, List, ListItem } from 'react-mdl';

class Experience extends Component {
	render(){

		this.jobResponsibilities = this.props.jobResponsibilities;

		var jobResponsibilitiesList = this.jobResponsibilities.map(function(jobResponsibility, index){
			return <ListItem className="job-responsibility" key={ index } dangerouslySetInnerHTML={{__html: jobResponsibility}}></ListItem>;
		});

		return(
			<Grid className="experience-container">
				<Cell col={12}>
					<h3>{ this.props.jobName }</h3>
					<h4>{ this.props.jobPosition }</h4>
					<span className="date-of-employment">
						{ this.props.startMonth } { this.props.startYear } ➔ { this.props.endMonth } { this.props.endYear }
					</span>
					<p>{ this.props.jobDescription }</p>
					<List className="job-responsibilities-list">
						{ jobResponsibilitiesList }
					</List>
				</Cell>
			</Grid>
		)
	}
}

export default Experience;
