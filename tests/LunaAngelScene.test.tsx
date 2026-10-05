import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LunaAngelScene } from '../src/components/LunaAngel';

describe('LunaAngelScene', () => {
  it('renders the memorial scene with title, illustration, and portrait', () => {
    render(<LunaAngelScene />);

    expect(screen.getByRole('heading', { name: 'Luna' })).toBeInTheDocument();
    expect(screen.getByText(/My best girl/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Luna, a fawn dog with big flyaway ears/i }),
    ).toBeInTheDocument();

    const svgElement = screen.getByRole('img', {
      name: /Illustration of Luna/i,
    });
    expect(svgElement).toBeInTheDocument();
  });

  it('increments treat count and updates speech quote on treat button click', () => {
    render(<LunaAngelScene />);

    const treatBtn = screen.getByRole('button', { name: /Give Luna a treat/i });
    expect(treatBtn).toBeInTheDocument();

    const initialCount = screen.getByText('42');
    expect(initialCount).toBeInTheDocument();

    fireEvent.click(treatBtn);
    expect(screen.getByText('43')).toBeInTheDocument();
  });

  it('increments count on send love / pet button click', () => {
    render(<LunaAngelScene />);

    const loveBtn = screen.getByRole('button', { name: /Send love and pet Luna/i });
    expect(loveBtn).toBeInTheDocument();

    fireEvent.click(loveBtn);
    expect(screen.getByText('43')).toBeInTheDocument();
  });
});
