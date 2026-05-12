import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useDevMode } from '@/contexts/DevModeContext';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

export function PricingPage() {
  const { t, currency } = useLanguage();
  const { user: currentUser, loading: authLoading } = useAuth();
  const { signOut } = useAuth();
  const { 
    openCheckout, 
    restorePurchases, 
    status, 
    loading: subLoading,
    refresh 
  } = useSubscriptionContext();
  
  const { setDevMode, devMode } = useDevMode();
  const [autoCheckout, setAutoCheckout] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const handleCheckout = async () => {
    if (!currentUser && !devMode) {
      console.log('[PricingPage] User not logged in, triggering login flow first');
      setAutoCheckout(true);
      handleGoogleLogin();
      return;
    }

    setLocalLoading(true);
    console.log('[PricingPage] handleCheckout clicked');
    
    toast.info(t('redirectingToStripe') || 'Redirecionando para o Stripe...', {
      description: t('stripeCheckoutInfo') || 'Você será levado ao ambiente seguro para conclusão.',
      duration: 5000,
    });
    
    try {
      await openCheckout();
    } catch (err) {
      console.error('[PricingPage] Checkout error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalLoading(true);
    console.log('[PricingPage] Starting Google login directly from Pricing...');
    
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await GoogleAuth.initialize({
            clientId: '759814822066-n501ukfn1tdntkev59284n64djsu6mj9.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
          });
          // Força a limpeza do cache nativo para permitir escolher outra conta
          try { await GoogleAuth.signOut(); } catch (e) {}

          const googleUser = await GoogleAuth.signIn();
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: googleUser.authentication.idToken,
          });
          if (error) throw error;
          toast.success(t('loginSuccess'));
          
          if (autoCheckout) {
            console.log('[PricingPage] Auto-triggering checkout after native login');
            // Small delay for session to be fully ready
            setTimeout(() => openCheckout(), 500);
          }
          return;
        } catch (err: any) {
          console.error('[PricingPage] Native Login Error:', err);
          toast.error('Erro no login nativo: ' + err.message);
          return;
        }
      }

      // WEB POPUP FLOW
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          }
        },
      });

      if (error) throw error;

      if (data?.url) {
        const width = 500;
        const height = 650;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.url,
          'google-login',
          `width=${width},height=${height},left=${left},top=${top},status=no,location=no,menubar=no`
        );

        if (!popup) {
          toast.error(t('popupBlockedError') || 'O popup foi bloqueado pelo navegador.');
          return;
        }

        // Monitoring popup to detect when login is complete
        const timer = setInterval(async () => {
          if (popup.closed) {
            clearInterval(timer);
            console.log('[PricingPage] Login popup closed');
            
            // Wait a moment for Hub/Auth sync and then trigger refresh
            setTimeout(async () => {
              await refresh();
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session) {
                console.log('[PricingPage] User logged in after popup close');
                toast.success(t('loginSuccess'));
                
                if (autoCheckout) {
                  console.log('[PricingPage] Auto-triggering checkout after popup login');
                  openCheckout();
                }
              }
            }, 800);
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error('[PricingPage] Login Error:', err);
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      if (!autoCheckout) setLocalLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  const showSubscribeButton = !subLoading && status === 'inactive';
  const isButtonDisabled = localLoading || subLoading;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mx-auto">
            <Crown className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{status === 'inactive' ? t('trialExpired') || 'Período de Teste Encerrado' : t('subBannerTitle') || 'Assinatura Premium'}</h1>
          <p className="text-sm text-muted-foreground">
            {status === 'inactive' 
              ? (t('trialExpiredDesc') || 'Seu período de 14 dias acabou. Assine para continuar organizando suas compras com IA.')
              : (t('pricingDescTrial') || 'Aproveite o Magicmart AI. Assine agora para garantir acesso vitalício após o período de teste.')}
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-primary/30 p-6 space-y-4 shadow-lg text-center">
          <div>
            <p className="text-3xl font-bold text-foreground">{currency} 49,90</p>
            <p className="text-sm text-muted-foreground">{t('premiumPerYear')}</p>
          </div>

          <div className="space-y-2 text-left">
            {[
              t('pricingFeature1'),
              t('pricingFeature2'),
              t('pricingFeature3'),
              t('pricingFeature4'),
              t('pricingFeature5'),
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </div>
            ))}
          </div>

          {showSubscribeButton && (
            <button
              onClick={handleCheckout}
              disabled={isButtonDisabled}
              className="w-full mt-4 p-4 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isButtonDisabled ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  {!currentUser && !devMode && (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  {currentUser || devMode ? t('premiumSubscribe') : t('loginWithGoogle')}
                </>
              )}
            </button>
          )}

          {!showSubscribeButton && subLoading && (
            <div className="w-full mt-4 p-3 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              {t('checkingSubscription')}
            </div>
          )}
        </div>

        <button
          onClick={restorePurchases}
          disabled={localLoading || subLoading}
          className="w-full flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground hover:text-primary transition-colors font-medium border border-dashed border-muted-foreground/20 rounded-xl"
        >
          {t('restorePurchase')}
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t('logout')}
        </button>

        <p className="text-[10px] text-center text-muted-foreground/60 px-6 leading-relaxed italic">
          {t('cancelPolicyInfo')}
        </p>
      </motion.div>
    </div>
  );
}
