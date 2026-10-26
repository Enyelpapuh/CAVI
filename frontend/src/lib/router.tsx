import { createContext } from 'preact';
import { useContext, useState, useEffect, useMemo } from 'preact/hooks';

interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
  goBack: () => void;
}

const RouterContext = createContext<RouterContextType>({
  path: '/',
  navigate: () => {},
  goBack: () => {},
});

export function RouterProvider({ children }: { children: any }) {
  const [path, setPath] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || '/';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setPath(hash || '/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (to: string) => {
    window.location.hash = to;
    setPath(to);
  };

  const goBack = () => {
    window.history.back();
  };

  return (
    <RouterContext.Provider value={{ path, navigate, goBack }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  const rawPath = ctx.path || '/';
  const [pathname, search = ''] = rawPath.split('?');
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  return useMemo(
    () => ({
      ...ctx,
      pathname: pathname || '/',
      queryParams,
      search,
    }),
    [ctx.path, ctx.navigate, ctx.goBack, pathname, search, queryParams]
  );
}

