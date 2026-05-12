import { useState } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { getLists } from '@/data/mockData';
import { Share2, Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShoppingList } from '@/types';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface SharePageProps {
  onBack?: () => void;
}

function formatListForWhatsApp(list: ShoppingList, currency: string, fc: (v: number) => string, t: any): string {
  let text = `🛒 *${list.name}*\n\n`;
  if (list.items.length === 0) {
    text += `${t('emptyListText')}\n`;
  } else {
    list.items.forEach((item, i) => {
      const checked = item.is_checked ? '✅' : '⬜';
      const price = item.estimated_price > 0 ? ` - ${fc(item.estimated_price)}` : '';
      text += `${checked} ${item.quantity} ${item.unit} ${item.product_name}${price}\n`;
    });
  }
  const total = list.items.reduce((s, it) => s + it.estimated_price * it.quantity, 0);
  if (total > 0) {
    text += `\n💰 *${t('estimatedTotalLabel')} ${fc(total)}*`;
  }
  text += `\n\n_${t('sentViaApp')}_`;
  return text;
}

export function SharePage({ onBack }: SharePageProps) {
  const { t, currency, formatCurrency: fc } = useLanguage();
  const lists = getLists().filter(l => l.status === 'active' || l.status === 'shopping');
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const shareViaWhatsApp = () => {
    const listsToShare = lists.filter(l => selected.includes(l.id));
    if (listsToShare.length === 0) {
      toast.error(t('selectAtLeastOne'));
      return;
    }
    const text = listsToShare.map(l => formatListForWhatsApp(l, currency, fc, t)).join('\n\n---\n\n');
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="pb-20">
      <PageHeader
        title={t('share')}
        subtitle={t('shareSubtitle')}
        onBack={onBack}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 space-y-4">
        {lists.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center space-y-3">
            <Share2 className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">{t('noActiveListsToShare')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('selectListsToShare')}</p>
            <div className="space-y-2">
              {lists.map(l => {
                const isSelected = selected.includes(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleSelect(l.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-card border-border'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? t('item') : t('items')} · {fc(l.estimated_total)}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              onClick={shareViaWhatsApp}
              disabled={selected.length === 0}
              className="w-full gradient-primary text-primary-foreground border-0 h-12 text-sm font-bold gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              {t('sendViaWhatsApp').replace('{count}', String(selected.length))}
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
