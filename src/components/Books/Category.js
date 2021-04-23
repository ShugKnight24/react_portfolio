import { Cell } from 'react-mdl';

export function Category({ 
	categoryName,
	categoryIndex,
	categoryImgSRC,
	categoryImgAltText,
	updateCategoryState,
	currentCategory
}){
	let isActive = categoryIndex === currentCategory;

	return(
		<Cell col={12}
			data-category-index={ categoryIndex }
			onClick={ updateCategoryState }
			className={`category ${isActive ? 'active' : ''}`}
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