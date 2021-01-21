export let allCategoriesArray = [];

export const favoriteBooksArray = {
	categoryName: 'Favorite Books',
	index: 0,
	bookList: [
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
	]
};

allCategoriesArray.push(favoriteBooksArray);

export const currentlyReading = {
	categoryName: 'Currently Reading',
	index: 1,
	bookList: [
		{
			name: 'Rich Dad Poor Dad',
			author: 'Robert T. Kiyosaki',
			imgSrc: './img/books/rich_dad_poor_dad.jpg',
			readNo: 1
		},
		{
			name: 'The Daily Stoic',
			author: 'Ryan Holiday',
			imgSrc: './img/books/daily_stoic.jpg',
			readNo: 1
		}
	]
};

allCategoriesArray.push(currentlyReading);

export const previouslyRead = {
	categoryName: 'Previously Read',
	index: 2,
	bookList: [
		{
			name: 'This Book Will Teach You How To Write Better',
			author: 'Neville Medhora',
			imgSrc: './img/books/this_book_will_teach.jpg'
		},
		{
			name: 'Dune',
			author: 'Frank Herbert',
			imgSrc: './img/books/dune.jpg'
		},
		{
			name: 'The Game: Penetrating the Secret Society of Pickup Artists',
			author: 'Neil Strauss',
			imgSrc: './img/books/the_game.jpg'
		},
		{
			name: 'The Book of Five Rings',
			author: 'Miyamoto Musashi',
			imgSrc: './img/books/5_rings.jpg'
		},
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
	]
};

allCategoriesArray.push(previouslyRead);
