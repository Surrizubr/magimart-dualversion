import { Crown, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface FirstAccessBannerProps {
  onSubscribe: () => void;
}

export function FirstAccessBanner({ onSubscribe }: FirstAccessBannerProps) {
  const { t, currency } = useLanguage();
  return (
    <button
      onClick={onSubscribe}
      className="mx-4 mt-4 p-4 rounded-xl gradient-primary flex items-center gap-3 w-[calc(100%-2rem)] text-left shadow-md"
    >
      <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
        <Crown className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-primary-foreground">{t('subBannerTitle')}</p>
        <p className="text-[11px] text-primary-foreground/80">
          {currency} 49,90{t('premiumPerYear')} · {t('subBannerCancel')}
        </p>
      </div>
      <span className="text-xs font-bold text-primary-foreground bg-primary-foreground/20 px-3 py-1.5 rounded-full">
        {t('premiumSubscribe')}
      </span>
    </button>
  );
}

interface ExpiryBannerProps {
  daysLeft: number;
  onRenew: () => void;
}

export function ExpiryBanner({ daysLeft, onRenew }: ExpiryBannerProps) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onRenew}
      className="mx-4 mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 w-[calc(100%-2rem)] text-left"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">{daysLeft} {daysLeft !== 1 ? t('dayPlural') : t('day')}</span>{' '}
          {t('subExpiryWarning')}
        </p>
      </div>
    </button>
  );
}
