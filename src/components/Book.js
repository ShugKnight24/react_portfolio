import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Books extends Component {
	render(){
		return(
			<Grid className="book-container">
				<Cell col={12}
					data-book-index={ this.props.bookIndex }
				>
					{/* // <h6 className="book-bar-name-author">{ this.props.bookNameAndAuthor }</h6>*/}
					<img
						className="book-bar-book-image"
						src={ this.props.imgSrc }
						alt={ this.props.bookNameAndAuthor }
					/>
				</Cell>
			</Grid>
		)
	}
}

export default Books;
