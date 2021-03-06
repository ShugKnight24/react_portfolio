import React from 'react';

export interface BookInterface {
	bookIndex : number,
	bookNameAndAuthor : string,
	currentlySelectedBook : number,
	imgSrc : string,
	key: number,
	updateBookState: (event : React.MouseEvent<HTMLElement>) => void
}

interface bookList {
	name: string,
	author: string,
	imgSrc: string,
	readNo?: number
}

export interface bookData {
	index: number,
	categoryName: string,
	bookList: bookList[]
}

export interface BookBarInterface {
	allCategories : bookData[],
	currentCategory : number,
	currentlySelectedBook : number,
	updateBookState : (event : React.MouseEvent<HTMLElement>) => void
}

export interface BookContentInterface {
	allCategories : bookData[],
	currentCategory : number,
	currentlySelectedBook : number
}