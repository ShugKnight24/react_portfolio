import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, test } from 'vitest';

import { App } from './App';
import { ThemeProvider } from './context/ThemeProvider';

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <BrowserRouter>{component}</BrowserRouter>
    </ThemeProvider>
  );
};

describe('App', () => {
  it('renders a full-height loading placeholder before the page is mounted', () => {
    renderWithRouter(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('renders without crashing', async () => {
    renderWithRouter(<App />);
    await waitFor(
      () => {
        expect(screen.getByText(/Full stack engineer, building in Detroit/)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  }, 15000);

  test('contains a theme toggle button', async () => {
    renderWithRouter(<App />);
    expect(await screen.findByRole('button', { name: /Open theme switcher/i })).toBeInTheDocument();
  });
});
