/**
 * App Component
 * ──────────────
 * Root application component with React Router configuration.
 * Defines public routes, auth routes, and protected dashboard routes.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';

const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignUpPage = lazy(() => import('@/pages/SignUpPage'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));
const DashboardLayout = lazy(() => import('@/pages/dashboard/DashboardLayout'));
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'));
const ChatPage = lazy(() => import('@/pages/dashboard/ChatPage'));
const OperationsPage = lazy(() => import('@/pages/dashboard/OperationsPage'));
const InsightsPage = lazy(() => import('@/pages/dashboard/InsightsPage'));
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage'));
const ApprovalsPage = lazy(() => import('@/pages/dashboard/ApprovalsPage'));
const IntegrationsPage = lazy(() => import('@/pages/dashboard/IntegrationsPage'));
const BillingPage = lazy(() => import('@/pages/dashboard/BillingPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[#050505] text-gray-500 grid place-items-center text-sm">
      Loading Pandora…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardHome />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
