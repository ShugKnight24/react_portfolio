import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Category extends Component {
	render(){

		let isActive = this.props.categoryIndex === this.props.currentCategory;

		return(
			// {/* each has an activecategory state --> update on click of category  */}
			<Cell col={12}
				data-category-index={ this.props.categoryIndex }
				onClick={ this.props.updateCategoryState }
				className={`category ${isActive ? 'active' : ''}`}
			>
				<h4>{ this.props.categoryName }</h4>
				<img
					className="category-cover"
					src={ this.props.categoryImgSRC }
					alt={ this.props.categoryImgAltText }
				/>
			</Cell>
		)
	}
}

export default Category;
