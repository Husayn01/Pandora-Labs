import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { PlaceholderLogo } from '@/components/ui';

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#050505]"><div className="text-center"><PlaceholderLogo size={48} className="mx-auto animate-pulse" /><p className="mt-4 text-sm text-white/35">Opening your workspace…</p></div></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-[#050505] text-white">
      <a href="#dashboard-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black focus:translate-y-0">Skip to dashboard content</a>
      <Sidebar />
      <main id="dashboard-content" className="min-w-0 flex-1 overflow-x-hidden pb-24 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
