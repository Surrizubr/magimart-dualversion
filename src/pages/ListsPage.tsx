import { useState, useEffect, useRef, useMemo } from 'react';
import { recalculateStockRates } from '@/lib/consumptionCalculator';
import { REMINDER_LIST_NAME_CONST } from '@/lib/reminderList';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { getLists, saveLists, getStock, saveStock, getHistory, saveHistory } from '@/data/mockData';
import { Plus, ShoppingCart, CheckCircle2, Archive, Trash2, ArchiveRestore, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShoppingList, ShoppingListItem, StockItem, PurchaseHistory } from '@/types';
import { ListDetailPage } from './ListDetailPage';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { getEstimatedPrice, autoFillListPrices } from '@/lib/stockHelpers';

type Filter = 'active' | 'completed' | 'archived';

interface ListsPageProps {
  onBack?: () => void;
}

export function ListsPage({ onBack }: ListsPageProps) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<Filter>('active');
  const [showNewList, setShowNewList] = useState(false);
  const [newName, setNewName] = useState('');
  const [lists, setLists] = useState<ShoppingList[]>(() => getLists());
  const history = useMemo(() => getHistory(), []);
  const stock = useMemo(() => getStock(), []);
  const [selectedListId, setSelectedListId] = useState<string | null>(() => localStorage.getItem('selected_list_id'));
  const selectedList = lists.find(l => l.id === selectedListId) || null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedListId]);

  useEffect(() => {
    if (selectedListId) {
      localStorage.setItem('selected_list_id', selectedListId);
    } else {
      localStorage.removeItem('selected_list_id');
    }
  }, [selectedListId]);

  // Proactively fill missing prices in active lists
  useEffect(() => {
    if (lists.length === 0) return;
    
    let anyChanged = false;
    const updatedLists = lists.map(l => {
      if (l.status === 'active' || l.status === 'shopping') {
        const updated = autoFillListPrices(l, history, stock);
        if (updated !== l) {
          anyChanged = true;
          return updated;
        }
      }
      return l;
    });

    if (anyChanged) {
      setLists(updatedLists);
      saveLists(updatedLists);
    }
  }, [history, stock]); // history and stock are stable from useMemo

  const filtered = lists.filter(l => {
    if (filter === 'active') return l.status === 'active' || l.status === 'shopping';
    if (filter === 'completed') return l.status === 'completed';
    return l.status === 'archived';
  }).sort((a, b) => {
    // "Lembrete de Compras" always on top
    if (a.name === REMINDER_LIST_NAME_CONST) return -1;
    if (b.name === REMINDER_LIST_NAME_CONST) return 1;
    return 0;
  });

  const createList = () => {
    if (!newName.trim()) return;
    const newList: ShoppingList = {
      id: Date.now().toString(), name: newName.trim(), status: 'active',
      total_items: 0, checked_items: 0, estimated_total: 0, actual_total: 0,
      created_at: new Date().toISOString().slice(0, 10), items: [],
    };
    setLists(prev => [newList, ...prev]);
    setNewName('');
    setShowNewList(false);
  };

  const handleFinishShopping = async (updatedList: ShoppingList, checkedItems: ShoppingListItem[], storeName: string) => {
    setLists(prev => prev.map(l => l.id === updatedList.id ? updatedList : l));
    
    const history = getHistory();
    checkedItems.forEach(item => {
      history.push({
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        product_name: item.product_name, category: item.category,
        quantity: item.quantity, price: item.actual_price || item.estimated_price,
        total_price: (item.actual_price || item.estimated_price) * item.quantity,
        store_name: storeName, purchase_date: new Date().toISOString().slice(0, 10),
        list_id: updatedList.id,
        scanned: false,
      });
    });

    await saveHistory(history);
    setSelectedListId(null);
  };

  useEffect(() => {
    saveLists(lists);
  }, [lists]);

  const handleUpdateList = (updatedList: ShoppingList) => {
    setLists(prev => prev.map(l => l.id === updatedList.id ? updatedList : l));
  };

  const handleSwipe = (listId: string, direction: 'left' | 'right') => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    if (direction === 'left') {
      // Delete
      setLists(prev => prev.filter(l => l.id !== listId));
      toast.success(t('listDeleted'));
    } else {
      // Right: archive or unarchive
      if (list.status === 'archived') {
        setLists(prev => prev.map(l => l.id === listId ? { ...l, status: 'active' as const } : l));
        toast.success(t('listRestored'));
      } else {
        setLists(prev => prev.map(l => l.id === listId ? { ...l, status: 'archived' as const } : l));
        toast.success(t('listArchived'));
      }
    }
  };

  if (selectedList) {
    return (
      <ListDetailPage
        list={selectedList}
        onBack={() => setSelectedListId(null)}
        onUpdateList={handleUpdateList}
        onFinishShopping={handleFinishShopping}
      />
    );
  }

  const filters: { id: Filter; label: string; icon?: typeof ShoppingCart }[] = [
    { id: 'active', label: t('active'), icon: ShoppingCart },
    { id: 'completed', label: t('completed'), icon: CheckCircle2 },
    { id: 'archived', label: t('archive'), icon: Archive },
  ];

  return (
    <div className="pb-20">
      <PageHeader
        title={t('shoppingLists')}
        subtitle={t('organizePurchases')}
        onBack={onBack}
        action={
          <button onClick={() => setShowNewList(true)} className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-elevated">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex gap-2">
          {filters.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filter === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Swipe hint */}
        <p className="text-[10px] text-muted-foreground text-center">
          {t('swipeListHint')}
        </p>

        {/* New List Form */}
        <AnimatePresence>
          {showNewList && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t('listNamePlaceholder')}
                  className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && createList()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={createList} className="gradient-primary text-primary-foreground border-0">
                    {t('createList')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewList(false)}>
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lists */}
        <motion.div layout className="space-y-3">
          {filtered.map((l, i) => (
            <SwipeableListCard
              key={l.id}
              list={l}
              index={i}
              history={history}
              stock={stock}
              onSelect={() => setSelectedListId(l.id)}
              onSwipe={(dir) => handleSwipe(l.id, dir)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('noListsFound')}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

interface SwipeableListCardProps {
  key?: string | number;
  list: ShoppingList;
  index: number;
  history: PurchaseHistory[];
  stock: StockItem[];
  onSelect: () => void;
  onSwipe: (dir: 'left' | 'right') => void;
}

function SwipeableListCard({
  list,
  index,
  history,
  stock,
  onSelect,
  onSwipe,
}: SwipeableListCardProps) {
  const { lang, t, formatCurrency: fc } = useLanguage();
  const [dragX, setDragX] = useState(0);
  const threshold = 100;

  const estimatedTotal = useMemo(() => {
    return list.items.reduce((total, item) => {
      const price = item.estimated_price || getEstimatedPrice(item.product_name, history, stock);
      return total + (price * item.quantity);
    }, 0);
  }, [list.items, history, stock]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -threshold) {
      onSwipe('left');
    } else if (info.offset.x > threshold) {
      onSwipe('right');
    }
    setDragX(0);
  };

  const bgLeft = dragX < -30 ? 'bg-destructive' : 'bg-transparent';
  const bgRight = dragX > 30 ? 'bg-primary' : 'bg-transparent';

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background hints */}
      <div className={`absolute inset-y-0 left-0 w-full flex items-center justify-end pr-4 rounded-xl ${bgLeft} transition-colors`}>
        {dragX < -30 && <Trash2 className="w-5 h-5 text-destructive-foreground" />}
      </div>
      <div className={`absolute inset-y-0 right-0 w-full flex items-center justify-start pl-4 rounded-xl ${bgRight} transition-colors`}>
        {dragX > 30 && (
          list.status === 'archived'
            ? <ArchiveRestore className="w-5 h-5 text-primary-foreground" />
            : <Archive className="w-5 h-5 text-primary-foreground" />
        )}
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDrag={(_, info) => setDragX(info.offset.x)}
        onDragEnd={handleDragEnd}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        onClick={onSelect}
        className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:shadow-elevated transition-shadow relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <p className="text-sm font-bold text-foreground">{list.name}</p>
              {estimatedTotal > 0 && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                    <Calculator className="w-2.5 h-2.5" />
                    {t('estimated')}
                  </span>
                  <span className="text-sm font-bold text-primary">{fc(estimatedTotal)}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {list.status === 'shopping' ? `${t('inShopping')} · ` : ''}
              {list.checked_items}/{list.total_items} {t('items').toLowerCase()}
            </p>
          </div>
        </div>
        <div className="mt-3 w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full gradient-primary transition-all"
            style={{ width: `${list.total_items ? (list.checked_items / list.total_items) * 100 : 0}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
}
