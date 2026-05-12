import { Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface TrialBannerProps {
  daysLeft: number;
  onUpgrade: () => void;
}

export function TrialBanner({ daysLeft, onUpgrade }: TrialBannerProps) {
  const { t } = useLanguage();
  const plural = daysLeft !== 1;

  return (
    <button
      onClick={onUpgrade}
      className="mx-4 mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 w-[calc(100%-2rem)] text-left"
    >
      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">{daysLeft} {plural ? t('dayPlural') : t('day')}</span>{' '}
          {plural ? t('trialDaysLeftPlural') : t('trialDaysLeft')}
        </p>
      </div>
    </button>
  );
}
