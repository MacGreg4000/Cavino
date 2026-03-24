import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { Cave } from './pages/Cave';
import { WineDetail } from './pages/WineDetail';
import { PendingWines } from './pages/PendingWines';
import { CellarView } from './pages/CellarView';
import { CellarEditor } from './pages/CellarEditor';
import { Advisor } from './pages/Advisor';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';

export const router = createBrowserRouter([
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
]);
