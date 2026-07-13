/**
 * Auth Callback Page
 * ───────────────────
 * Handles OAuth and email confirmation redirects from Supabase.
 * Waits for a valid session before redirecting to dashboard.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlaceholderLogo } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    // Listen for the auth state change that Supabase triggers
    // when it processes the tokens from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // Session established — redirect to dashboard
          navigate('/dashboard', { replace: true });
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          navigate('/dashboard', { replace: true });
        }
      }
    );

    // Fallback: if Supabase already has a session (e.g., page reload),
    // check immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard', { replace: true });
      }
    });

    // Safety timeout — if nothing happens after 10s, show error
    const timeout = setTimeout(() => {
      setError('Authentication timed out. Please try signing in again.');
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505]">
      <div className="text-center">
        <PlaceholderLogo size={56} className="mx-auto mb-6 animate-pulse" />
        {error ? (
          <>
            <h2 className="text-xl font-thin text-white mb-2 uppercase tracking-tight">
              Something went <span className="font-medium">wrong</span>
            </h2>
            <p className="text-sm text-red-400 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="text-sm text-white underline underline-offset-4 hover:text-gray-300 transition-colors cursor-pointer"
            >
              Back to Sign In
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-thin text-white mb-2 uppercase tracking-tight">
              Verifying <span className="font-medium">Account</span>
            </h2>
            <p className="text-sm text-gray-500 animate-pulse font-light">
              Setting up your session...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
