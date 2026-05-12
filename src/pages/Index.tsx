import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSubscription } from '@/hooks/useSubscription';
import { RenewalBanner } from '@/components/RenewalBanner';
import { BottomNav } from '@/components/BottomNav';
import { AppMenu } from '@/components/AppMenu';
import { HomePage } from '@/pages/HomePage';
import { ListsPage } from '@/pages/ListsPage';
import { StockPage } from '@/pages/StockPage';
import { SavingsPage } from '@/pages/SavingsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ScannerPage } from '@/pages/ScannerPage';
import { ShoppingPage } from '@/pages/ShoppingPage';
import { SharePage } from '@/pages/SharePage';
import { DevToolsPage } from '@/pages/DevToolsPage';
import { BackupPage } from '@/pages/BackupPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TabId } from '@/types';

const Index = () => {
  const { info } = useSubscription();
  const [isRestoring, setIsRestoring] = useState(() => 
    localStorage.getItem('app_is_restoring') === 'true' || 
    sessionStorage.getItem('app_is_restoring') === 'true'
  );
  const [navStack, setNavStack] = useState<TabId[]>(() => {
    try {
      const isRestoringNow = localStorage.getItem('app_is_restoring') === 'true' || 
                            sessionStorage.getItem('app_is_restoring') === 'true';
      const saved = localStorage.getItem('nav_stack');
      const parsed = saved ? JSON.parse(saved) : ['home'];
      if (isRestoringNow && !parsed.includes('backup')) {
        return [...parsed, 'backup'];
      }
      return parsed;
    } catch (e) {
      return ['home'];
    }
  });

  useEffect(() => {
    const handleRestoreChange = () => {
      const restoring = localStorage.getItem('app_is_restoring') === 'true' || 
                       sessionStorage.getItem('app_is_restoring') === 'true';
      setIsRestoring(restoring);
    };
    window.addEventListener('storage', handleRestoreChange);
    window.addEventListener('app-restore-status-change', handleRestoreChange);
    const interval = setInterval(handleRestoreChange, 500);
    return () => {
      window.removeEventListener('storage', handleRestoreChange);
      window.removeEventListener('app-restore-status-change', handleRestoreChange);
      clearInterval(interval);
    };
  }, []);

  const [navKeys, setNavKeys] = useState<Record<string, number>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInitialSubMenu, setMenuInitialSubMenu] = useState<any>(null);
  const [historyFilter, setHistoryFilter] = useState<{ date?: string; store?: string }>(() => {
    try {
      const saved = localStorage.getItem('history_filter');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Error parsing history_filter", e);
      return {};
    }
  });
  const [scannerContext, setScannerContext] = useState<{ date?: string; store?: string } | null>(null);

  const activeTab = navStack[navStack.length - 1] || 'home';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, navKeys[activeTab]]);

  useEffect(() => {
    localStorage.setItem('history_filter', JSON.stringify(historyFilter));
  }, [historyFilter]);

  useEffect(() => {
    if (isRestoring) return;
    localStorage.setItem('nav_stack', JSON.stringify(navStack));
  }, [navStack, isRestoring]);

  const navigateTo = (tab: TabId) => {
    if (tab === activeTab) {
      setNavKeys(prev => ({ ...prev, [tab]: (prev[tab] || 0) + 1 }));
      return;
    }
    setNavStack(prev => [...prev, tab]);
  };

  const goBack = () => {
    if (navStack.length > 1) {
      setNavStack(prev => prev.slice(0, -1));
    } else if (activeTab !== 'home') {
      setNavStack(['home']);
    }
  };

  const backToHome = () => {
    setNavStack(['home']);
  };

  const navigateToHistoryFiltered = (date: string, store: string) => {
    setHistoryFilter({ date, store });
    navigateTo('history');
  };

  const renderPage = () => {
    const key = navKeys[activeTab] || 0;
    
    // URGENT OVERRIDE: During restoration, we MUST stay on BackupPage to process confirmation
    // Only override if we are NOT already on the backup page to avoid remounting issues
    if (isRestoring && activeTab !== 'backup') {
      return <BackupPage key="backup-stable" onBack={goBack} />;
    }

    return (
      <ErrorBoundary>
        {(() => {
          switch (activeTab) {
            case 'home': return <HomePage displayName={info?.display_name || undefined} onNavigate={navigateTo} onOpenMenu={() => setMenuOpen(true)} />;
            case 'lists': return <ListsPage onBack={backToHome} />;
            case 'stock': return <StockPage onBack={backToHome} />;
            case 'savings': return <SavingsPage onBack={backToHome} onNavigateToHistory={navigateToHistoryFiltered} />;
            case 'history': return <HistoryPage onNavigateToScanner={(ctx) => { setScannerContext(ctx || null); navigateTo('scanner'); }} onBack={() => { setHistoryFilter({}); backToHome(); }} filterDate={historyFilter.date} filterStore={historyFilter.store} />;
            case 'reports': return <ReportsPage onBack={backToHome} onNavigate={(tab) => navigateTo(tab as TabId)} />;
            case 'scanner': return <ScannerPage initialDate={scannerContext?.date} initialStore={scannerContext?.store} onBack={() => { setScannerContext(null); goBack(); }} onNavigateToHistory={navigateToHistoryFiltered} onOpenMenu={() => { setMenuInitialSubMenu('gemini'); setMenuOpen(true); }} />;
            case 'shopping': return <ShoppingPage onNavigate={navigateTo} onBack={goBack} />;
            case 'share': return <SharePage onBack={goBack} />;
            case 'devtools': return <DevToolsPage onBack={goBack} />;
            case 'backup': return <BackupPage onBack={goBack} />;
            default: return <HomePage onNavigate={navigateTo} onOpenMenu={() => setMenuOpen(true)} />;
          }
        })()}
      </ErrorBoundary>
    );
  };

  const tabOrder: TabId[] = ['home', 'lists', 'stock', 'savings', 'history', 'reports'];

  const handleSwipe = (direction: 'left' | 'right') => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex === -1) return; // Not a swippable tab

    if (direction === 'left' && currentIndex < tabOrder.length - 1) {
      navigateTo(tabOrder[currentIndex + 1]);
    } else if (direction === 'right' && currentIndex > 0) {
      navigateTo(tabOrder[currentIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-background max-w-xl mx-auto relative overflow-x-hidden shadow-xl border-x border-border/50">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            const threshold = 50;
            if (info.offset.x < -threshold) handleSwipe('left');
            else if (info.offset.x > threshold) handleSwipe('right');
          }}
          className="touch-pan-y"
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>

      <BottomNav activeTab={activeTab} onTabChange={(tab) => { 
        if (tab !== 'history') setHistoryFilter({}); 
        if (tab === 'lists') localStorage.removeItem('selected_list_id');
        navigateTo(tab); 
      }} />

      <AppMenu open={menuOpen} onClose={() => { setMenuOpen(false); setMenuInitialSubMenu(null); }} initialSubMenu={menuInitialSubMenu} onNavigate={navigateTo} />
    </div>
  );
};

export default Index;
