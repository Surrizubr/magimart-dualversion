import { createContext, useContext, useState, ReactNode } from 'react';

interface PreferencesContextType {
  stockExpiryDays: number;
  setStockExpiryDays: (d: number) => void;
}

const PreferencesContext = createContext<PreferencesContextType>({
  stockExpiryDays: 30,
  setStockExpiryDays: () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [stockExpiryDays, setDays] = useState(() =>
    Number(localStorage.getItem('stock-expiry-days')) || 30
  );

  const setStockExpiryDays = (d: number) => {
    localStorage.setItem('stock-expiry-days', String(d));
    setDays(d);
  };

  return (
    <PreferencesContext.Provider value={{ stockExpiryDays, setStockExpiryDays }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
