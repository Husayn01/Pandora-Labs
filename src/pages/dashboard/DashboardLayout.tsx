/**
 * Dashboard Layout
 * ─────────────────
 * Protected layout wrapper with sidebar navigation.
 * All dashboard pages render inside this layout.
 */

import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { PlaceholderLogo } from '@/components/ui';

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="text-center">
          <PlaceholderLogo size={56} className="mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-gray-500 animate-pulse font-light">Loading Pandora...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  // NOTE: Uncomment the block below once Supabase Auth is configured
  // if (!user) {
  //   return <Navigate to="/login" replace />;
  // }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
