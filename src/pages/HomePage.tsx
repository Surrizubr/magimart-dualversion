import { motion, AnimatePresence } from 'framer-motion';
import { getStock, getLists, getHistory, saveStock, saveLists } from '@/data/mockData';
import { Calendar, Package, AlertTriangle, ArrowRight, ChevronRight, ListChecks, Settings, Trash2, Archive, ListTodo, ShoppingCart, ScanLine, Share2, Info, CreditCard, X, MapPin } from 'lucide-react';
import { useState, useMemo } from 'react';
import { TabId, ShoppingList, StockItem } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { SwipeableRow } from '@/components/SwipeableRow';
import { addToReminderList } from '@/lib/reminderList';
import { computeDaysLeft, deriveStatus, sortByCriticality } from '@/lib/stockHelpers';
import { calculateHeatmapData, getPriceLevelForDate, PriceLevel } from '@/lib/heatmapCalculator';
import { toast } from 'sonner';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';

interface HomePageProps {
  displayName?: string;
  onNavigate: (tab: TabId) => void;
  onOpenMenu?: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function HomePage({ displayName, onNavigate, onOpenMenu }: HomePageProps) {
  const { lang, currency, formatCurrency: fc, t } = useLanguage();
  const { status, daysUntilExpiry, openPortal, openCheckout } = useSubscriptionContext();
  const [stockState, setStockState] = useState<StockItem[]>(() => getStock());
  const [listsState, setListsState] = useState<ShoppingList[]>(() => getLists());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const history = getHistory();

  const getMonthDayStores = (day: number) => {
    const dayPurchases: Record<number, any[]> = {};
    history.forEach(h => {
      const d = new Date(h.purchase_date + 'T12:00:00');
      const dayNum = d.getDate();
      (dayPurchases[dayNum] ||= []).push(h);
    });

    const items = dayPurchases[day] || [];
    const storeMap: Record<string, { total: number; count: number; date: string }> = {};
    items.forEach(h => {
      if (!storeMap[h.store_name]) {
        storeMap[h.store_name] = { total: 0, count: 0, date: h.purchase_date };
      }
      storeMap[h.store_name].total += h.total_price;
      storeMap[h.store_name].count += 1;
      if (h.purchase_date > storeMap[h.store_name].date) {
        storeMap[h.store_name].date = h.purchase_date;
      }
    });
    return Object.entries(storeMap).sort((a, b) => b[1].date.localeCompare(a[1].date));
  };

  const popupStores = selectedDay !== null ? getMonthDayStores(selectedDay) : [];

  const heatmapStats = useMemo(() => calculateHeatmapData(history), [history]);
  // Sort by criticality (least days left first), only items with <= 3 days
  const criticalStock = sortByCriticality(
    stockState
      .map(s => ({ ...s, status: deriveStatus(s) }))
      .filter(s => s.status === 'critical')
  );
  const activeLists = listsState.filter(l => l.status === 'active' || l.status === 'shopping');
  const totalMonth = useMemo(() => {
    const now = new Date().toISOString().slice(0, 7);
    return history
      .filter(h => h.purchase_date.startsWith(now))
      .reduce((sum, h) => sum + h.total_price, 0);
  }, [history]);

  const firstName = useMemo(() => {
    if (!displayName) return '';
    // If it's an email, try to get the part before @, but only if it's the only thing we have
    if (displayName.includes('@') && !displayName.includes(' ')) {
      return displayName.split('@')[0];
    }
    // Return first word if it looks like a real name
    return displayName.split(' ')[0];
  }, [displayName]);

  const handleDeleteList = (id: string) => {
    setListsState(prev => {
      const updated = prev.filter(l => l.id !== id);
      saveLists(updated);
      return updated;
    });
    toast.success(t('listDeleted'));
  };

  const handleArchiveList = (id: string) => {
    setListsState(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, status: 'archived' as const } : l);
      saveLists(updated);
      return updated;
    });
    toast.success(t('listArchived'));
  };

  const handleDeleteAlert = (id: string) => {
    setStockState(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveStock(updated);
      return updated;
    });
    toast.success(t('alertRemoved'));
  };

  const handleAddAlertToReminder = (s: StockItem) => {
    addToReminderList({ product_name: s.product_name, category: s.category, unit: s.unit, last_price: s.last_price });
    setStockState(prev => {
      const updated = prev.filter(x => x.id !== s.id);
      saveStock(updated);
      return updated;
    });
    toast.success(t('addedToShoppingList'));
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="pb-20">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-4 pt-4 pb-3"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <button onClick={onOpenMenu} className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center hover:opacity-90 transition-opacity">
              <Settings className="w-6 h-6 text-primary-foreground" />
            </button>
            <div>
              <p className="text-sm text-muted-foreground">{t('hello')}, {firstName || displayName || t('user')} 👋</p>
              <h1 className="text-xl font-bold text-foreground">Magicmart AI</h1>
              <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
            </div>
          </div>
        </div>
      </motion.header>

      {status === 'expiring' && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="px-4 mb-4"
        >
          <button 
            onClick={openPortal}
            className="w-full bg-yellow-100 border border-yellow-200 rounded-xl p-3 flex items-center gap-3 shadow-sm text-left hover:bg-yellow-200 transition-colors"
          >
            <div className="bg-yellow-500/20 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-700 shrink-0" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-yellow-800">
                Sua assinatura vence em {daysUntilExpiry} {daysUntilExpiry === 1 ? 'dia' : 'dias'}.
              </p>
              <p className="text-[10px] text-yellow-700 font-medium">
                Renove agora no portal para manter o acesso premium!
              </p>
            </div>
            <CreditCard className="w-4 h-4 text-yellow-700" />
          </button>
        </motion.div>
      )}

      <motion.div variants={container} initial="hidden" animate="show" className="px-4 space-y-5">
        {/* Stats Row */}
        <motion.div variants={item} className="flex gap-3">
          <button onClick={() => onNavigate('stock')} className="flex-1 bg-card rounded-xl border border-border p-3 text-center hover:bg-accent/50 transition-colors">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('stock')}</p>
            <p className="text-2xl font-bold text-foreground">{stockState.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{t('items')}</p>
          </button>
          <button onClick={() => onNavigate('lists')} className="flex-1 bg-card rounded-xl border border-primary/30 p-3 text-center hover:bg-accent/50 transition-colors">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">{t('lists')}</p>
            <p className="text-2xl font-bold text-primary">{activeLists.length}</p>
            <p className="text-[10px] text-primary uppercase">{t('active')}</p>
          </button>
          <button onClick={() => onNavigate('history')} className="flex-1 bg-card rounded-xl border border-border p-3 text-center hover:bg-accent/50 transition-colors">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('history')}</p>
            <p className="text-xl font-bold text-foreground">{fc(totalMonth)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{t('currentMonth')}</p>
          </button>
        </motion.div>

        {/* Action Cards - 2x2 grid */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          {/* Scanner */}
          <button
            onClick={() => onNavigate('scanner')}
            className="gradient-primary rounded-xl p-4 text-left shadow-md flex flex-col"
          >
            <ScanLine className="w-6 h-6 text-primary-foreground mb-4" />
            <p className="text-sm font-bold text-primary-foreground">{t('scan')}</p>
            <p className="text-xs text-primary-foreground/80">{t('receipt')}</p>
          </button>
          {/* Fazer Mercado */}
          <button
            onClick={() => onNavigate('shopping')}
            className="bg-card rounded-xl border border-border p-4 text-left flex flex-col"
          >
            <ShoppingCart className="w-6 h-6 text-primary mb-4" />
            <p className="text-sm font-bold text-foreground">{t('goShopping')}</p>
            <p className="text-xs text-muted-foreground">{t('addProducts')}</p>
          </button>
          {/* Nova Lista */}
          <button
            onClick={() => onNavigate('lists')}
            className="bg-white border border-border rounded-xl p-4 text-left flex flex-col"
          >
            <ListTodo className="w-6 h-6 text-green-600 mb-4" />
            <p className="text-sm font-bold text-foreground">{t('newList')}</p>
            <p className="text-xs text-muted-foreground">{t('createList')}</p>
          </button>
          {/* Compartilhar */}
          <button
            onClick={() => onNavigate('share')}
            className="bg-card rounded-xl border border-border p-4 text-left flex flex-col"
          >
            <Share2 className="w-6 h-6 text-primary mb-4" />
            <p className="text-sm font-bold text-foreground">{t('share')}</p>
            <p className="text-xs text-muted-foreground">{t('activeLists')}</p>
          </button>
        </motion.div>

        {/* Dias mais baratos banner */}
        <motion.div variants={item}>
          <button
            onClick={() => onNavigate('savings')}
            className="w-full rounded-xl p-4 flex items-center justify-between border-2 border-yellow-600/20"
            style={{ backgroundColor: 'hsl(48, 100%, 90%)' }}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-yellow-700" />
              <span className="text-sm font-semibold text-yellow-800">{t('cheapDays')}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-yellow-700" />
          </button>
        </motion.div>

        {/* Listas Ativas */}
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-bold text-foreground tracking-tight">{t('activeListsTitle')}</h2>
            </div>
            <button onClick={() => onNavigate('lists')} className="text-xs text-primary font-medium flex items-center gap-0.5">
              {t('seeAll')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <button 
            onClick={() => onNavigate('lists')}
            className="w-full text-left bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mb-4 flex items-start gap-3 shadow-sm hover:bg-amber-100/50 transition-colors"
          >
            <div className="bg-amber-500/10 p-2 rounded-xl">
              <Info className="w-5 h-5 text-amber-600 shrink-0" />
            </div>
            <p className="text-xs text-amber-800/80 leading-relaxed font-medium">
              {t('activeListsBanner')}
            </p>
          </button>
          {activeLists.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('noActiveLists')}</p>
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: 'thin' }}>
              {activeLists.slice(0, 5).map(l => (
                <SwipeableRow
                  onSwipeLeft={() => handleDeleteList(l.id)}
                  onSwipeRight={() => handleArchiveList(l.id)}
                  rightIcon={<Archive className="w-5 h-5 text-primary-foreground" />}
                >
                  <button
                    onClick={() => onNavigate('lists')}
                    className="w-full bg-card rounded-xl border border-border p-4 flex items-center gap-3 text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <ListChecks className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.items.length} {t('items')} · {fc(l.estimated_total)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </SwipeableRow>
              ))}
            </div>
          )}
        </motion.div>

        {/* Alertas */}
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h2 className="text-sm font-bold text-foreground tracking-tight">{t('alerts')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onNavigate('stock')} className="text-xs text-primary font-medium flex items-center gap-0.5">
                {t('seeAll')} <ArrowRight className="w-3 h-3" />
              </button>
              {criticalStock.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {criticalStock.length}
                </span>
              )}
            </div>
          </div>

          <button 
            onClick={() => onNavigate('stock')}
            className="w-full text-left bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mb-4 flex items-start gap-3 shadow-sm hover:bg-amber-100/50 transition-colors"
          >
            <div className="bg-amber-500/10 p-2 rounded-xl">
              <Info className="w-5 h-5 text-amber-600 shrink-0" />
            </div>
            <p className="text-xs text-amber-800/80 leading-relaxed font-medium">
              {t('alertsBanner')}
            </p>
          </button>
          {criticalStock.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('stockUpToDate')}</p>
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: 'thin' }}>
              {criticalStock.slice(0, 5).map(s => {
                const daysLeft = computeDaysLeft(s);
                const isCritical = daysLeft <= 3;
                return (
                  <SwipeableRow
                    onSwipeLeft={() => handleDeleteAlert(s.id)}
                    onSwipeRight={() => handleAddAlertToReminder(s)}
                    rightIcon={<ShoppingCart className="w-5 h-5 text-primary-foreground" />}
                  >
                    <div className="bg-card rounded-xl border border-border p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCritical ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                          <AlertTriangle className={`w-4 h-4 ${isCritical ? 'text-destructive' : 'text-warning'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground uppercase">{s.product_name}</p>
                          <p className={`text-xs font-semibold ${isCritical ? 'text-destructive' : 'text-warning'}`}>~{daysLeft} {t('daysLeft')}</p>
                          <p className="text-xs text-muted-foreground">{t('stock')}: {s.quantity.toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { maximumFractionDigits: 3 })} {t(s.unit)}</p>
                        </div>
                      </div>
                    </div>
                  </SwipeableRow>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Dias mais baratos */}
        <motion.div variants={item} className="bg-card rounded-2xl border border-border p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
              <Calendar className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-sm font-bold text-foreground tracking-tight leading-tight">
                Dias mais baratos
              </h2>
            </div>
            <button 
              onClick={() => onNavigate('savings')} 
              className="text-xs text-primary font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              {t('savings')}
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Calendar Grid - Simple 1-31 grid as in SavingsPage */}
            <div className="grid grid-cols-7 gap-2 px-1">
              {(() => {
                const dayPurchases: Record<number, any[]> = {};
                history.forEach(h => {
                  const d = new Date(h.purchase_date + 'T12:00:00');
                  const day = d.getDate();
                  (dayPurchases[day] ||= []).push(h);
                });

                const monthData = Array.from({ length: 31 }, (_, i) => {
                  const items = dayPurchases[i + 1] || [];
                  const uniqueStores = new Set(items.map(h => h.store_name)).size;
                  let level = 0;
                  if (uniqueStores >= 3) level = 1;
                  else if (uniqueStores === 2) level = 2;
                  else if (uniqueStores === 1) level = 3;
                  return { day: i + 1, level, storeCount: uniqueStores };
                });

                const getLevelColor = (level: number) => {
                  switch (level) {
                    case 0: return 'bg-primary/20';
                    case 1: return 'bg-destructive/60';
                    case 2: return 'bg-orange-200 dark:bg-orange-900/40 text-orange-900 dark:text-orange-100'; // Caro
                    case 3: return 'bg-primary/40'; // Barato
                    default: return 'bg-primary/20';
                  }
                };

                return monthData.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => d.storeCount > 0 && setSelectedDay(d.day)}
                    className="flex flex-col items-center gap-1 group"
                    disabled={d.storeCount === 0}
                  >
                    <span className="text-[10px] text-muted-foreground">{d.day}</span>
                    <div className={`w-full aspect-square rounded-lg ${getLevelColor(d.level)} flex items-center justify-center transition-transform ${d.storeCount > 0 ? 'cursor-pointer group-hover:scale-110 group-active:scale-95' : ''}`}>
                      {d.storeCount > 0 && <span className="text-[10px] font-bold text-foreground">{d.storeCount}</span>}
                    </div>
                  </button>
                ));
              })()}
            </div>

            {/* Legend - Matching SavingsPage */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 px-1 pt-4 border-t border-border/40">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/80" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight font-sans">{t('veryCheap')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/40" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight font-sans">{t('cheap')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/20" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight font-sans">{t('ok')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-200 dark:bg-orange-900/40" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight font-sans">{t('expensive')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-destructive/60" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight font-sans">{t('veryExpensive')}</span>
              </div>
            </div>
          </div>

          {/* Contextual Store Popup */}
          <AnimatePresence>
            {selectedDay !== null && popupStores.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 z-50 bg-card p-4 flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <h2 className="text-sm font-bold text-foreground tracking-tight leading-tight">
                        Dias mais baratos
                      </h2>
                      <p className="text-[10px] text-muted-foreground">
                        Dia {selectedDay} · {t('locationsVisited').replace('{count}', String(popupStores.length))}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"
                  >
                    <X className="w-4 h-4 text-secondary-foreground" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {popupStores.map(([store, info]) => (
                    <button
                      key={store}
                      onClick={() => {
                        onNavigate('history');
                        setSelectedDay(null);
                      }}
                      className="w-full flex items-center gap-3 bg-secondary/50 hover:bg-secondary rounded-xl p-3 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{store}</p>
                        <p className="text-xs text-muted-foreground">
                          {info.count} {info.count === 1 ? t('item') : t('items')} · {fc(info.total)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        {/* Heatmap Info Banner */}
        <motion.div
          variants={item}
          className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex gap-3 items-start"
        >
          <div className="bg-amber-500/10 p-2 rounded-xl">
            <Info className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-xs text-amber-800/80 leading-relaxed font-medium">
            {t('heatmapInfoBanner')}
          </p>
        </motion.div>
      </motion.div>

    </div>
  );
}
