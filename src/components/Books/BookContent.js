import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

export default class BookContent extends Component {
	render(){
		let currentCategory = this.props.currentCategory;
		let currentlySelectedBook = this.props.currentlySelectedBook;

		const currentBook = this.props.allCategories[currentCategory].bookList[currentlySelectedBook];

		// let additionalInfo;
		//
		// if (currentBook.additionalInfo !== undefined){
		// 	additionalInfo = currentBook.additionalInfo;
		// }

		const altText = currentBook.name + ' by ' + currentBook.author;

		return(
			<Grid className="book-container">
				<Cell col={12}>
					<h5 className="book-name">{ currentBook.name }</h5>
					<h6 className="book-author">By: { currentBook.author }</h6>
					<img
						className="book-cover"
						src={ currentBook.imgSrc }
						alt={ altText }
					/>
					{/* <span className="book-info">{ additionalInfo }</span> */}

					{/*
					// Add api calls
					// - goodreads
					// - wikipedia
					// - amazon link to buy
					// Add review scores
					// generic thoughts
					*/}
				</Cell>
			</Grid>
		)
	}
}
