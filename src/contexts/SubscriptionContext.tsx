import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDevMode } from '@/contexts/DevModeContext';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export type SubStatus = 'active' | 'expiring' | 'inactive';

export interface SubscriptionInfo {
  stripe_status?: string;
  subscription_tier?: string;
  stripe_customer_id?: string | null;
  subscription_start: string | null;
  subscription_end: string | null;
  display_name: string | null;
  active_device_id?: string | null;
  email: string;
}

interface SubscriptionContextType {
  status: SubStatus;
  loading: boolean;
  refreshing: boolean;
  info: SubscriptionInfo | null;
  daysUntilExpiry: number;
  trialDaysRemaining: number;
  isTrial: boolean;
  isPaidLimitExceeded: boolean;
  simulateTrialExpiry: () => void;
  openCheckout: () => Promise<void>;
  openPortal: () => Promise<void>;
  refresh: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  isVerifying: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { devMode } = useDevMode();
  const { t } = useLanguage();
  const [status, setStatus] = useState<SubStatus>(() => {
    if (devMode) return 'active';
    return 'inactive';
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState(0);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(14);
  const [isTrial, setIsTrial] = useState(false);
  const [isPaidLimitExceeded, setIsPaidLimitExceeded] = useState(false);

  const [hasLoadedInitially, setHasLoadedInitially] = useState(false);

  const calculatePaidUsageStatus = useCallback((profile: SubscriptionInfo | null) => {
    if (!profile) {
      setIsPaidLimitExceeded(false);
      return;
    }

    const isPaid = profile.stripe_status === 'active' || profile.stripe_status === 'trialing' || profile.subscription_tier === 'pro';
    if (!isPaid) {
      setIsPaidLimitExceeded(false);
      return;
    }

    // Principal: subscription_start (data do pagamento)
    // Fallback: magicmart_install_date + 21 dias (14 trial + 7 arrependimento)
    const subscriptionStartStr = profile.subscription_start;
    const installDateStr = localStorage.getItem('magicmart_install_date');
    
    let startDate: Date;
    let limitDays: number;

    if (subscriptionStartStr) {
      startDate = new Date(subscriptionStartStr);
      limitDays = 7; // 7 dias a partir do pagamento
    } else if (installDateStr) {
      startDate = new Date(installDateStr);
      limitDays = 21; // 14 trial + 7 arrependimento
    } else {
      setIsPaidLimitExceeded(false);
      return;
    }

    if (isNaN(startDate.getTime())) {
      setIsPaidLimitExceeded(false);
      return;
    }

    const now = new Date();
    const diffMs = now.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    setIsPaidLimitExceeded(diffDays > limitDays);
  }, []);

  const calculateTrial = useCallback(async () => {
    let currentDeviceId = 'browser';
    try {
      const info = await Device.getId();
      currentDeviceId = info.identifier;
    } catch (e) {
      console.warn('[Subscription] Could not get device ID for trial:', e);
    }

    // Try to get from Supabase first (Persistent across reinstalls)
    let startDate: Date;
    const { data: deviceData } = await supabase
      .from('device_trials' as any)
      .select('trial_start_date')
      .eq('device_id', currentDeviceId)
      .maybeSingle();

    if (deviceData?.trial_start_date) {
      startDate = new Date(deviceData.trial_start_date);
    } else {
      // Not in DB, check local storage (fallback/offline)
      let localInstallDate = localStorage.getItem('magicmart_install_date');
      if (localInstallDate) {
        startDate = new Date(localInstallDate);
        // Sync local date to DB so it becomes persistent
        supabase.from('device_trials' as any)
          .upsert({ device_id: currentDeviceId, trial_start_date: localInstallDate })
          .then(({ error }) => {
            if (error) console.error('[Subscription] Error syncing local trial to DB:', error);
          });
      } else {
        // New install
        startDate = new Date();
        const isoDate = startDate.toISOString();
        localStorage.setItem('magicmart_install_date', isoDate);

        // Try to persist to DB asynchronously
        supabase.from('device_trials' as any)
          .insert({ device_id: currentDeviceId, trial_start_date: isoDate })
          .then(({ error }) => {
            if (error) console.error('[Subscription] Error persisting device trial:', error);
          });
      }
    }

    if (isNaN(startDate.getTime())) {
      setTrialDaysRemaining(0);
      setIsTrial(false);
      return { remaining: 0, inTrial: false };
    }

    const now = new Date();
    const diffMs = now.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let remaining = Math.max(0, 14 - diffDays);
    
    if (isNaN(remaining)) {
      remaining = 0;
    }
    
    const inTrial = remaining > 0 && diffDays < 14;
    
    setTrialDaysRemaining(remaining);
    setIsTrial(inTrial);
    return { remaining, inTrial };
  }, []);

  const simulateTrialExpiry = useCallback(async () => {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 15);
    const isoDate = expiredDate.toISOString();

    localStorage.setItem('magicmart_install_date', isoDate);

    let currentDeviceId = 'browser';
    try {
      const info = await Device.getId();
      currentDeviceId = info.identifier;
    } catch (e) {}

    await supabase.from('device_trials' as any)
      .upsert({ device_id: currentDeviceId, trial_start_date: isoDate });

    await calculateTrial();
    toast.success('Simulando fim do Trial (Expirado)');
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }, [calculateTrial]);

  const applySubscriptionState = useCallback((profile: SubscriptionInfo | null) => {
    setInfo(profile);
    calculatePaidUsageStatus(profile);

    if (!profile) {
      setDaysUntilExpiry(0);
      setStatus('inactive');
      return;
    }

    // Check if definitely active by status or tier
    const isProInDb = profile.stripe_status === 'active' || profile.stripe_status === 'trialing' || profile.subscription_tier === 'pro';

    if (!profile.subscription_end) {
      setDaysUntilExpiry(0);
      // If we have pro status but no date (e.g. lifetime or just synced), we must show as active
      setStatus(isProInDb ? 'active' : 'inactive');
      return;
    }

    const now = new Date();
    const end = new Date(profile.subscription_end);
    if (isNaN(end.getTime())) {
      setDaysUntilExpiry(0);
      setStatus(isProInDb ? 'active' : 'inactive');
      return;
    }
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    setDaysUntilExpiry(isNaN(diffDays) ? 0 : diffDays);

    if (diffDays <= 0 && !isProInDb) {
      setStatus('inactive');
    } else if (diffDays <= 30) {
      setStatus('expiring');
    } else {
      setStatus('active');
    }
  }, []);

  const fetchProfile = useCallback(async (): Promise<SubscriptionInfo | null> => {
    if (!user) return null;

    console.log('[Subscription] Fetching profile for:', user.id);
    
    // First try to fetch
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_status, stripe_customer_id, subscription_start, subscription_end, display_name, subscription_tier, active_device_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Subscription] Error fetching profile:', error);
      return null;
    }

    // Get current device ID
    let currentDeviceId = 'browser';
    try {
      const getDeviceIdWithTimeout = async () => {
        return Promise.race([
          Device.getId(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout getting Device ID')), 2000))
        ]);
      };
      
      const info = await getDeviceIdWithTimeout();
      currentDeviceId = info.identifier;
    } catch (e) {
      console.warn('[Subscription] Could not get device ID, using fallback:', e);
    }

    // If profile doesn't exist, create it (fallback for trigger)
    if (!profile) {
      console.log('[Subscription] Profile not found, creating one...');
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .upsert({ 
          user_id: user.id, 
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: user.user_metadata?.avatar_url || null,
          active_device_id: currentDeviceId,
          subscription_tier: 'free',
          stripe_status: 'inactive',
          updated_at: new Date().toISOString()
        } as any, {
          onConflict: 'user_id'
        })
        .select('*')
        .single();
      
      if (insertError) {
        console.error('[Subscription] Error creating profile:', insertError);
        // Even if insert fails, try to return a basic object based on user so the app doesn't crash
        return {
          stripe_status: 'inactive',
          subscription_tier: 'free',
          stripe_customer_id: null,
          subscription_start: null,
          subscription_end: null,
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || 'User',
          email: user.email || '',
        };
      }
      
      const typedProfile = newProfile as any;
      return {
        stripe_status: typedProfile.stripe_status || 'inactive',
        subscription_tier: typedProfile.subscription_tier || 'free',
        stripe_customer_id: typedProfile.stripe_customer_id,
        subscription_start: typedProfile.subscription_start,
        subscription_end: typedProfile.subscription_end,
        display_name: typedProfile.display_name,
        active_device_id: typedProfile.active_device_id,
        email: user.email || '',
      };
    }

    // Check if this device is the active one. 
    const typedProfile = profile as any;
    const dbDeviceId = typedProfile.active_device_id;
    
    if (dbDeviceId && dbDeviceId !== currentDeviceId) {
      console.log('[Subscription] Another device is active. Taking over session...');
      await supabase.from('profiles')
        .update({ active_device_id: currentDeviceId } as any)
        .eq('user_id', user.id);
    } else if (!dbDeviceId) {
      await supabase.from('profiles')
        .update({ active_device_id: currentDeviceId } as any)
        .eq('user_id', user.id);
    }
    
      return {
      stripe_status: typedProfile.stripe_status || 'inactive',
      subscription_tier: typedProfile.subscription_tier || 'free',
      stripe_customer_id: typedProfile.stripe_customer_id,
      subscription_start: typedProfile.subscription_start,
      subscription_end: typedProfile.subscription_end,
      display_name: typedProfile.display_name,
      active_device_id: typedProfile.active_device_id,
      email: user.email || '',
    };
  }, [user]);

