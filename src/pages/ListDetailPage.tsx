import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingList, ShoppingListItem, StockItem } from '@/types';
import { ArrowLeft, Plus, ShoppingCart, CheckCircle, CheckCircle2, Trash2, MapPin, Loader2, Search, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { PermissionGate } from '@/components/PermissionGate';
import { getStock, getHistory } from '@/data/mockData';
import { deriveStatus, getEstimatedPrice } from '@/lib/stockHelpers';

interface ListDetailPageProps {
  list: ShoppingList;
  onBack: () => void;
  onUpdateList: (list: ShoppingList) => void;
  onFinishShopping: (list: ShoppingList, checkedItems: ShoppingListItem[], storeName: string) => void;
}

export function ListDetailPage({ list, onBack, onUpdateList, onFinishShopping }: ListDetailPageProps) {
  const { lang, t, currency, formatCurrency: fc } = useLanguage();
  const [items, setItems] = useState<ShoppingListItem[]>(list.items);
  const history = useMemo(() => getHistory(), []);
  const stock = useMemo(() => getStock(), []);
  
  const [showAddItem, setShowAddItem] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnit, setNewUnit] = useState('un');
  const [newPrice, setNewPrice] = useState('');
  const [shoppingMode, setShoppingMode] = useState(list.status === 'shopping');
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [showLocationGate, setShowLocationGate] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const stockSuggestions = useMemo(() => {
    const existingNames = new Set(items.map(item => item.product_name.toLowerCase()));
    
    return stock
      .filter(s => !existingNames.has(s.product_name.toLowerCase()))
      .map(s => ({ ...s, status: deriveStatus(s) }))
      .sort((a, b) => {
        const order = { critical: 0, low: 1, ok: 2 };
        const statusA = a.status === 'expired' ? 'critical' : a.status;
        const statusB = b.status === 'expired' ? 'critical' : b.status;
        return (order[statusA as keyof typeof order] ?? 3) - (order[statusB as keyof typeof order] ?? 3);
      }).slice(0, 20);
  }, [items]);

  const filteredSuggestions = useMemo(() => {
    if (!newProduct) return stockSuggestions;
    return stockSuggestions.filter(s => s.product_name.toLowerCase().includes(newProduct.toLowerCase()));
  }, [newProduct, stockSuggestions]);

  useEffect(() => {
    const updatedList: ShoppingList = {
      ...list,
      items,
      total_items: items.length,
      checked_items: items.filter(i => i.is_checked).length,
    };
    onUpdateList(updatedList);
  }, [items]);

  const sorted = useMemo(() => {
    if (!shoppingMode) return items;
    const unchecked = items.filter(i => !i.is_checked);
    const checked = items.filter(i => i.is_checked);
    return [...unchecked, ...checked];
  }, [items, shoppingMode]);

  const toggleItem = (id: string) => {
    if (!shoppingMode) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_checked: !i.is_checked } : i));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success(t('itemRemoved'));
  };

  const addItem = () => {
    if (!newProduct.trim()) return;
    const priceFromHistory = getEstimatedPrice(newProduct.trim(), history, stock);
    
    const newItem: ShoppingListItem = {
      id: Date.now().toString(),
      list_id: list.id,
      product_name: newProduct.trim(),
      category: t('general'),
      quantity: parseFloat(newQty) || 1,
      unit: newUnit,
      estimated_price: parseFloat(newPrice) || priceFromHistory || 0,
      actual_price: 0,
      is_checked: false,
    };
    setItems(prev => [newItem, ...prev]);
    setNewProduct('');
    setNewQty('1');
    setNewPrice('');
    setShowAddItem(false);
  };

  const handleToggleMode = () => {
    const newMode = !shoppingMode;
    setShoppingMode(newMode);
    const updatedList: ShoppingList = {
      ...list,
      items,
      total_items: items.length,
      status: newMode ? 'shopping' : 'active',
    };
    onUpdateList(updatedList);
    if (newMode) {
      toast.info(t('finishShoppingPrompt'));
    }
  };

  const handleEncerrarClick = () => {
    const checkedItems = items.filter(i => i.is_checked);
    if (checkedItems.length === 0) {
      toast.warning(t('selectAtLeastOne'));
      return;
    }
    setShowStoreDialog(true);
  };

  const handleGeoLocation = () => {
    setShowLocationGate(true);
  };

  const executeGeoLocation = () => {
    setShowLocationGate(false);
    setGeoLoading(true);
    
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(t('locationError'));
      setGeoLoading(false);
      return;
    }

    const options = {
      timeout: 10000,
      enableHighAccuracy: false,
      maximumAge: 60000
    };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
            { 
              headers: { 
                'Accept-Language': lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-US',
                'User-Agent': 'MagicmartAI/1.0'
              } 
            }
          );
          if (!res.ok) throw new Error("OSM API error");
          
          const data = await res.json();
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.street || '';
          const number = addr.house_number || '';
          const shop = addr.shop || addr.supermarket || addr.building || addr.commercial || addr.mall || addr.marketplace || '';
          
          let name = '';
          if (shop) name = shop;
          if (road) name += (name ? ' - ' : '') + road;
          if (number) name += ', ' + number;
          
          if (!name.trim()) name = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          setStoreName(name.trim());
          toast.success(t('locationObtained'));
        } catch (err) {
          console.error("Geocoding Error:", err);
          setStoreName(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
          toast.info(t('coordsSaved'));
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        console.error("Geolocation Error:", err);
        setGeoLoading(false);
        toast.error(t('locationError'));
      },
      options
    );
  };

  const confirmEncerrar = () => {
    if (!storeName.trim()) {
      toast.error(t('enterLocation'));
      return;
    }
    const checkedItems = items.filter(i => i.is_checked);
    const uncheckedItems = items.filter(i => !i.is_checked);

    onFinishShopping(list, checkedItems, storeName.trim());
    setShowStoreDialog(false);
    setStoreName('');

    if (uncheckedItems.length === 0) {
      const updatedList: ShoppingList = {
        ...list,
        items: [],
        total_items: 0,
        checked_items: 0,
        status: 'completed',
      };
      onUpdateList(updatedList);
      toast.success(t('shoppingEnded'));
      onBack();
    } else {
      const resetItems = uncheckedItems.map(i => ({ ...i, is_checked: false }));
      const updatedList: ShoppingList = {
        ...list,
        items: resetItems,
        total_items: resetItems.length,
        checked_items: 0,
        status: 'shopping',
      };
      setItems(resetItems);
      onUpdateList(updatedList);
      toast.success(t('itemsAddedRemaining').replace('{count}', String(checkedItems.length)).replace('{remaining}', String(uncheckedItems.length)));
    }
  };

  const checkedCount = items.filter(i => i.is_checked).length;

  const estimatedTotal = useMemo(() => {
    return items.reduce((total, item) => {
      const price = item.estimated_price || getEstimatedPrice(item.product_name, history, stock);
      return total + (price * item.quantity);
    }, 0);
  }, [items, history, stock]);

  return (
    <div className="pb-20">
      <PermissionGate 
        isOpen={showLocationGate} 
        type="location" 
        onAllow={executeGeoLocation} 
        onCancel={() => setShowLocationGate(false)} 
      />
      <PageHeader
        title={list.name}
        subtitle={shoppingMode ? `${checkedCount}/${items.length} ${t('selected')}` : `${items.length} ${t('items').toLowerCase()}`}
        onBack={onBack}
      />

      <div className="p-4 space-y-3">
        {/* Total Estimated display */}
        {estimatedTotal > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex justify-between items-center bg-gradient-to-br from-card to-secondary/30">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calculator className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{t('estimatedTotalLabel')}</span>
            </div>
            <span className="text-lg font-bold text-primary">{fc(estimatedTotal)}</span>
          </div>
        )}

        {/* Add item button - only if not in shopping mode */}
        {!shoppingMode && (
          <Button size="sm" onClick={() => setShowAddItem(true)} className="gradient-primary text-primary-foreground border-0 w-full">
            <Plus className="w-4 h-4 mr-1" /> {t('addItem')}
          </Button>
        )}

        {/* Add item form */}
        <AnimatePresence>
          {showAddItem && !shoppingMode && (
            <>
              {showSuggestions && <div className="fixed inset-0 z-10" onClick={() => setShowSuggestions(false)} />}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden relative z-20"
              >
              <div className="bg-card rounded-lg shadow-card p-4 space-y-3">
                <div className="relative">
                  <input
                    value={newProduct}
                    onChange={e => {
                      setNewProduct(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder={t('productNamePlaceholder')}
                    className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        addItem();
                      }
                    }}
                  />
                  {showSuggestions && (
                    <div className="relative z-10 mt-2 bg-secondary/30 rounded-lg border border-border/50 overflow-y-auto max-h-[40vh] shadow-inner transition-all">
                      {filteredSuggestions.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setNewProduct(s.product_name);
                            setNewUnit(s.unit);
                            setNewPrice(s.last_price?.toString() || '');
                            setShowSuggestions(false);
                          }}
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent border-b border-border/30 last:border-0 flex items-center justify-between"
                        >
                          <span className="font-medium text-foreground">{s.product_name}</span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            s.status === 'critical' || s.status === 'expired' ? 'bg-destructive/10 text-destructive' : 
                            s.status === 'low' ? 'bg-amber-500/10 text-amber-600' : 
                            'bg-primary/10 text-primary'
                          }`}>
                            {t(s.status)}
                          </span>
                        </button>
                      ))}
                      {filteredSuggestions.length === 0 && newProduct.length > 0 && (
                        <p className="px-4 py-3 text-xs text-muted-foreground text-center">{t('noResults')}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newQty}
                    onChange={e => setNewQty(e.target.value)}
                    placeholder={t('qtyLabel')}
                    type="number"
                    className="w-16 bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 ring-primary/30"
                  />
                  <select
                    value={newUnit}
                    onChange={e => setNewUnit(e.target.value)}
                    className="bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 ring-primary/30"
                  >
                    <option value="un">un</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                  </select>
                  <input
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    placeholder={t('price')}
                    type="number"
                    step="0.01"
                    className="w-24 bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addItem} className="gradient-primary text-primary-foreground border-0">{t('add')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddItem(false)}>{t('cancel')}</Button>
                </div>
              </div>
            </motion.div>
          </>
          )}
        </AnimatePresence>

        {/* Items list */}
        <div className="space-y-1.5">
          <AnimatePresence>
            {sorted.map(item => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.2 }}
                onClick={() => toggleItem(item.id)}
                className={`bg-card rounded-lg shadow-card p-3 flex items-center gap-3 ${shoppingMode ? 'cursor-pointer' : ''} transition-all ${
                  item.is_checked && shoppingMode ? 'opacity-50 ring-1 ring-primary/20' : ''
                }`}
              >
                {shoppingMode && (
                  <Checkbox
                    checked={item.is_checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-card-foreground ${item.is_checked && shoppingMode ? 'line-through' : ''}`}>
                    {item.product_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit}
                    {(() => {
                      const estPrice = item.estimated_price || getEstimatedPrice(item.product_name, history, stock);
                      if (estPrice > 0) {
                        return (
                          <span className="flex items-center gap-1 mt-1 font-medium text-primary">
                            <Calculator className="w-2.5 h-2.5" />
                            {fc(estPrice * item.quantity)}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground mr-1">{t(item.category)}</span>
                {!shoppingMode && (
                  <button
                    onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                    className="shrink-0 w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('emptyList')}</p>
          )}
        </div>

        {/* Salvar/Editar Button */}
        {items.length > 0 && (
          <Button
            onClick={handleToggleMode}
            variant={shoppingMode ? "outline" : "default"}
            className={`w-full h-12 text-base font-semibold ${!shoppingMode ? 'gradient-primary text-primary-foreground border-0' : 'bg-card border-primary text-primary hover:bg-primary/5'}`}
          >
            {shoppingMode ? <Plus className="w-5 h-5 mr-2" /> : <ShoppingCart className="w-5 h-5 mr-2" />}
            {shoppingMode ? t('editList') : t('saveList')}
          </Button>
        )}

        {/* Encerrar Compras - only when "saved" (shoppingMode) */}
        {shoppingMode && (
          <div className="space-y-2 pt-2">
            <Button
              onClick={handleEncerrarClick}
              className="w-full bg-amber-600 hover:bg-amber-700 text-primary-foreground border-0 h-12 text-base font-semibold shadow-lg"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              {t('endShopping')} ({checkedCount}/{items.length})
            </Button>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3 shadow-sm">
              <div className="bg-amber-500/10 p-1.5 rounded-lg shrink-0">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 font-medium italic">
                {t('endShoppingBanner')}
              </p>
            </div>
          </div>
        )}

        {/* Store location dialog */}
        <AnimatePresence>
          {showStoreDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4"
              onClick={() => setShowStoreDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-card rounded-xl border border-border p-5 w-full max-w-sm space-y-4 shadow-xl"
              >
                <h3 className="text-base font-bold text-card-foreground">{t('shoppingLocation')}</h3>
                <p className="text-xs text-muted-foreground">{t('wherePurchased')}</p>
                <input
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder={t('storePlaceholder')}
                  className="w-full p-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  autoFocus
                />
                <button
                  onClick={handleGeoLocation}
                  disabled={geoLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium w-full justify-center disabled:opacity-50 cursor-pointer"
                >
                  {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {geoLoading ? t('gettingAddress') : t('useMyLocation')}
                </button>
                <div className="flex gap-2 pt-1">
                  <Button onClick={confirmEncerrar} className="flex-1 gradient-primary text-primary-foreground border-0">
                    {t('confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowStoreDialog(false)} className="flex-1">
                    {t('cancel')}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
