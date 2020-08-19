import React, { Component } from 'react';
import { Cell } from 'react-mdl';

import Book from './Book'

export default class BookBar extends Component {
	buildBooksInCat(bookInCat, index){
		const altText = bookInCat.name + ' by ' + bookInCat.author;

		return (

			<Book
				bookNameAndAuthor={ altText }
				imgSrc={ bookInCat.imgSrc }
				key={ index }
				bookIndex={ index }
				updateBookState={ this.props.updateBookState }
				currentlySelectedBook={ this.props.currentlySelectedBook }
			/>
		);
	}

	render(){

		// more long term / not immediate
		// consider how to split current / previous reads per year */

		let currentCatIndex = this.props.currentCategory;
		let currentCategory = this.props.allCategories[currentCatIndex];
		let currentCatName = currentCategory.categoryName;

		const allBooksInCat = currentCategory.bookList.map((bookInCat, index) => {
			return this.buildBooksInCat(bookInCat, index);
		});

// // TODO: Add active / closed state to drawer
		return(
			<Cell col={12}
				className="book-bar"
				onClick={ this.props.updateBookState }
			>
				<h4>{ currentCatName }</h4>
				{/* Select proper category */}
				{ allBooksInCat }
				{/* Add hover state */}
				{/* Add active state to selected book */}
			</Cell>
		)
	}
}