  const syncSubscriptionFromStripe = useCallback(async (): Promise<any | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: {},
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('check-subscription failed', error);
      return null;
    }
  }, []);

  const checkSubscription = useCallback(async ({ forceSync = false }: { forceSync?: boolean } = {}) => {
    if (forceSync) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const { remaining, inTrial } = calculateTrial();

      if (devMode) {
        setStatus('active');
        return;
      }

      if (user) {
        let profile = await fetchProfile();
        
        const isProInDb = profile?.stripe_status === 'active' || profile?.stripe_status === 'trialing' || profile?.subscription_tier === 'pro';
        
        if (!isProInDb && (forceSync || !profile)) {
          console.log('[Subscription] Not active in DB, trying sync from Stripe/Function...');
          const stripeSync = await syncSubscriptionFromStripe();
          
          if (stripeSync?.subscribed) {
            console.log('[Subscription] Sync successful, user is now pro', stripeSync);
            profile = {
              ...profile,
              stripe_status: stripeSync.stripe_status || 'active',
              subscription_tier: stripeSync.subscription_tier || 'pro',
              stripe_customer_id: stripeSync.customer_id || profile?.stripe_customer_id || null,
              subscription_start: stripeSync.subscription_start || profile?.subscription_start || null,
              subscription_end: stripeSync.subscription_end || profile?.subscription_end || null,
              email: user.email || '',
            } as SubscriptionInfo;
          } else if (forceSync) {
            // If force syncing and still not pro, wait 2 seconds and try one more fetch from DB
            console.log('[Subscription] Sync didn\'t show sub yet, waiting 2s for propagation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryProfile = await fetchProfile();
            if (retryProfile?.stripe_status === 'active' || retryProfile?.stripe_status === 'trialing' || retryProfile?.subscription_tier === 'pro') {
              console.log('[Subscription] Propagation successful after delay');
              profile = retryProfile;
            }
          }
        }

        if (profile && (profile.stripe_status === 'active' || profile.stripe_status === 'trialing' || profile.subscription_tier === 'pro')) {
          applySubscriptionState(profile);
          localStorage.setItem(`sub_status_${user.id}`, 'active');
        } else if (inTrial) {
          setInfo(profile);
          setDaysUntilExpiry(remaining);
          setStatus(remaining <= 3 ? 'expiring' : 'active');
        } else {
          applySubscriptionState(null);
          localStorage.removeItem(`sub_status_${user.id}`);
        }
      } else {
        if (inTrial) {
          setInfo(null);
          setDaysUntilExpiry(remaining);
          setStatus(remaining <= 3 ? 'expiring' : 'active');
        } else {
          setStatus('inactive');
        }
      }
    } catch (err) {
      console.error('[Subscription] checkSubscription failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setHasLoadedInitially(true);
    }
  }, [calculateTrial, applySubscriptionState, fetchProfile, user, devMode, syncSubscriptionFromStripe]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Real-time listener for session bumps
  useEffect(() => {
    if (!user || devMode) return;

    const channel = supabase
      .channel('profile_session_check')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          const newDeviceId = payload.new.active_device_id;
          if (newDeviceId) {
            const getDeviceIdWithTimeout = async () => {
            return Promise.race([
              Device.getId(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout getting Device ID')), 2000))
            ]);
          };
          const info = await getDeviceIdWithTimeout();
            if (newDeviceId !== info.identifier) {
              console.warn('[Subscription] Session moved to another device');
              toast.error(t('sessionMoved') || 'Sua conta foi conectada em outro aparelho. Desconectando...');
              setTimeout(async () => {
                await supabase.auth.signOut();
              }, 3000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, devMode, t]);

  const openCheckout = async () => {
    setLoading(true);
    toast.loading(t('preparingCheckout') || 'Preparando checkout...', { id: 'checkout-status' });
    console.log('[Subscription] openCheckout initiated. Current Context User:', user?.id);
    
    let currentUser = user;
    
    // Always try to get a fresh session directly from Supabase to be 100% sure
    try {
      console.log('[Subscription] Fetching fresh session for checkout...');
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        console.log('[Subscription] Found fresh session user:', sessionData.session.user.id);
        currentUser = sessionData.session.user;
      }
    } catch (e) {
      console.error('[Subscription] Error refreshing session:', e);
    }

    if (!currentUser && !devMode) {
      console.warn('[Subscription] No user found. Cannot proceed to checkout.');
      toast.dismiss('checkout-status');
      toast.info(t('loginToPayment') || 'Por favor, faça login para realizar o pagamento.');
      setLoading(false);
      return;
    }

    try {
      console.log('[Subscription] Proceeding with checkout for user:', currentUser?.id);
      
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {},
      });
      
      if (error) {
        toast.dismiss('checkout-status');
        console.error('[Subscription] Supabase Function error:', error);
        toast.error(`Erro na Function: ${error.message}`);
        setLoading(false);
        return;
      }
      
      console.log('[Subscription] create-checkout response data:', data);
      
      if (data?.error) {
        toast.dismiss('checkout-status');
        console.error('[Subscription] Business logic error from Edge function:', data.error);
        toast.error(`Erro: ${data.error}`);
        setLoading(false);
        return;
      }

      if (data?.url) {
        toast.success(t('redirectingToStripe'), { id: 'checkout-status' });
        console.log('[Subscription] Redirecting to:', data.url);
        setLoading(false);
        if (Capacitor.isNativePlatform()) {
          window.open(data.url, '_blank');
        } else {
          window.location.assign(data.url);
        }
      } else {
        console.warn('[Subscription] No URL returned from checkout function');
        toast.error('Não foi possível gerar a URL de pagamento.');
      }
    } catch (err: any) {
      toast.dismiss('checkout-status');
      console.error('Checkout error:', err);
      const errorMessage = err.message || 'Erro desconhecido';
      toast.error(`${t('errorOpeningCheckout') || 'Erro ao abrir checkout'}: ${errorMessage}`);
    }
  };

  useEffect(() => {
    const handleUrl = async (urlStr: string) => {
      try {
        const url = new URL(urlStr);
        const checkoutStatus = url.searchParams.get('checkout');
        const sessionId = url.searchParams.get('session_id');

        if (checkoutStatus === 'success') {
          setIsVerifying(true);
          toast.success(t('paymentSuccess') || 'Pagamento realizado com sucesso! Bem-vindo ao Premium.');
          
          // Clear URL before refreshing to avoid double-processing
          if (!Capacitor.isNativePlatform()) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          await checkSubscription({ forceSync: true });
          setIsVerifying(false);
        }
      } catch (e) {
        console.error('Error parsing URL:', e);
      }
    };

    handleUrl(window.location.href);

    let listener: any;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appUrlOpen', (event) => {
        handleUrl(event.url);
      }).then(l => listener = l);
    }

    return () => {
      if (listener) listener.remove();
    };
  }, [checkSubscription, t]);

  const openPortal = async () => {
    if (!user) return;
    
    setLoading(true);
    toast.loading(t('processing') || 'Processando...', { id: 'portal-status' });
    
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        body: {},
      });
      
      if (error) throw error;
      
      if (data?.url) {
        toast.success(t('redirectingToStripe') || 'Redirecionando...', { id: 'portal-status' });
        
        if (Capacitor.isNativePlatform()) {
          window.open(data.url, '_blank');
        } else {
          // Use location.assign to avoid popup blockers on web
          window.location.assign(data.url);
        }
      } else {
        toast.dismiss('portal-status');
        toast.error(t('errorOpeningPortal') || 'Erro ao abrir portal');
      }
    } catch (err: any) {
      toast.dismiss('portal-status');
      console.error('Portal error:', err);
      toast.error(`${t('errorOpeningPortal') || 'Erro ao abrir portal'}: ${err.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const restorePurchases = async () => {
    setLoading(true);
    await checkSubscription({ forceSync: true });
    setLoading(false);
  };

  return (
    <SubscriptionContext.Provider value={{
      status,
      loading,
      refreshing,
      info,
      daysUntilExpiry,
      trialDaysRemaining,
      isTrial,
      isPaidLimitExceeded,
      simulateTrialExpiry,
      openCheckout,
      openPortal,
      refresh: checkSubscription,
      restorePurchases,
      isVerifying
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  }
  return context;
}
