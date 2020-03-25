import React, { Component } from 'react';
import { Grid, Cell, List, ListItem, ListItemContent } from 'react-mdl';

import Book from './Book';

class Books extends Component {
	render() {
		return(
			<div className="books-page">
				<Grid>
					<Cell col={ 3 } className="reading-list">
						<h3>Currently Reading</h3>
						<Book
							bookName={ 'The 15 Laws of Invaluable Growth' }
							authorName={ 'John C. Maxwell' }
							bookImageSource = { './img/books/15_laws.jpg' }
							bookImageAltText={ 'The 15 Laws of Invaluable Growth by John C. Maxwell' }
						/>

						<h3>Previous Reads</h3>
						<h4>2020</h4>
						<Book
							bookName={ 'The Entrepreneur Mind' }
							authorName={ 'Kevin D. Johnson' }
							bookImageSource={ './img/books/entrepreneur_mind.jpg' }
							bookImageAltText={ 'The Entrepreneur Mind by Kevin D. Johnson' }
						/>
					</Cell>
					<Cell col={ 1 }></Cell>
					<Cell col={ 8 }>
						<List className="book-list">
							<h2>Favorites</h2>
							<ListItem>
								<ListItemContent>
									<img
										src="./img/books/alchemist.jpg"
										alt="The Alchemist by Paulo Coelho"
										className="book-cover"
									/>
									<span className="book-title-author"><span className="italic-text">The Alchemist</span> by Paulo Coelho</span>
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<img
										src="./img/books/little_prince.jpg"
										alt="The Little Prince by Antoine de Saint-Exupery"
										className="book-cover"
									/>
									<span className="book-title-author"><span className="italic-text">The Little Prince</span> by Antoine de Saint-Exupery</span>
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<img
										src="./img/books/meditations.jpg"
										alt="Meditations by Marcus Aurelius"
										className="book-cover"
									/>
									<span className="book-title-author"><span className="italic-text">Meditations</span> by Marcus Aurelius</span>
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<img
										src="./img/books/daily_stoic.jpg"
										alt="The Daily Stoic by Ryan Holiday"
										className="book-cover"
									/>
									<span className="book-title-author"><span className="italic-text">The Daily Stoic</span> by Ryan Holiday</span>
								</ListItemContent>
							</ListItem>
							<ListItem>
								<ListItemContent>
									<img
										src="./img/books/as_a_man_thinketh.jpg"
										alt="As a Man Thinketh by James Allen"
										className="book-cover"
									/>
									<span className="book-title-author"><span className="italic-text">As a Man Thinketh</span> by James Allen</span>
								</ListItemContent>
							</ListItem>
						</List>
					</Cell>
				</Grid>
			</div>

		)
	}
}

export default Books;
