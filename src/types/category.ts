import { MouseEventHandler } from './events';
import { bookData } from './books';

export interface CategoryInterface {
	categoryName: string;
	categoryIndex: number;
	categoryImgSRC: string;
	categoryImgAltText: string;
	currentCategory: number;
	key: number;
	updateCategoryState: MouseEventHandler;
}

export interface CategoryDrawerInterface {
	allCategories: bookData[];
	currentCategory: number;
	updateCategoryState: MouseEventHandler;
}
