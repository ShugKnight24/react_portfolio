import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Books extends Component {
	render(){
		return(
			<Grid className="book-container">
				<Cell col={12}>
					<h5 className="book-name">{ this.props.bookName }</h5>
					<h6 className="book-author">By: { this.props.authorName }</h6>
				</Cell>
			</Grid>
		)
	}
}

export default Books;