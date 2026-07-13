import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const auth = vi.hoisted(() => ({
  user: null,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

function renderRoute(element: React.ReactNode, route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={route} element={element} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('authentication pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = null;
    auth.loading = false;
    auth.signIn.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ error: null });
    auth.signInWithGoogle.mockResolvedValue({ error: null });
  });

  it('rejects a weak signup password before calling Supabase', async () => {
    renderRoute(<SignUpPage />, '/signup');

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ada Okafor' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('shows email confirmation after a successful signup request', async () => {
    renderRoute(<SignUpPage />, '/signup');

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ada Okafor' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByRole('heading', { name: /check your email/i }),
    ).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenCalledWith(
      'ada@example.com',
      'a-strong-password',
      'Ada Okafor',
    );
  });

  it('surfaces Google OAuth startup errors', async () => {
    auth.signInWithGoogle.mockResolvedValue({ error: new Error('OAuth is unavailable') });
    renderRoute(<LoginPage />, '/login');

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(await screen.findByText('OAuth is unavailable')).toBeInTheDocument();
  });

  it('navigates to the dashboard after password login succeeds', async () => {
    renderRoute(<LoginPage />, '/login');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText('Dashboard destination')).toBeInTheDocument());
    expect(auth.signIn).toHaveBeenCalledWith('owner@example.com', 'a-strong-password');
  });
});
