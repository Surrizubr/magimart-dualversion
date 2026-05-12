import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  largeText: false,
  setLargeText: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    (localStorage.getItem('app-theme') as ThemeMode) || 'light'
  );
  const [largeText, setLargeTextState] = useState(() =>
    localStorage.getItem('app-large-text') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('app-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('app-large-text', String(largeText));
    document.documentElement.classList.toggle('text-lg', largeText);
    document.documentElement.style.fontSize = largeText ? '18px' : '';
  }, [largeText]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, largeText, setLargeText: setLargeTextState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
