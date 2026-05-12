import { useState, useEffect } from 'react';

export function useDevMode() {
  const [devMode, setDevModeState] = useState<boolean>(() => !!localStorage.getItem('dev-mode'));

  const setDevMode = (value: boolean) => {
    if (value) {
      localStorage.setItem('dev-mode', '1');
    } else {
      localStorage.removeItem('dev-mode');
    }
    setDevModeState(value);
  };

  // Keep state in sync across tabs
  useEffect(() => {
    const handler = () => {
      setDevModeState(!!localStorage.getItem('dev-mode'));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return { devMode, setDevMode };
}
