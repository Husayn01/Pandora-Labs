import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import LandingPage from './LandingPage';

afterEach(cleanup);

describe('voice-first landing page', () => {
  it('presents the product and free entry point', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Your businesscan answer back/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Start free/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ordinary phone call/i)).toBeInTheDocument();
  });

  it('states the safety boundary', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getAllByText(/Every action leaves evidence/i)).toHaveLength(1);
    expect(screen.getByText(/never sent through n8n or an LLM/i)).toBeInTheDocument();
  });
});
