import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/hooks/useSubscription';

export function RenewalBanner() {
  const { t } = useLanguage();
  const { status, daysUntilExpiry, openCheckout, isTrial } = useSubscription();

  if (status !== 'expiring') return null;

  return (
    <button
      onClick={openCheckout}
      className="mx-4 mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 w-[calc(100%-2rem)] text-left dark:bg-amber-900/20 dark:border-amber-700"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-xs text-amber-800 dark:text-amber-300">
        <span className="font-semibold">{daysUntilExpiry} {daysUntilExpiry !== 1 ? t('dayPlural') : t('day')}</span>{' '}
        {isTrial ? (t('trialExpiryWarning') || 'restantes de teste. Assine para continuar!') : t('subExpiryWarning')}
      </p>
    </button>
  );
}
