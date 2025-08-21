import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, test } from 'vitest';

import { App } from './App';

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('App', () => {
  it('renders loading text before App is mounted', () => {
    renderWithRouter(<App />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders without crashing', async () => {
    renderWithRouter(<App />);
    await waitFor(() => {
      expect(screen.getByText('Full Stack Software Engineer')).toBeInTheDocument();
    });
  });

  test('contains a specific button', () => {
    renderWithRouter(<App />);
    expect(screen.getByRole('button', { name: /Load More Posts/i })).toBeInTheDocument();
  });
});
