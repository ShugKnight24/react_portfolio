import { FC } from 'react';
import { Category } from './Category';
import { Grid } from 'react-mdl';
import { CategoryDrawerInterface } from '../../types/category';

export const CategoryDrawer : FC<CategoryDrawerInterface> = ({ 
	allCategories,
	currentCategory,
	updateCategoryState
}) => {
	// TODO: Add active / closed state to drawer
	return(
		<Grid className="category-drawer">
			{ 
				allCategories.map((category, index) => {
					const altText = category.bookList[0].name + ' by ' + category.bookList[0].author;

					return(
						<Category
							key={ index }
							categoryName={ category.categoryName }
							categoryIndex={ index }
							categoryImgSRC={ category.bookList[0].imgSrc }
							categoryImgAltText={ altText }
							updateCategoryState={ updateCategoryState }
							currentCategory={ currentCategory }
						/>
					);
				})
			}
		</Grid>
	)
}
