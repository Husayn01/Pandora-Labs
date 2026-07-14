import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import LandingPage from './LandingPage';

afterEach(cleanup);

describe('voice-first landing page', () => {
  it('presents the product and free entry point', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Run the work.*Just say it/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Start free/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /No app.*No mobile data.*Just a call/i })).toBeInTheDocument();
  });

  it('states the safety boundary', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Helpful without being reckless/i })).toBeInTheDocument();
    expect(screen.getByText(/credentials stay encrypted in Supabase Vault/i)).toBeInTheDocument();
    expect(screen.getByText(/require an exact preview and explicit confirmation/i)).toBeInTheDocument();
  });
});
