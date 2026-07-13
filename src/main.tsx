/**
 * Application Entry Point
 * ────────────────────────
 * Renders the React app into the DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Application root element was not found.');

const root = createRoot(rootElement);
const hasPublicConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function renderStartupError(message: string) {
  root.render(
    <main className="min-h-screen bg-[#050505] text-white grid place-items-center px-6">
      <section className="max-w-lg rounded-3xl border border-white/10 bg-white/[.03] p-8">
        <p className="text-xs uppercase tracking-[.22em] text-gray-500">Pandora configuration</p>
        <h1 className="mt-3 text-2xl font-light">The web app could not start.</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-400">{message}</p>
        <p className="mt-5 text-xs text-gray-600">
          Local setup: copy .env.example to .env.local and configure the VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY values, then restart the development server.
        </p>
      </section>
    </main>,
  );
}

if (!hasPublicConfig) {
  renderStartupError('The required public Supabase environment variables are missing.');
} else {
  void import('./App')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      console.error('Pandora startup failed:', error);
      renderStartupError('A startup error occurred. Check the browser console and local server logs.');
    });
}
