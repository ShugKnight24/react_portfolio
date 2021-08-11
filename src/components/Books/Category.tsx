import { FC } from 'react';
import { Cell } from '../Grid';
import { CategoryInterface } from '../../types/category';

export const Category : FC<CategoryInterface> = ({ 
	categoryName,
	categoryIndex,
	categoryImgSRC,
	categoryImgAltText,
	updateCategoryState,
	currentCategory
}) => {
	const isActive = categoryIndex === currentCategory;

	return(
		<Cell
			columns={'full'}
			data-category-index={ categoryIndex }
			extraClass={`category ${ isActive ? 'active' : '' }`}
			onClick={ updateCategoryState }
		>
			<h4>{ categoryName }</h4>
			<img
				className="category-cover"
				src={ categoryImgSRC }
				alt={ categoryImgAltText }
			/>
		</Cell>
	);
}