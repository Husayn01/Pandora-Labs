/**
 * App Component
 * ──────────────
 * Root application component with React Router configuration.
 * Defines public routes, auth routes, and protected dashboard routes.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';

// Public pages
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import SignUpPage from '@/pages/SignUpPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

// Protected dashboard
import DashboardLayout from '@/pages/dashboard/DashboardLayout';
import DashboardHome from '@/pages/dashboard/DashboardHome';
import MyAgentsPage from '@/pages/dashboard/MyAgentsPage';
import AgentStorePage from '@/pages/dashboard/AgentStorePage';
import ChatPage from '@/pages/dashboard/ChatPage';
import OperationsPage from '@/pages/dashboard/OperationsPage';
import InsightsPage from '@/pages/dashboard/InsightsPage';
import SettingsPage from '@/pages/dashboard/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Protected dashboard routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="agents" element={<MyAgentsPage />} />
            <Route path="store" element={<AgentStorePage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
