import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PublicLayout } from './components/layout/PublicLayout';
import { AuthGuard } from './components/guards/AuthGuard';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Cave } from './pages/Cave';
import { WineDetail } from './pages/WineDetail';
import { WineEdit } from './pages/WineEdit';
import { PendingWines } from './pages/PendingWines';
import { AddWine } from './pages/AddWine';
import { AddWineManual } from './pages/AddWineManual';
import { AddWineImport } from './pages/AddWineImport';
import { ScanWine } from './pages/ScanWine';
import { ScanQueue } from './pages/ScanQueue';
import { CellarView } from './pages/CellarView';
import { CellarEditor } from './pages/CellarEditor';
import { Advisor } from './pages/Advisor';
import { Stats } from './pages/Stats';
import { ConsumedWines } from './pages/ConsumedWines';
import { DrinkNow } from './pages/DrinkNow';
import { Settings } from './pages/Settings';
import { PublicWineList } from './pages/public/PublicWineList';
import { PublicWineDetail } from './pages/public/PublicWineDetail';
import { Display3D } from './pages/public/Display3D';
import { Display3DWineDetail } from './pages/public/Display3DWineDetail';

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

  // Vue "Cover Flow" plein écran pour tablette murale (sans auth) — hors
  // PublicLayout volontairement : pas de header ni de contrainte de largeur,
  // c'est un kiosque plein écran, pas une page de navigation classique.
  {
    path: '/public/display3d',
    element: <Display3D />,
  },

  // Fiche vin en mode paysage, dans l'esthétique Cover Flow (depuis Display3D)
  {
    path: '/public/display3d/wine/:id',
    element: <Display3DWineDetail />,
  },

  // Application admin (protégée)
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/drink-now', element: <DrinkNow /> },
          { path: '/cave', element: <Cave /> },
          { path: '/cave/:id', element: <WineDetail /> },
          { path: '/cave/:id/edit', element: <WineEdit /> },
          { path: '/pending', element: <PendingWines /> },
          { path: '/add', element: <AddWine /> },
          { path: '/add/manual', element: <AddWineManual /> },
          { path: '/add/import', element: <AddWineImport /> },
          { path: '/scan', element: <ScanWine /> },
          { path: '/scan/queue', element: <ScanQueue /> },
          { path: '/cellar', element: <CellarView /> },
          { path: '/cellar/new', element: <CellarEditor /> },
          { path: '/cellar/:id', element: <CellarView /> },
          { path: '/cellar/:id/edit', element: <CellarEditor /> },
          { path: '/advisor', element: <Advisor /> },
          { path: '/stats', element: <Stats /> },
          { path: '/historique', element: <ConsumedWines /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
