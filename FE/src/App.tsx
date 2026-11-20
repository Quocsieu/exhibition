import React, { useCallback, useEffect, useState } from 'react';
import { ExhibitionPage } from './pages/ExhibitionPage';
import { AdminPage } from './pages/AdminPage';
import { DynamicExhibitionPage } from './pages/DynamicExhibitionPage';
import { AdminV28Page } from './pages/AdminV28Page';

interface ParsedRoute {
  view: 'expo' | 'admin' | 'admin_v28' | 'dynamic';
  adminBoothId: string | null;
  previewBoothId?: string | null;
}

function parseCurrentLocation(): ParsedRoute {
  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '/';

  // 0. Dedicated V28 Admin Portal (/admin/v28 or #/admin/v28)
  if (/^#\/?admin\/v28\/?$/i.test(hash) || /^\/admin\/v28\/?$/i.test(pathname)) {
    return { view: 'admin_v28', adminBoothId: null };
  }

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

  // 3. Isolated V28 Dynamic Exhibition World (?world=dynamic)
  const worldParam = new URLSearchParams(window.location.search).get('world');
  if (worldParam === 'dynamic') {
    return { view: 'dynamic', adminBoothId: null };
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

  const openExpo = useCallback((previewBoothId: string | null = null) => {
    if (window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
    }
    window.location.hash = '';
    setRoute({ view: 'expo', adminBoothId: null, previewBoothId });
  }, []);

  const openAdminV28 = useCallback(() => {
    window.history.pushState({}, '', '/admin/v28');
    window.location.hash = '';
    setRoute({ view: 'admin_v28', adminBoothId: null });
  }, []);

  const openDynamicWorld = useCallback(() => {
    window.history.pushState({}, '', '/?world=dynamic');
    window.location.hash = '';
    setRoute({ view: 'dynamic', adminBoothId: null });
  }, []);

  return route.view === 'admin_v28' ? (
    <AdminV28Page
      onOpenDynamicWorld={openDynamicWorld}
      onOpenLegacyAdmin={() => {
        window.history.pushState({}, '', '/admin');
        setRoute({ view: 'admin', adminBoothId: null });
      }}
    />
  ) : route.view === 'admin' ? (
    <AdminPage
      initialBoothId={route.adminBoothId}
      onNavigateBoothSlots={openAdmin}
      onBackToExpo={openExpo}
    />
  ) : route.view === 'dynamic' ? (
    <DynamicExhibitionPage onOpenAdmin={openAdminV28} />
  ) : (
    <ExhibitionPage
      initialFocusBoothId={route.previewBoothId || null}
      onOpenAdmin={() => openAdmin(null)}
    />
  );
};

export default App;
