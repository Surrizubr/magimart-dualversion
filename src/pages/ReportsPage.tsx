import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { getHistory } from '@/data/mockData';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, LineChart, Line, LabelList } from 'recharts';
import { TrendingUp, BarChart3, ShoppingCart, Clock, Calendar, MapPin, ExternalLink, PieChart as PieChartIcon, Tag, Store, Bus, Wrench, Utensils, Building2, Navigation } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CATEGORY_COLORS = [
  'hsl(152, 60%, 42%)',
  'hsl(38, 90%, 50%)',
  'hsl(210, 70%, 50%)',
  'hsl(340, 60%, 55%)',
  'hsl(270, 50%, 55%)',
  'hsl(0, 70%, 50%)',
  'hsl(190, 70%, 45%)',
  'hsl(25, 80%, 55%)',
  'hsl(160, 50%, 50%)',
];

// Category merge map
const CATEGORY_MERGE: Record<string, string> = {
  'Frutas': 'Hortifruti',
  'Verduras': 'Hortifruti',
  'Legumes': 'Hortifruti',
  'Hortifruti': 'Hortifruti',
  'Temperos': 'Alimentos',
  'Grãos': 'Alimentos',
  'Padaria': 'Alimentos',
  'Doces': 'Alimentos',
  'Restaurante': 'Restaurante',
  'Restaurantes': 'Restaurante',
  'Restaurant': 'Restaurante',
  'Restaurants': 'Restaurante',
  'Alimentação fora': 'Restaurante',
  'Manutenção': 'Manutenção',
  'Maintenance': 'Manutenção',
  'Mantenimiento': 'Manutenção',
  'Carro': 'Manutenção',
  'Transporte': 'Transporte',
  'Transportes': 'Transporte',
  'Transport': 'Transporte',
  'Transportation': 'Transporte',
  'Combustível': 'Transporte',
  'Gasolina': 'Transporte',
  'Fuel': 'Transporte',
};

interface ReportsPageProps {
  onBack?: () => void;
  onNavigate?: (tab: string) => void;
}

