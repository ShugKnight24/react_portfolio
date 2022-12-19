import { MouseEventHandler } from './events';

export interface BookInterface {
	bookIndex: number;
	bookNameAndAuthor: string;
	currentlySelectedBook: number;
	imgSrc: string;
	key: number;
	updateBookState: MouseEventHandler;
}

interface bookList {
	name: string;
	author: string;
	imgSrc: string;
	readNo?: number;
	audioBook?: boolean;
	listenNo?: number;
}

export interface bookData {
	index: number;
	categoryName: string;
	bookList: bookList[];
}

export interface BookBarInterface {
	allCategories: bookData[];
	currentCategory: number;
	currentlySelectedBook: number;
	updateBookState: MouseEventHandler;
}

export interface BookContentInterface {
	allCategories: bookData[];
	currentCategory: number;
	currentlySelectedBook: number;
}
