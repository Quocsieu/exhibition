import React, { useCallback, useEffect, useState } from 'react';
import { ExhibitionPage } from './pages/ExhibitionPage';
import { AdminPage } from './pages/AdminPage';

interface ParsedRoute {
  view: 'expo' | 'admin';
  adminBoothId: string | null;
}

function parseCurrentLocation(): ParsedRoute {
  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '/';

  // 1. Check hash routes: #admin, #dashboard, #/admin/booths, #/admin/booths/:boothId/slots
  const hashSlotMatch = hash.match(/^#\/?admin\/booths\/([^/]+)(?:\/slots)?$/i);
  if (hashSlotMatch) {
    return {
      view: 'admin',
      adminBoothId: decodeURIComponent(hashSlotMatch[1]),
    };
  }
  if (
    hash === '#admin' ||
    hash === '#dashboard' ||
    hash === '#/admin' ||
    hash === '#/admin/booths'
  ) {
    return { view: 'admin', adminBoothId: null };
  }

  // 2. Check pathname routes: /admin, /admin/booths, /admin/booths/:boothId, /admin/booths/:boothId/slots
  const pathSlotMatch = pathname.match(/^\/admin\/booths\/([^/]+)(?:\/slots)?\/?$/i);
  if (pathSlotMatch) {
    return {
      view: 'admin',
      adminBoothId: decodeURIComponent(pathSlotMatch[1]),
    };
  }
  if (/^\/admin(?:\/booths)?\/?$/i.test(pathname)) {
    return { view: 'admin', adminBoothId: null };
  }

  return { view: 'expo', adminBoothId: null };
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<ParsedRoute>(() => parseCurrentLocation());

  useEffect(() => {
    const syncRoute = () => {
      setRoute(parseCurrentLocation());
    };
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const openAdmin = useCallback((boothId: string | null = null) => {
    if (boothId) {
      window.location.hash = `/admin/booths/${encodeURIComponent(boothId)}/slots`;
      setRoute({ view: 'admin', adminBoothId: boothId });
    } else {
      window.location.hash = '/admin/booths';
      setRoute({ view: 'admin', adminBoothId: null });
    }
  }, []);

  const openExpo = useCallback(() => {
    if (window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
    }
    window.location.hash = '';
    setRoute({ view: 'expo', adminBoothId: null });
  }, []);

  return route.view === 'admin' ? (
    <AdminPage
      initialBoothId={route.adminBoothId}
      onNavigateBoothSlots={openAdmin}
      onBackToExpo={openExpo}
    />
  ) : (
    <ExhibitionPage onOpenAdmin={() => openAdmin(null)} />
  );
};

export default App;
