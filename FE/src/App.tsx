import React, { useEffect, useState } from 'react';
import { ExhibitionPage } from './pages/ExhibitionPage';
import { AdminPage } from './pages/AdminPage';

export const App: React.FC = () => {
  const [view, setView] = useState<'expo' | 'admin'>(() =>
    window.location.hash === '#admin' || window.location.hash === '#dashboard'
      ? 'admin'
      : 'expo'
  );

  useEffect(() => {
    const onHashChange = () => {
      setView(
        window.location.hash === '#admin' || window.location.hash === '#dashboard'
          ? 'admin'
          : 'expo'
      );
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openAdmin = () => {
    window.location.hash = 'admin';
    setView('admin');
  };

  const openExpo = () => {
    window.location.hash = '';
    setView('expo');
  };

  return view === 'admin' ? (
    <AdminPage onBackToExpo={openExpo} />
  ) : (
    <ExhibitionPage onOpenAdmin={openAdmin} />
  );
};

export default App;
