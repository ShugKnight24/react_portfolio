import { FC, MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { BookBar } from '../Books/BookBar';
import { BookContent } from '../Books/BookContent';
import { BooksShelfView } from '../Books/BooksShelfView';
import { CategoryDrawer } from '../Books/CategoryDrawer';
import { LibraryView } from '../Books/LibraryView';
import catalogStyles from '../Books/BookCatalogView.module.css';

import { allCategoriesArray } from '../../data/bookData.js';
import type { bookData } from '../../types/books';

// Calculate reading stats
type BookStat = { author?: string; readNo?: number; audioBook?: boolean };
const calculateStats = () => {
  const allBooks = allCategoriesArray.flatMap((cat: { bookList: BookStat[] }) => cat.bookList);
  const totalBooks = allBooks.length;
  const uniqueAuthors = new Set(allBooks.map((book) => book.author).filter(Boolean)).size;
  const booksWithRereads = allBooks.filter((book) => book.readNo && book.readNo > 1).length;
  const audioBooks = allBooks.filter((book) => book.audioBook).length;

  return { totalBooks, uniqueAuthors, booksWithRereads, audioBooks };
};

export const BooksPage: FC = () => {
  const [activeCategory, setActiveCategory] = useState(0);
  const [shelfCategoryIndex, setShelfCategoryIndex] = useState<number | null>(null);
  const [activeBook, setActiveBook] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'audiobook' | 'reread'>('all');
  const [viewMode, setViewMode] = useState<'library' | 'shelf' | 'catalog'>('library');

  const stats = useMemo(() => calculateStats(), []);

  const updateCategoryState = (event: MouseEvent<HTMLElement>): void => {
    const target = event.currentTarget;
    if (target instanceof Element) {
      if (target.classList.contains('category')) {
        const categoryIndex = Number(target.dataset.categoryIndex);
        setActiveCategory(categoryIndex);
        setActiveBook(0);
      }
    }
  };

  const updateBookState = (event: MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement;
    if (target.parentNode instanceof HTMLElement) {
      if (target.classList.contains('book-bar-book-image')) {
        const bookIndex = Number(target.parentNode.dataset.bookIndex);
        setActiveBook(bookIndex);
      }
    }
  };

  // Whether a book matches the search and filter type
  const bookMatches = useCallback(
    (book: { name: string; author?: string; audioBook?: boolean; readNo?: number }) => {
      const matchesSearch =
        !searchTerm ||
        book.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterType === 'all' ||
        (filterType === 'audiobook' && book.audioBook) ||
        (filterType === 'reread' && book.readNo && book.readNo > 1);

      return Boolean(matchesSearch && matchesFilter);
    },
    [searchTerm, filterType]
  );

  // Filter books based on search and filter type
  const filteredCategories = useMemo(() => {
    return allCategoriesArray.map((category: bookData) => ({
      ...category,
      bookList: category.bookList.filter(bookMatches),
    }));
  }, [bookMatches]);

  // Reset activeBook when filter/search changes or when switching categories
  // to prevent accessing an invalid book index
  useEffect(() => {
    const currentCategoryBooks = filteredCategories[activeCategory]?.bookList || [];
    if (activeBook >= currentCategoryBooks.length) {
      setActiveBook(0);
    }
  }, [filteredCategories, activeCategory, activeBook]);

  // Count books in filtered results
  const filteredBookCount = useMemo(() => {
    return filteredCategories.reduce(
      (acc: number, cat: { bookList: unknown[] }) => acc + cat.bookList.length,
      0
    );
  }, [filteredCategories]);

  // Check if current category has books
  const currentCategoryHasBooks = filteredCategories[activeCategory]?.bookList?.length > 0;

  const isFiltering = Boolean(searchTerm) || filterType !== 'all';
  const filterOptions: { id: 'all' | 'audiobook' | 'reread'; label: string }[] = [
    { id: 'all', label: 'All books' },
    { id: 'audiobook', label: 'Audiobooks' },
    { id: 'reread', label: 'Re-reads' },
  ];

  return (
    <div className="cx-page cx-books">
      <header className="cx-intro">
        <p className="cx-kicker">Liber I &middot; The Library</p>
        <h1 className="world-title cx-title">
          My Reading <em>Habit</em>
        </h1>
        <p className="cx-dek">Mostly the same books, read more than once</p>
        <div className="cx-rule" aria-hidden="true">
          <span />
        </div>
        <p className="cx-lede">
          A lot of what I know I got from books, usually on the second pass. The shelves run from
          Stoic philosophy to business strategy, with some self-help I&rsquo;d rather you didn&rsquo;t
          judge. I re-read a lot, partly to catch what I missed and partly because I forget.
        </p>

        <div className="cx-ledger">
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.totalBooks}</span>
            <span className="cx-ledger__label">Books read</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.uniqueAuthors}</span>
            <span className="cx-ledger__label">Authors</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.booksWithRereads}</span>
            <span className="cx-ledger__label">Re-reads</span>
          </div>
          <div className="cx-ledger__item">
            <span className="cx-ledger__num">{stats.audioBooks}</span>
            <span className="cx-ledger__label">Audiobooks</span>
          </div>
        </div>
      </header>

      <div className="cx-toolbar">
        <div className="cx-search">
          <svg
            className="cx-search__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
          <input
            type="search"
            placeholder="Search books or authors"
            aria-label="Search books or authors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="cx-search__input"
          />
          {searchTerm && (
            <button
              type="button"
              className="cx-search__clear"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="cx-segment" role="group" aria-label="Filter books">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className="cx-segment__btn"
              aria-pressed={filterType === option.id}
              onClick={() => setFilterType(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="cx-segment" role="group" aria-label="Library view">
          <button
            type="button"
            className="cx-segment__btn"
            aria-pressed={viewMode === 'library'}
            onClick={() => setViewMode('library')}
          >
            Library
          </button>
          <button
            type="button"
            className="cx-segment__btn"
            aria-pressed={viewMode === 'shelf'}
            onClick={() => setViewMode('shelf')}
          >
            Shelf
          </button>
          <button
            type="button"
            className="cx-segment__btn"
            aria-pressed={viewMode === 'catalog'}
            onClick={() => setViewMode('catalog')}
          >
            Catalog
          </button>
        </div>
      </div>

      {isFiltering && (
        <div className="cx-results" role="status">
          <span>
            {filteredBookCount} {filteredBookCount === 1 ? 'volume' : 'volumes'} found
          </span>
          <button
            type="button"
            className="cx-link"
            onClick={() => {
              setSearchTerm('');
              setFilterType('all');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {viewMode === 'library' ? (
        <LibraryView
          categories={allCategoriesArray}
          isMatch={bookMatches}
          isFiltering={isFiltering}
        />
      ) : viewMode === 'shelf' ? (
        <BooksShelfView
          categories={filteredCategories}
          activeCategoryIndex={isFiltering ? undefined : shelfCategoryIndex}
          onSelectCategory={(idx) => {
            setShelfCategoryIndex(idx);
            if (idx !== null) {
              setActiveCategory(idx);
              setActiveBook(0);
            }
          }}
        />
      ) : (
        <div className={catalogStyles.catalogContainer}>
          <CategoryDrawer
            allCategories={allCategoriesArray}
            updateCategoryState={updateCategoryState}
            currentCategory={activeCategory}
          />
          {currentCategoryHasBooks ? (
            <>
              <BookBar
                allCategories={filteredCategories}
                currentCategory={activeCategory}
                currentlySelectedBook={activeBook}
                updateBookState={updateBookState}
              />
              <BookContent
                allCategories={filteredCategories}
                currentCategory={activeCategory}
                currentlySelectedBook={activeBook}
              />
            </>
          ) : (
            <div className="cx-empty">
              <h3 className="cx-empty__title">Nothing on this shelf</h3>
              <p>
                {filterType !== 'all'
                  ? `No ${filterType === 'audiobook' ? 'audiobooks' : 're-reads'} found in "${allCategoriesArray[activeCategory]?.categoryName}".`
                  : searchTerm
                    ? `No books matching "${searchTerm}" in this category.`
                    : "This shelf is empty. I'll get to it."}
              </p>
              <button
                type="button"
                className="cx-btn cx-btn--solid"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                }}
              >
                Show all books
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
