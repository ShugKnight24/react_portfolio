import React from 'react';
import { bookData } from './books';

export interface CategoryInterface {
	categoryName : string,
	categoryIndex : number,
	categoryImgSRC : string,
	categoryImgAltText : string,
	currentCategory: number,
	key: number,
	updateCategoryState : (event : React.MouseEvent<HTMLElement>) => void,
}

export interface CategoryDrawerInterface {
	allCategories : bookData[],
	currentCategory : number,
	updateCategoryState : (event : React.MouseEvent<HTMLElement>) => void,
}