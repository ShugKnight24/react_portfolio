import { Category } from './Category';
import { Grid } from 'react-mdl';

export function CategoryDrawer({ 
	allCategories,
	currentCategory,
	updateCategoryState
}){
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
