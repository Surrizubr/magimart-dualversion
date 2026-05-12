import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { getStock, saveStock, getHistory, saveHistory } from '@/data/mockData';
import { Plus, Minus, Search, Pencil, ShoppingCart, Sparkles } from 'lucide-react';
import { StockItem } from '@/types';
import { recalculateAllConsumptionRates } from '@/lib/consumptionCalculator';
import { computeDaysLeft, deriveStatus, refreshStockStatuses, syncLastPurchaseDates, daysSincePurchase, sortByCriticality } from '@/lib/stockHelpers';
import { SwipeableRow } from '@/components/SwipeableRow';
import { addToReminderList } from '@/lib/reminderList';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { AddStockItemDialog, AddStockItemResult } from '@/components/AddStockItemDialog';
import { PurchaseHistory } from '@/types';
import { updateProductCategorySync } from '@/lib/dataSync';
import { useSubscription } from '@/hooks/useSubscription';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type StatusFilter = 'all' | 'critical' | 'low' | 'ok';

const statusConfig: Record<string, { label: string; dot: string; class: string }> = {
  critical: { label: 'critical', dot: 'bg-destructive', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  low: { label: 'low', dot: 'bg-warning', class: 'bg-warning/20 text-warning-dark dark:text-warning border-warning/30' },
  ok: { label: 'ok', dot: 'bg-primary', class: 'bg-accent text-accent-foreground border-primary/20' },
  expired: { label: 'expired', dot: 'bg-muted-foreground', class: 'bg-muted text-muted-foreground border-border' },
};

const categoryIcons: Record<string, { icon: string; key: string }> = {
  'Laticínios': { icon: '🧀', key: 'dairy' },
  'Grãos': { icon: '🛒', key: 'grains' },
  'Bebidas': { icon: '🥤', key: 'beverages' },
  'Temperos': { icon: '🧄', key: 'spices' },
  'Limpeza': { icon: '✨', key: 'cleaning' },
  'Carnes': { icon: '🥩', key: 'meats' },
  'Frutas': { icon: '🍎', key: 'fruits' },
  'Alimentos': { icon: '🛒', key: 'food' },
  'Higiene': { icon: '♥', key: 'hygiene' },
  'Hortifruti': { icon: '🥬', key: 'produce' },
  'Padaria': { icon: '🍞', key: 'bakery' },
  'Restaurante': { icon: '🍽️', key: 'restaurant' },
  'Manutenção': { icon: '🛠️', key: 'maintenance' },
  'Transporte': { icon: '🚗', key: 'transport' },
  'Outros': { icon: '📦', key: 'others' },
};

const categories = [
  'Laticínios', 'Grãos', 'Bebidas', 'Temperos', 'Limpeza',
  'Carnes', 'Frutas', 'Alimentos', 'Higiene', 'Hortifruti', 'Padaria',
  'Restaurante', 'Manutenção', 'Transporte', 'Outros',
];

interface StockPageProps {
  onBack?: () => void;
}

export function StockPage({ onBack }: StockPageProps) {
  const { lang, t, formatCurrency: fc } = useLanguage();
  const { simulateTrialExpiry } = useSubscription();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [stock, setStock] = useState<StockItem[]>(() => {
    syncLastPurchaseDates();
    recalculateAllConsumptionRates();
    refreshStockStatuses();
    return getStock();
  });
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddItem = (item: AddStockItemResult) => {
    // 🔒 Secret easter egg: TRIAL_EXPIRE triggers trial expiry simulation
    if (item.product_name.trim().toUpperCase() === 'TRIAL_EXPIRE') {
      simulateTrialExpiry();
      return;
    }

    const { price, ...stockItem } = item;
    const today = new Date().toISOString().split('T')[0];
    const enriched: StockItem = { ...stockItem, last_purchase_date: today };

    // Add to purchase history first so the calculator sees it
    const qty = stockItem.quantity || 1;
    const historyEntry: PurchaseHistory = {
      id: crypto.randomUUID(),
      product_name: stockItem.product_name,
      category: stockItem.category,
      quantity: qty,
      price: qty > 0 ? price / qty : price,
      total_price: price,
      store_name: t('manualEntry'),
      purchase_date: today,
      scanned: false,
    };
    const history = getHistory();
    history.unshift(historyEntry);
    saveHistory(history);

    const updated = [enriched, ...stock];
    saveStock(updated);
    syncLastPurchaseDates();
    recalculateAllConsumptionRates();
    refreshStockStatuses();
    setStock(getStock());

    toast.success(t('productAddedToStock'));
  };

  useEffect(() => {
    saveStock(stock);
  }, [stock]);

  // Recompute status on the fly and sort by criticality (least days left first)
  const filtered = sortByCriticality(stock.map(s => ({ ...s, status: deriveStatus(s) }))).filter(s => {
    if (search && !s.product_name.toLowerCase().includes(search.toLowerCase()) &&
        !s.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all' && s.status !== filter) return false;
    return true;
  });

  const handleUpdateCategory = async (itemId: string, newCategory: string) => {
    const item = stock.find(s => s.id === itemId);
    if (item) {
      // Synchronize across stock and history
      await updateProductCategorySync(item.product_name, newCategory);
      // Update local state by re-fetching from source
      setStock(getStock());
    }
    setEditingCategoryId(null);
    toast.success(t('categoryUpdated'));
  };

  const updateQty = (id: string, delta: number) => {
    setStock(prev => prev.map(s => s.id === id ? { ...s, quantity: Math.max(0, s.quantity + delta) } : s));
  };

  const zeroQty = (id: string) => {
    setStock(prev => prev.map(s => s.id === id ? { ...s, quantity: 0 } : s));
  };

  const deleteItem = (id: string) => {
    setStock(prev => prev.filter(s => s.id !== id));
  };

  const filters: { id: StatusFilter; label: string; dot?: string }[] = [
    { id: 'all', label: t('all') },
    { id: 'critical', label: t('critical'), dot: 'bg-destructive' },
    { id: 'low', label: t('low'), dot: 'bg-warning' },
    { id: 'ok', label: t('ok'), dot: 'bg-primary' },
  ];

  return (
    <div className="pb-20">
      <PageHeader
        title={t('stockText')}
        subtitle={`${stock.length} ${t('items').toLowerCase()}`}
        onBack={onBack}
        action={
          <button onClick={() => setShowAddDialog(true)} className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-elevated">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        }
      />

      <AddStockItemDialog open={showAddDialog} onOpenChange={setShowAddDialog} onAdd={handleAddItem} />

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-card rounded-xl border border-border pl-9 pr-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                filter === f.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Swipe hint */}
        <p className="text-[10px] text-muted-foreground text-center">
          {t('swipeStockHint')}
        </p>

        {/* Items */}
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const cfg = statusConfig[s.status];
            const daysLeft = computeDaysLeft(s);
            const sincePurchase = daysSincePurchase(s);
            const emoji = categoryIcons[s.category] || '🛒';
            const daysColor = daysLeft <= 3 ? 'text-destructive' : daysLeft <= 7 ? 'text-warning' : 'text-muted-foreground';
            return (
              <SwipeableRow
                onSwipeLeft={() => deleteItem(s.id)}
                onSwipeRight={() => addToReminderList({ product_name: s.product_name, category: s.category, unit: s.unit, last_price: s.last_price })}
                rightIcon={<ShoppingCart className="w-5 h-5 text-primary-foreground" />}
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          onClick={() => {
                            const newName = prompt(t('productName'), s.product_name);
                            if (newName && newName.trim()) {
                              s.product_name = newName.trim();
                              handleUpdateCategory(s.id, s.category);
                            }
                          }}
                          className="text-sm font-bold text-foreground flex items-center gap-1.5 hover:text-primary transition-colors"
                        >
                          {s.product_name}
                          <Pencil className="w-3 h-3 opacity-40" />
                        </button>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.class}`}>
                          {t(cfg.label)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {editingCategoryId === s.id ? (
                          <Select 
                            defaultValue={s.category} 
                            onValueChange={(val) => handleUpdateCategory(s.id, val)}
                            onOpenChange={(open) => { if (!open) setEditingCategoryId(null); }}
                          >
                            <SelectTrigger className="h-7 text-[11px] py-0 px-2 min-w-[100px] border-primary/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(c => (
                                <SelectItem key={c} value={c} className="text-[13px]">{t(c)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span 
                            onClick={() => setEditingCategoryId(s.id)}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground flex items-center gap-1 cursor-pointer hover:ring-1 ring-primary/20 transition-all`}
                          >
                            {categoryIcons[s.category]?.icon || '🛒'} {t(categoryIcons[s.category]?.key || s.category)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{s.quantity.toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { maximumFractionDigits: 3 })} {t(s.unit)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        · {t('purchased')} {sincePurchase !== null ? `${sincePurchase}d` : '—'} {t('ago')}
                      </p>
                      <p className={`text-[11px] font-medium mt-0.5 ${daysColor}`}>
                        · ~{daysLeft} {t('daysRemaining')}
                      </p>
                      {s.learned_consumption && (
                        <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {t('learnedConsumption')} ({s.purchase_count} {t('purchases')}, ~{s.avg_duration_days}d {t('perCycle')})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(s.id, -1)}
                          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4 text-secondary-foreground" />
                        </button>
                        <div className="text-center">
                          {editingQtyId === s.id ? (
                            <input
                              type="number"
                              autoFocus
                              value={editingQtyValue}
                              onChange={e => setEditingQtyValue(e.target.value)}
                              onBlur={() => {
                                const val = parseInt(editingQtyValue, 10);
                                if (!isNaN(val) && val >= 0) {
                                  setStock(prev => prev.map(item => item.id === s.id ? { ...item, quantity: val } : item));
                                }
                                setEditingQtyId(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              className="w-12 text-lg font-bold text-foreground text-center bg-transparent border-b-2 border-primary outline-none"
                            />
                          ) : (
                            <span
                              className="text-lg font-bold text-foreground cursor-pointer"
                              onClick={() => { setEditingQtyId(s.id); setEditingQtyValue(String(s.quantity)); }}
                            >
                              {s.quantity.toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { maximumFractionDigits: 3 })}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-1">{t(s.unit)}</span>
                        </div>
                        <button
                          onClick={() => updateQty(s.id, 1)}
                          className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4 text-primary-foreground" />
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t('minQuantity')}: {s.min_quantity.toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { maximumFractionDigits: 3 })} {t(s.unit)}</p>
                      <div className="flex gap-2">
                        <button onClick={() => zeroQty(s.id)} className="text-[10px] text-primary font-medium">{t('zero')}</button>
                        <button onClick={() => deleteItem(s.id)} className="text-[10px] text-destructive font-medium">{t('delete')}</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </SwipeableRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
