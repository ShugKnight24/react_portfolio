import { FC } from 'react';
import { CategoryDrawerInterface } from '../../types/category';
import styles from './BookCatalogView.module.css';
import { onTabListKeyDown } from '../../utils/tablistKeys';

export const CategoryDrawer: FC<CategoryDrawerInterface> = ({
  allCategories,
  currentCategory,
  updateCategoryState,
}) => {
  return (
    <div className={styles.categoryBar} role="tablist" onKeyDown={onTabListKeyDown} aria-label="Book Categories">
      {allCategories.map((category, index) => {
        const isActive = index === currentCategory;
        const bookCount = category.bookList.length;

        return (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-category-index={index}
            className={`category ${styles.categoryPill} ${isActive ? styles.active : ''}`}
            onClick={updateCategoryState}
          >
            <span>{category.categoryName}</span>
            <span className={styles.categoryCountBadge}>{bookCount}</span>
          </button>
        );
      })}
    </div>
  );
};

