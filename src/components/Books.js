import React, { Component } from 'react';
import { Grid, Cell, List, ListItem, ListItemContent } from 'react-mdl';

import Book from './Book';

class Books extends Component {
	render() {
		const favoriteBooksArray = [
			{
				name: 'The Alchemist',
				author: 'Paulo Coelho',
				imgSrc: './img/books/alchemist.jpg'
			},
			{
				name: 'The Little Prince',
				author: 'Antoine de Saint-Exupery',
				imgSrc: './img/books/little_prince.jpg'
			},
			{
				name: 'Meditations',
				author: 'Marcus Aurelius',
				imgSrc: './img/books/meditations.jpg'
			},
			{
				name: 'The Daily Stoic',
				author: 'Ryan Holiday',
				imgSrc: './img/books/daily_stoic.jpg'
			},
			{
				name: 'As a Man Thinketh',
				author: 'James Allen',
				imgSrc: './img/books/as_a_man_thinketh.jpg'
			}
		];

		const favoriteBooks = favoriteBooksArray.map((book, index) => {
			const altText = book.name + ' by ' + book.author;
			return (
				<ListItem key={ index }>
					<ListItemContent>
						<img
							className="book-cover"
							src={ book.imgSrc }
							alt={ altText }
						/>
						<span className="book-title-author">
							<span className="italic-text">{ book.name }</span> by { book.author }
						</span>
					</ListItemContent>
				</ListItem>
			);
		});

		const currentlyReading = [
			{
				name: 'The Book of Five Rings',
				author: 'Miyamoto Musashi',
				imgSrc: './img/books/5_rings.jpg'
			},
			{
				name: 'Jack Reacher - Killing Floor',
				author: 'Lee Child',
				imgSrc: './img/books/killing_floor.jpg'
			},
			{
				name: 'The 4 Hour Workweek',
				author: 'Tim Ferriss',
				imgSrc: './img/books/4_hour_week.jpg'
			}
		];

		const currentReads = currentlyReading.map((book, index) => {
			return buildBooks(book, index);
		});

		const previouslyRead = [
			{
				name: 'The Greatest Salesman in the World. Part II: The End of the Story',
				author: 'Og Mandino',
				imgSrc: './img/books/greatest_salesman_2.jpg'
			},
			{
				name: 'The Greatest Salesman in the World',
				author: 'Og Mandino',
				imgSrc: './img/books/greatest_salesman.jpg'
			},
			{
				name: 'Think and Grow Rich',
				author: 'Napoleon Hill',
				imgSrc: './img/books/think_grow_rich.jpg'
			},
			{
				name: 'Crime and Punishment',
				author: 'Fyodor Dostoevsky',
				imgSrc: './img/books/crime_and_punishment.jpg'
			},
			{
				name: 'The 15 Laws of Invaluable Growth',
				author: 'John C. Maxwell',
				imgSrc: './img/books/15_laws.jpg'
			},
			{
				name: 'The Entrepreneur Mind',
				author: 'Kevin D. Johnson',
				imgSrc: './img/books/entrepreneur_mind.jpg'
			}
		];

		const previousReads = previouslyRead.map((book, index) => {
			return buildBooks(book, index);
		});

		function buildBooks(book, index){

			let additionalInfo;

			if (book.additionalInfo !== undefined){
				additionalInfo = book.additionalInfo;
			}

			const altText = book.name + ' by ' + book.author;
			return (
				<Book
					key={ index }
					bookName={ book.name }
					authorName={ book.author }
					bookImageSource ={ book.imgSrc }
					bookImageAltText={ altText }
					bookAdditionalInfo={ additionalInfo }
				/>
			);
		};

		return(
			<div className="books-page">
				<Grid>
					<Cell col={ 3 } className="reading-list">
						<h3>Currently Reading</h3>
						{ currentReads }

						<h3>Previous Reads</h3>
						<h4>2020</h4>
						{ previousReads }

					</Cell>
					<Cell col={ 1 }></Cell>
					<Cell col={ 8 }>
						<List className="book-list">
							<h2>Favorites</h2>
							{ favoriteBooks }
						</List>
					</Cell>
				</Grid>
			</div>

		);
	}
}

export default Books;