export function ReportsPage({ onBack, onNavigate }: ReportsPageProps) {
  const { lang, t, formatCurrency: fc } = useLanguage();
  const rawHistory = getHistory();
  
  // Clean history once to avoid repeatedly checking for nulls and missing fields
  const history = useMemo(() => {
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory.filter(h => h && h.purchase_date && h.product_name);
  }, [rawHistory]);

  const [visitsOpen, setVisitsOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // Group all history by month for the month picker and evolution chart
  const monthsData = useMemo(() => {
    try {
      if (!Array.isArray(history)) return {};
      
      const acc = history.reduce<Record<string, { label: string, year: number, month: number, total: number }>>((acc, h) => {
        if (!h || !h.purchase_date) return acc;
        
        const parts = h.purchase_date.split('-');
        if (parts.length < 2) return acc;
        const yStr = parts[0];
        const mStr = parts[1].padStart(2, '0');
        const year = parseInt(yStr);
        const month = parseInt(mStr) - 1;
        const key = `${yStr}-${mStr}`;
        
        if (!acc[key]) {
          const d = new Date(year, month, 1);
          const monthLabel = isNaN(d.getTime()) 
            ? key 
            : d.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
          
          acc[key] = {
            label: monthLabel,
            year,
            month,
            total: 0
          };
        }
        acc[key].total += (h.total_price || 0);
        return acc;
      }, {});

      // Ensure current month is always present
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[currentKey]) {
        acc[currentKey] = {
          label: now.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''),
          year: now.getFullYear(),
          month: now.getMonth(),
          total: 0
        };
      }
      return acc;
    } catch (err) {
      console.error('[ReportsPage] Error computing monthsData:', err);
      return {};
    }
  }, [history, lang]);

  const sortedMonthKeys = useMemo(() => Object.keys(monthsData).sort().reverse(), [monthsData]);
  
  // Default to current month instead of just the first one with history
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Filter history based on selected month
  const filteredHistory = useMemo(() => {
    if (!selectedMonth) return history;
    return history.filter(h => h.purchase_date && h.purchase_date.startsWith(selectedMonth));
  }, [history, selectedMonth]);

  // Monthly Evolution Data
  const monthlySpending = (Object.entries(monthsData) as [string, any][])
    .map(([key, data]) => ({ 
      month: data.label, 
      value: data.total,
      key: key
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  // 1. Calculations fix
  // Total of the selected month
  const currentMonthTotal = useMemo(() => {
    return filteredHistory.reduce((sum, h) => sum + (Number(h.total_price) || 0), 0);
  }, [filteredHistory]);
  
  // Average per month calculation
  const totalSpendAllTime = useMemo(() => {
    return history.reduce((sum, h) => sum + (Number(h.total_price) || 0), 0);
  }, [history]);
  
  const totalMonthsCount = Object.keys(monthsData).length;
  const avgPerMonth = totalMonthsCount > 0 ? totalSpendAllTime / totalMonthsCount : 0;

  // Estimated Inflation Calculation
  const estimatedInflation = useMemo(() => {
    try {
      if (!selectedMonth || !Array.isArray(history)) return null;
      
      // Get previous month string
      const parts = selectedMonth.split('-');
      if (parts.length < 2) return null;
      
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const prevDate = new Date(year, month - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const productPricesCurrent: Record<string, number[]> = {};
      const productPricesPrev: Record<string, number[]> = {};

      history.forEach(h => {
        if (!h || !h.purchase_date || !h.product_name) return;
        
        const hMonth = h.purchase_date.slice(0, 7);
        const key = h.product_name.toLowerCase();
        
        if (hMonth === selectedMonth) {
          (productPricesCurrent[key] ||= []).push(h.price || 0);
        } else if (hMonth === prevMonthStr) {
          (productPricesPrev[key] ||= []).push(h.price || 0);
        } else if (!productPricesPrev[key] && hMonth < selectedMonth) {
          // As a fallback, if no direct prev month, collect all history before selected month
          (productPricesPrev[key] ||= []).push(h.price || 0);
        }
      });

      const variations: number[] = [];
      Object.keys(productPricesCurrent).forEach(key => {
        if (productPricesPrev[key] && productPricesPrev[key].length > 0) {
          const avgCurrent = productPricesCurrent[key].reduce((a, b) => a + b, 0) / productPricesCurrent[key].length;
          const avgPrev = productPricesPrev[key].reduce((a, b) => a + b, 0) / productPricesPrev[key].length;
          if (avgPrev > 0) {
            variations.push((avgCurrent - avgPrev) / avgPrev);
          }
        }
      });

      if (variations.length === 0) return null;
      return (variations.reduce((a, b) => a + b, 0) / variations.length) * 100;
    } catch (err) {
      console.error('[ReportsPage] Error computing inflation:', err);
      return null;
    }
  }, [history, selectedMonth]);

  // 2. Data for category spending (synced with selected month)
  const productCounts = useMemo(() => {
    return filteredHistory.reduce<Record<string, number>>((acc, h) => {
      const name = h.product_name || 'Desconhecido';
      acc[name] = (acc[name] || 0) + (h.quantity || 0);
      return acc;
    }, {});
  }, [filteredHistory]);

  const topProducts = useMemo(() => {
    return (Object.entries(productCounts) as [string, number][])
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .slice(0, 15);
  }, [productCounts]);

  // 3. Recent History for specifically requested cards (Last 3 Months)
  const recentHistory = useMemo(() => {
    try {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const cutoffStr = cutoff.toISOString().slice(0, 7); 
      return history.filter(h => h.purchase_date && (h.purchase_date.startsWith(cutoffStr) || h.purchase_date > cutoffStr));
    } catch (e) {
      console.error('[ReportsPage] Error computing recentHistory:', e);
      return [];
    }
  }, [history]);

  const recentProductCounts = useMemo(() => {
    return recentHistory.reduce<Record<string, number>>((acc, h) => {
      // Filter only supermarket items (excluding Restaurant, Maintenance, Transport)
      const cat = CATEGORY_MERGE[h.category || ''] || h.category;
      if (['Restaurante', 'Manutenção', 'Transporte'].includes(cat)) return acc;
      
      const name = h.product_name || 'Desconhecido';
      acc[name] = (acc[name] || 0) + (Number(h.quantity) || 0);
      return acc;
    }, {});
  }, [recentHistory]);

  const recentTopProducts = useMemo(() => {
    return (Object.entries(recentProductCounts) as [string, number][])
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .slice(0, 15);
  }, [recentProductCounts]);

  const recentVisitKeys = useMemo(() => Array.from(new Set(recentHistory.map(h => `${h.store_name || t('unknownStore')}|${h.purchase_date}`))), [recentHistory, t]);
  
  const recentStoreCounts = useMemo(() => {
    return recentVisitKeys.reduce<Record<string, { count: number; lat?: number; lng?: number }>>((acc, key: string) => {
      const parts = key.split('|');
      const store_name = parts[0] || 'Desconhecido';
      const purchase_date = parts[1] || '';
      if (!acc[store_name]) {
        const match = recentHistory.find(h => h.store_name === store_name && h.purchase_date === purchase_date);
        acc[store_name] = { count: 0, lat: match?.store_lat, lng: match?.store_lng };
      }
      acc[store_name].count++;
      return acc;
    }, {});
  }, [recentVisitKeys, recentHistory]);

  const recentTopStores = useMemo(() => {
    return (Object.entries(recentStoreCounts) as [string, { count: number }][])
      .sort((a, b) => (Number(b[1].count) || 0) - (Number(a[1].count) || 0));
  }, [recentStoreCounts]);

  // Unique visits (store + date) based on filtered history (for the Visits Dialog)
  const visitEntries = useMemo(() => {
    try {
      return Array.from(new Set(filteredHistory.map(h => `${h.store_name || t('unknownStore')}|${h.purchase_date}`)))
        .map((key: string) => {
          const parts = key.split('|');
          const store_name = parts[0];
          const purchase_date = parts[1];
          const match = history.find(h => h.store_name === store_name && h.purchase_date === purchase_date);
          return { store_name, purchase_date, store_lat: match?.store_lat, store_lng: match?.store_lng };
        })
        .sort((a, b) => {
          const timeA = new Date(a.purchase_date + 'T12:00:00').getTime();
          const timeB = new Date(b.purchase_date + 'T12:00:00').getTime();
          return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });
    } catch (e) {
      console.error('[ReportsPage] Error computing visitEntries:', e);
      return [];
    }
  }, [filteredHistory, history, t]);
  const totalVisits = visitEntries.length;

  // Most visited stores based on filtered history
  const storeCounts = useMemo(() => {
    return filteredHistory.reduce<Record<string, { count: number; lat?: number; lng?: number }>>((acc, h) => {
      const key = h.store_name;
      if (!acc[key]) acc[key] = { count: 0, lat: h.store_lat, lng: h.store_lng };
      return acc;
    }, {});
  }, [filteredHistory]);

  // Recount using filtered unique visits
  const topStores = useMemo(() => {
    const counts = { ...storeCounts };
    visitEntries.forEach(v => {
      const name = v.store_name || 'Desconhecido';
      if (!counts[name]) {
        counts[name] = { count: 0, lat: v.store_lat, lng: v.store_lng };
      }
      counts[name].count++;
    });
    return (Object.entries(counts) as [string, { count: number }][])
      .sort((a, b) => (Number(b[1].count) || 0) - (Number(a[1].count) || 0));
  }, [storeCounts, visitEntries]);

  const openMaps = (name: string, lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`, '_blank');
    }
  };


  // 4. Detailed category breakdown for graphs
  const enrichedCategories = useMemo(() => {
    try {
      const categoryTotals = filteredHistory.reduce<Record<string, number>>((acc, h) => {
        const catName = h.category || 'Outros';
        const merged = CATEGORY_MERGE[catName] || catName;
        const currentTotal = acc[merged] || 0;
        acc[merged] = currentTotal + (h.total_price || 0);
        return acc;
      }, {});

      const categoryData = (Object.entries(categoryTotals) as [string, number][])
        .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
        .map(([name, value], i) => ({
          name: t(name) || name, 
          value: Number(value) || 0,
          fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        }));

      const catTotal = categoryData.reduce((s, c) => s + (Number(c.value) || 0), 0);
      
      return categoryData.map(c => ({
        ...c,
        percent: catTotal > 0 ? (((Number(c.value) || 0) / catTotal) * 100).toFixed(1) : '0',
      }));
    } catch (e) {
      console.error('[ReportsPage] Error computing enrichedCategories:', e);
      return [];
    }
  }, [filteredHistory, t]);

  // 5. Monthly Expenses computations
  const transportExpenses = useMemo(() => {
    try {
      const now = new Date();
      const recentMonthKeys = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });

      const transportByMonth = history.reduce<Record<string, number>>((acc, h) => {
        const mergedCat = CATEGORY_MERGE[h.category] || h.category;
        if (mergedCat !== 'Transporte') return acc;
        if (!h.purchase_date) return acc;
        const parts = h.purchase_date.split('-');
        const y = parts[0];
        const m = parts[1];
        if (!y || !m) return acc;
        const key = `${y}-${m.padStart(2, '0')}`;
        if (recentMonthKeys.includes(key)) {
          acc[key] = (acc[key] || 0) + (Number(h.total_price) || 0);
        }
        return acc;
      }, {});

      return recentMonthKeys.map(key => {
        const [year, month] = key.split('-').map(Number);
        const d = new Date(year, month - 1, 1);
        return {
          month: isNaN(d.getTime()) ? key : d.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''),
          value: transportByMonth[key] || 0
        };
      });
    } catch (e) {
      console.error('[ReportsPage] Error computing transportExpenses:', e);
      return [];
    }
  }, [history, lang]);

  const restaurantExpenses = useMemo(() => {
    try {
      const now = new Date();
      const recentMonthKeys = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });

      const restaurantByMonth = history.reduce<Record<string, number>>((acc, h) => {
        const mergedCat = CATEGORY_MERGE[h.category] || h.category;
        if (mergedCat !== 'Restaurante') return acc;
        if (!h.purchase_date) return acc;
        const parts = h.purchase_date.split('-');
        const y = parts[0];
        const m = parts[1];
        if (!y || !m) return acc;
        const key = `${y}-${m.padStart(2, '0')}`;
        if (recentMonthKeys.includes(key)) {
          acc[key] = (acc[key] || 0) + (Number(h.total_price) || 0);
        }
        return acc;
      }, {});

      return recentMonthKeys.map(key => {
        const [year, month] = key.split('-').map(Number);
        const d = new Date(year, month - 1, 1);
        return {
          month: isNaN(d.getTime()) ? key : d.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''),
          value: restaurantByMonth[key] || 0
        };
      });
    } catch (e) {
      console.error('[ReportsPage] Error computing restaurantExpenses:', e);
      return [];
    }
  }, [history, lang]);

  const maintenanceExpenses = useMemo(() => {
    try {
      const now = new Date();
      const recentYearKeys = Array.from({ length: 4 }, (_, i) => (now.getFullYear() - i).toString());

      const maintenanceByYear = history.reduce<Record<string, number>>((acc, h) => {
        const mergedCat = CATEGORY_MERGE[h.category] || h.category;
        if (mergedCat !== 'Manutenção') return acc;
        if (!h.purchase_date) return acc;
        const year = h.purchase_date.split('-')[0];
        if (recentYearKeys.includes(year)) {
          acc[year] = (acc[year] || 0) + (Number(h.total_price) || 0);
        }
        return acc;
      }, {});

      return recentYearKeys.map(year => ({
        year,
        value: maintenanceByYear[year] || 0
      }));
    } catch (e) {
      console.error('[ReportsPage] Error computing maintenanceExpenses:', e);
      return [];
    }
  }, [history]);

  const onBarClick = (data: any) => {
    if (data && data.key) {
      setSelectedMonth(data.key);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader
        title={t('reports')}
        subtitle={t('consumptionAnalysis')}
        onBack={onBack}
        action={
          <button 
            onClick={() => setMonthPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary text-primary text-xs font-medium"
          >
            <Calendar className="w-3.5 h-3.5" /> 
            {selectedMonth && monthsData[selectedMonth] ? monthsData[selectedMonth].label : t('all')}
          </button>
        }
      />

      <style dangerouslySetInnerHTML={{ __html: `
        .recharts-wrapper, 
        .recharts-surface, 
        .recharts-sector, 
        .recharts-rectangle, 
        .recharts-layer,
        .recharts-bar-rectangle,
        svg {
          outline: none !important;
          outline-color: transparent !important;
          -webkit-tap-highlight-color: transparent !important;
          -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
          box-shadow: none !important;
        }
        .recharts-wrapper:focus, 
        .recharts-surface:focus, 
        .recharts-bar-rectangle:focus,
        .recharts-rectangle:focus,
        svg:focus {
          outline: none !important;
          outline-color: transparent !important;
        }
      `}} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 space-y-4">
        {filteredHistory.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center shadow-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-sm font-bold text-amber-900 mb-1">{t('noPurchasesThisMonthTitle') || 'Sem compras este mês'}</h3>
            <p className="text-xs text-amber-800/70">
              {t('noPurchasesThisMonthDesc') || 'Ainda não existem registros de compras para o período selecionado.'}
            </p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <TrendingUp className="w-5 h-5 text-primary mb-2" />
            <p className="text-xl font-bold text-foreground">{fc(currentMonthTotal)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {selectedMonth && monthsData[selectedMonth] ? monthsData[selectedMonth].label : t('allMonths')}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <BarChart3 className="w-5 h-5 text-primary mb-2" />
            <p className="text-xl font-bold text-foreground">{fc(avgPerMonth)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('avgPerMonth')}</p>
          </div>
          <button onClick={() => setVisitsOpen(true)} className="bg-card rounded-xl border border-border p-4 text-left hover:bg-accent/50 transition-colors">
            <ShoppingCart className="w-5 h-5 text-primary mb-2" />
            <p className="text-xl font-bold text-foreground">{totalVisits}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('marketVisits')}</p>
            <p className="text-[10px] text-primary font-medium mt-0.5">{t('seeDetails')}</p>
          </button>
          <div className="bg-card rounded-xl border border-border p-4">
            <TrendingUp className={`w-5 h-5 mb-2 ${estimatedInflation !== null && estimatedInflation > 0 ? 'text-destructive' : 'text-primary'}`} />
            <p className={`text-xl font-bold ${estimatedInflation !== null && estimatedInflation > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {estimatedInflation !== null ? `${estimatedInflation > 0 ? '+' : ''}${estimatedInflation.toFixed(1)}%` : '--'}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('estimatedInflation')}</p>
          </div>
        </div>

        {/* Monthly Evolution Bar Chart */}
        {monthlySpending.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('monthlyEvolution')}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('lastMonths').replace('{count}', String(monthlySpending.length))}</p>
            <div className="w-full bg-slate-50 rounded-lg py-4 border border-slate-100" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={monthlySpending}
                  tabIndex={-1}
                  margin={{ top: 25, right: 10, left: 0, bottom: 0 }}
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload.length > 0) {
                      onBarClick(state.activePayload[0].payload);
                    }
                  }}
                  style={{ outline: 'none', border: 'none' }}
                >
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 10, fill: '#475569' }} 
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false} 
                  />
                  <YAxis 
                    tick={{ fontSize: 9, fill: '#475569' }} 
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false} 
                    tickFormatter={(v) => fc(v)}
                    width={50}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(22, 163, 74, 0.1)' }}
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                      zIndex: 100,
                      outline: 'none'
                    }} 
                    itemStyle={{ color: '#16a34a', fontWeight: 'bold' }}
                    formatter={(v: number) => [fc(v), t('spending') || 'Gasto']} 
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                    activeBar={false}
                  >
                    <LabelList 
                      dataKey="value" 
                      position="top" 
                      offset={5}
                      formatter={(v: number) => v > 0 ? fc(v) : ''}
                      style={{ fontSize: '9px', fontWeight: 'bold', fill: '#16a34a' }}
                    />
                    {monthlySpending.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        cursor="pointer"
                        fill={entry.key === selectedMonth ? '#16a34a' : '#8dd3bb'}
                        style={{ outline: 'none' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {monthlySpending.length === 0 && (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">{t('noEvolutionData')}</p>
          </div>
        )}

        {/* Donut Chart */}
        {enrichedCategories.length > 0 ? (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('spendingByCategory')}</h3>
            </div>
            <div className="w-full bg-slate-50 rounded-lg py-4 border border-slate-100" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={enrichedCategories} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={85} 
                    paddingAngle={4} 
                    dataKey="value"
                    fillOpacity={1}
                    minAngle={15}
                  >
                    {enrichedCategories.map((entry, i) => (
                      <Cell 
                        key={`cell-${i}`} 
                        fill={entry.fill} 
                        stroke="#ffffff" 
                        strokeWidth={2} 
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      zIndex: 100
                    }}
                    formatter={(v: number) => [`${fc(v)}`, '']} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {enrichedCategories.map(c => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.fill }} />
                    <span className="text-sm text-foreground">{t(c.name)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">{c.percent}%</span>
                    <span className="text-sm text-muted-foreground">{fc(c.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">{t('noCategoryData')}</p>
          </div>
        )}

        {/* Top Products */}
        {recentTopProducts.length > 0 ? (
          <div className="bg-card rounded-xl border border-border p-4 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('mostPurchased')}</h3>
            </div>
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin">
              {recentTopProducts.map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-primary bg-accent w-6 h-6 rounded flex items-center justify-center">{i + 1}</span>
                    <span className="text-sm font-medium text-foreground uppercase">{name}</span>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">{typeof count === 'number' ? (Number.isInteger(count) ? count : count.toFixed(2)) : count}x</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/50 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3 text-primary/60" />
              <span>{t('lastThreeMonthsHistory')}</span>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">{t('noHistoryProducts')}</p>
          </div>
        )}

        {/* Most Visited Stores */}
        {recentTopStores.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('mostVisitedStores')}</h3>
            </div>
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin">
              {recentTopStores.map(([name, data], i) => (
                <div key={name} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-primary bg-accent w-6 h-6 rounded flex items-center justify-center">{i + 1}</span>
                    <div>
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      <p className="text-[10px] text-muted-foreground">{data.count} {data.count === 1 ? t('visit') : t('visits')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openMaps(name, data.lat, data.lng)}
                    className="p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    title={t('openInMaps')}
                  >
                    <Navigation className="w-4 h-4 text-primary" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/50 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3 text-primary/60" />
              <span>{t('lastThreeMonthsHistory')}</span>
            </div>
          </div>
        )}

        {/* Monthly Transport Expenses */}
        {transportExpenses.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Bus className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('transportMonthly')}</h3>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
              {transportExpenses.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                  <span className="text-sm font-semibold text-foreground capitalize">{item.month}</span>
                  <span className={`text-sm font-bold ${item.value > 0 ? 'text-primary' : 'text-muted-foreground/40'}`}>
                    {fc(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Restaurant Expenses */}
        {restaurantExpenses.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Utensils className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('restaurantsMonthly')}</h3>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
              {restaurantExpenses.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                  <span className="text-sm font-semibold text-foreground capitalize">{item.month}</span>
                  <span className={`text-sm font-bold ${item.value > 0 ? 'text-primary' : 'text-muted-foreground/40'}`}>
                    {fc(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Yearly Maintenance Expenses */}
        {maintenanceExpenses.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">{t('maintenanceYearly')}</h3>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
              {maintenanceExpenses.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                  <span className="text-sm font-semibold text-foreground">{item.year}</span>
                  <span className={`text-sm font-bold ${item.value > 0 ? 'text-primary' : 'text-muted-foreground/40'}`}>
                    {fc(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Visits Dialog */}
      <Dialog open={visitsOpen} onOpenChange={setVisitsOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              {t('marketVisits')} ({totalVisits})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {visitEntries.map((v, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{v.store_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.purchase_date).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => openMaps(v.store_name, v.store_lat, v.store_lng)}
                  className="p-2 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <Navigation className="w-4 h-4 text-primary" />
                </button>
              </div>
            ))}
            {visitEntries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('noVisitsRecorded')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Month Selection Dialog */}
      <Dialog open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              {t('selectMonth')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <button
              onClick={() => {
                setSelectedMonth('');
                setMonthPickerOpen(false);
              }}
              className={`w-full p-3 rounded-lg text-left text-sm font-medium transition-colors ${
                selectedMonth === '' ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/80 text-foreground'
              }`}
            >
              {t('allMonths')}
            </button>
            {sortedMonthKeys.map(key => (
              <button
                key={key}
                onClick={() => {
                  setSelectedMonth(key);
                  setMonthPickerOpen(false);
                }}
                className={`w-full p-3 rounded-lg text-left text-sm font-medium transition-colors ${
                  selectedMonth === key ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/80 text-foreground'
                }`}
              >
                {monthsData[key].label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
