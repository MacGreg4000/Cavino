import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

export function AuthGuard() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Outlet />;
}
