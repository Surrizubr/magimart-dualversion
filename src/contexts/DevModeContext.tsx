
import React, { createContext, useContext, useState, useEffect } from 'react';

interface DevModeContextType {
  devMode: boolean;
  setDevMode: (value: boolean) => void;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [devMode, setDevModeState] = useState<boolean>(() => !!localStorage.getItem('dev-mode'));

  const setDevMode = (value: boolean) => {
    if (value) {
      localStorage.setItem('dev-mode', '1');
    } else {
      localStorage.removeItem('dev-mode');
    }
    setDevModeState(value);
  };

  useEffect(() => {
    const handler = () => {
      setDevModeState(!!localStorage.getItem('dev-mode'));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <DevModeContext.Provider value={{ devMode, setDevMode }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (context === undefined) {
    throw new Error('useDevMode must be used within a DevModeProvider');
  }
  return context;
}
