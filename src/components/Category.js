import React, { Component } from 'react';
import { Grid, Cell } from 'react-mdl';

class Category extends Component {
	constructor(props){
		super(props);
		this.state = { activeCategory: 0 }
	}
	render(){
		return(
			// {/* each has an activecategory state --> update on click of category  */}
			<Cell col={12}
				data-category-index={ this.props.categoryIndex }
				onClick={ this.props.updateCategoryState }
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
