import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PublicLayout } from './components/layout/PublicLayout';
import { AuthGuard } from './components/guards/AuthGuard';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Cave } from './pages/Cave';
import { WineDetail } from './pages/WineDetail';
import { PendingWines } from './pages/PendingWines';
import { CellarView } from './pages/CellarView';
import { CellarEditor } from './pages/CellarEditor';
import { Advisor } from './pages/Advisor';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { PublicWineList } from './pages/public/PublicWineList';
import { PublicWineDetail } from './pages/public/PublicWineDetail';

export const router = createBrowserRouter([
  // Page login (accessible sans auth)
  {
    path: '/login',
    element: <Login />,
  },

  // Mode public lecture seule (sans auth)
  {
    path: '/public',
    element: <PublicLayout />,
    children: [
      { index: true, element: <PublicWineList /> },
      { path: 'wine/:id', element: <PublicWineDetail /> },
    ],
  },

  // Application admin (protégée)
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/cave', element: <Cave /> },
          { path: '/cave/:id', element: <WineDetail /> },
          { path: '/pending', element: <PendingWines /> },
          { path: '/add', element: <PendingWines /> },
          { path: '/cellar', element: <CellarView /> },
          { path: '/cellar/new', element: <CellarEditor /> },
          { path: '/cellar/:id', element: <CellarView /> },
          { path: '/cellar/:id/edit', element: <CellarEditor /> },
          { path: '/advisor', element: <Advisor /> },
          { path: '/stats', element: <Stats /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
