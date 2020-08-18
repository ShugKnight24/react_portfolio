import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

import Category from './Category';

class CategoryDrawer extends Component {
	constructor(props){
		super(props);
		this.state = { activeCategory: 0 };
	}

	buildCategories(category, index){
		const altText = category.bookList[0].name + ' by ' + category.bookList[0].author;

		return (
			<Category
				key={ index }
				categoryName={ category.categoryName }
				categoryIndex={ index }
				categoryImgSRC={ category.bookList[0].imgSrc }
				categoryImgAltText={ altText }
				updateCategoryState={ this.props.updateCategoryState }
				currentCategory={ this.props.currentCategory }
			/>
		);
	}

	render(){

		let allCategoriesArray = this.props.allCategories;

		const allCategories = allCategoriesArray.map((category, index) => {
			return this.buildCategories(category, index);
		});
// TODO: Add active / closed state to drawer
		return(
			<Grid className="category-drawer">
				{ allCategories }
			</Grid>
		)
	}
}

export default CategoryDrawer;
