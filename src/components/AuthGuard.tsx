import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useDevMode } from '@/contexts/DevModeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoginPage } from '@/pages/LoginPage';
import { PricingPage } from '@/pages/PricingPage';
import { SplashScreen } from '@/components/SplashScreen';
import { CheckoutSuccess } from '@/components/CheckoutSuccess';
import { Capacitor } from '@capacitor/core';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { status, loading: subLoading, isTrial, refreshing, isVerifying } = useSubscription();
  const { devMode } = useDevMode();
  const { t } = useLanguage();
  const [forceLogin, setForceLogin] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [isRestoring, setIsRestoring] = useState(() => 
    localStorage.getItem('app_is_restoring') === 'true' || 
    sessionStorage.getItem('app_is_restoring') === 'true'
  );
  
  useEffect(() => {
    // Only set initialCheckDone to true once we have a definitive auth state and sub loading finishes for the first time
    if (!authLoading && !subLoading) {
      setInitialCheckDone(true);
    }
  }, [authLoading, subLoading]);

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

  useEffect(() => {
    if (user) {
      setForceLogin(false);
    }
  }, [user]);

  useEffect(() => {
    const handleForceLogin = () => {
      setForceLogin(true);
    };
    window.addEventListener('force-login', handleForceLogin);
    return () => window.removeEventListener('force-login', handleForceLogin);
  }, []);

  // 0. URGENT: If restoring, always show children and BLOCK EVERYTHING ELSE.
  // This prevents unmounting the BackupPage while the user is choosing a file or confirming.
  if (isRestoring || localStorage.getItem('app_is_restoring') === 'true' || sessionStorage.getItem('app_is_restoring') === 'true') {
    return <>{children}</>;
  }

  // 1. Initial Auth Loading or Verification redirected from Stripe (ONLY ON BOOT)
  if (!initialCheckDone && (authLoading || isVerifying)) {
    return <SplashScreen progress={authLoading ? 30 : 90} message={authLoading ? (t('loadingApp') || 'Carregando...') : (t('verifyingPayment') || 'Verificando pagamento...')} />;
  }

  // 2. Not Logged In but Trial Expired -> Show Pricing
  if (initialCheckDone && !user && !devMode && !isTrial && !forceLogin) {
    return <PricingPage />;
  }

  // 3. Forced Login or Not Logged In (and not in trial)
  if (initialCheckDone && !user && !devMode && (forceLogin || !isTrial)) {
    return <LoginPage onBack={isTrial ? () => setForceLogin(false) : undefined} />;
  }

  // 4. Logged In but status check is still running - ONLY ON INITIAL LOAD
  if (!initialCheckDone && user && subLoading && !devMode) {
    return <SplashScreen progress={80} message={t('checkingSubscription') || 'Verificando assinatura...'} />;
  }

  // 5. Subscription Check Finished (Inactive user -> PricingPage)
  // Only auto-redirect to Pricing if it's the initial check or if we are idle
  if (initialCheckDone && !subLoading && !refreshing && user && !devMode && status !== 'active' && status !== 'expiring') {
    return <PricingPage />;
  }

  return <>{children}</>;
}
