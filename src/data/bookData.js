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
			name: '1984',
			author: 'George Orwell',
			imgSrc: './img/books/1984.jpg'
		},
		{
			name: 'Power of Habit: Why We Do What We Do In Life And Business',
			author: 'Charles Duhigg',
			imgSrc: './img/books/power_of_habit.jpg'
		},
		{
			name: 'Cryptonomicon',
			author: 'Neal Stephenson',
			imgSrc: './img/books/cryptonomicon.jpg'
		},
		{
			name: 'Jack Reacher - Killing Floor',
			author: 'Lee Child',
			imgSrc: './img/books/killing_floor.jpg'
		},
		{
			name: 'The 4 Hour Workweek',
			author: 'Tim Ferriss',
			imgSrc: './img/books/4_hour_week.jpg',
			additionalInfo: 'Reading and implementing ideas'

		}
	]
};

allCategoriesArray.push(currentlyReading);

export const previouslyRead = {
	categoryName: 'Previously Read',
	index: 2,
	bookList: [
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
