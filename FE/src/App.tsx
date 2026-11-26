import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';

const ExhibitionPage = lazy(() =>
  import('./pages/ExhibitionPage').then((m) => ({ default: m.ExhibitionPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);
const DynamicExhibitionPage = lazy(() =>
  import('./pages/DynamicExhibitionPage').then((m) => ({ default: m.DynamicExhibitionPage }))
);
const AdminV28Page = lazy(() =>
  import('./pages/AdminV28Page').then((m) => ({ default: m.AdminV28Page }))
);

const RouteLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    style={{
      width: '100vw',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #003d82 0%, #0f172a 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
    }}
  >
    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
      Đang tải Grand Expo World V28...
    </div>
    <div style={{ fontSize: 13, color: '#bae6fd' }}>
      Đang chuẩn bị không gian triển lãm 3D
    </div>
  </div>
);

interface ParsedRoute {
  view: 'expo' | 'admin' | 'admin_v28' | 'dynamic';
  adminBoothId: string | null;
  previewBoothId?: string | null;
}

function parseCurrentLocation(): ParsedRoute {
  const hash = window.location.hash || '';
  const pathname = window.location.pathname || '/';
  const worldParam = new URLSearchParams(window.location.search).get('world');

  // 1. Legacy V27.5 Admin Portal (/v27/admin, #/v27/admin, /admin/v27, /admin/booths, /admin/booths/:id/slots)
  const hashSlotMatch = hash.match(/^#\/?(?:v27\/)?admin\/booths\/([^/]+)(?:\/slots)?$/i);
  if (hashSlotMatch) {
    return {
      view: 'admin',
      adminBoothId: decodeURIComponent(hashSlotMatch[1]),
    };
  }
  const pathSlotMatch = pathname.match(/^\/(?:v27\/)?admin\/booths\/([^/]+)(?:\/slots)?\/?$/i);
  if (pathSlotMatch) {
    return {
      view: 'admin',
      adminBoothId: decodeURIComponent(pathSlotMatch[1]),
    };
  }
  if (
    /^#\/?v27\/admin\/?$/i.test(hash) ||
    /^\/v27\/admin\/?$/i.test(pathname) ||
    /^#\/?admin\/v27\/?$/i.test(hash) ||
    /^\/admin\/v27\/?$/i.test(pathname) ||
    hash === '#/admin/booths' ||
    /^\/(?:v27\/)?admin\/booths\/?$/i.test(pathname)
  ) {
    return { view: 'admin', adminBoothId: null };
  }

  // 2. Primary V28 Admin Portal (/admin, /admin/v28, #admin, #dashboard, #/admin, #/admin/v28)
  if (
    /^#\/?admin(?:\/v28)?\/?$/i.test(hash) ||
    hash === '#admin' ||
    hash === '#dashboard' ||
    /^\/admin(?:\/v28)?\/?$/i.test(pathname)
  ) {
    return { view: 'admin_v28', adminBoothId: null };
  }

  // 3. Secondary Legacy V27.5 World (/v27, #/v27, ?world=v27 | v27_0 | v26)
  if (
    /^\/v27\/?$/i.test(pathname) ||
    /^#\/?v27\/?$/i.test(hash) ||
    worldParam === 'v27' ||
    worldParam === 'v27_0' ||
    worldParam === 'v26'
  ) {
    return { view: 'expo', adminBoothId: null };
  }

  // 4. Primary V28 Dynamic Exhibition World (default `/` and `?world=dynamic`)
  return { view: 'dynamic', adminBoothId: null };
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
      window.location.hash = `/v27/admin/booths/${encodeURIComponent(boothId)}/slots`;
      setRoute({ view: 'admin', adminBoothId: boothId });
    } else {
      window.history.pushState({}, '', '/v27/admin');
      window.location.hash = '';
      setRoute({ view: 'admin', adminBoothId: null });
    }
  }, []);

  const openExpo = useCallback((previewBoothId: string | null = null) => {
    window.history.pushState({}, '', '/v27');
    window.location.hash = '';
    setRoute({ view: 'expo', adminBoothId: null, previewBoothId });
  }, []);

  const openAdminV28 = useCallback(() => {
    window.history.pushState({}, '', '/admin');
    window.location.hash = '';
    setRoute({ view: 'admin_v28', adminBoothId: null });
  }, []);

  const openDynamicWorld = useCallback(() => {
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    setRoute({ view: 'dynamic', adminBoothId: null });
  }, []);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {route.view === 'admin_v28' ? (
        <AdminV28Page
          onOpenDynamicWorld={openDynamicWorld}
          onOpenLegacyAdmin={() => {
            window.history.pushState({}, '', '/v27/admin');
            window.location.hash = '';
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
      )}
    </Suspense>
  );
};

export default App;
