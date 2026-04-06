import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useWineStore } from '../../stores/wine';
import { useWebSocket } from '../../hooks/useWebSocket';

export function AppLayout() {
  useWebSocket();
  const pendingCount = useWineStore((s) => s.pendingCount);

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 pb-safe">
        <Outlet />
      </main>
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
