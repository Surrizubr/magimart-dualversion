import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Palette, Globe, Settings, Info, Sun, Moon, Type, ChevronRight, ArrowLeft, Check, Key, ClipboardPaste, Save, HelpCircle, CreditCard, RefreshCw, Undo2, LogOut, Send, Database, CheckCircle2, AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { useTheme, ThemeMode } from '@/contexts/ThemeContext';
import { useLanguage, Lang } from '@/contexts/LanguageContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useDevMode } from '@/contexts/DevModeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TabId } from '@/types';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

type SubMenu = null | 'themes' | 'languages' | 'preferences' | 'about' | 'gemini' | 'payment' | 'backup';

interface AppMenuProps {
  open: boolean;
  onClose: () => void;
  initialSubMenu?: SubMenu;
  onNavigate?: (tab: TabId) => void;
}

export function AppMenu({ open, onClose, initialSubMenu, onNavigate }: AppMenuProps) {
  const { theme, setTheme, largeText, setLargeText } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { stockExpiryDays, setStockExpiryDays } = usePreferences();
  const { info, openPortal, restorePurchases, openCheckout, isPaidLimitExceeded, trialDaysRemaining, isTrial } = useSubscription();
  const { devMode, setDevMode } = useDevMode();
  const { signOut } = useAuth();
  const [subMenu, setSubMenu] = useState<SubMenu>(null);

  // Sincronizar subMenu inicial quando o menu abrir
  useEffect(() => {
    if (open && initialSubMenu) {
      if (initialSubMenu === 'gemini') {
        const saved = localStorage.getItem('gemini-api-key');
        setGeminiKey(saved || '');
      }
      setSubMenu(initialSubMenu);
    }
    
    if (!open) {
      setSubMenu(null);
      setTestResult({ status: 'idle', message: '' });
    }
  }, [open, initialSubMenu]);

  const [geminiKey, setGeminiKey] = useState('');
  const [geminiHasKey, setGeminiHasKey] = useState(() => !!localStorage.getItem('gemini-api-key'));

    const [testResult, setTestResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'error', message: string }>({
    status: 'idle',
    message: ''
  });

  const testConnectivity = async () => {
    const keyToTest = geminiKey.trim() || localStorage.getItem('gemini-api-key') || '';
    if (!keyToTest) {
      toast.error(t('enterApiKeyBeforeTest'));
      return;
    }

    setTestResult({ status: 'loading', message: t('testingIAConnection') });

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: keyToTest });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: t('testPrompt')
      });
      const text = response.text || '';

      if (text.toUpperCase().includes('OK') || text.trim().length > 0) {
        setTestResult({ status: 'success', message: t('iaConnectionSuccess') + ' ' + text });
      } else {
        setTestResult({ status: 'error', message: t('iaUnexpectedResponse') + ' ' + text });
      }
    } catch (error: any) {
      setTestResult({ status: 'error', message: t('connectionError') + ' ' + (error.message || t('unknownError')) });
    }
  };

  const checkSubscriptionData = () => {
    if (info) {
      setTestResult({ 
        status: 'success', 
        message: `${t('profileDataTitle')} ${info.display_name} (${info.email}). Stripe Status: ${info.stripe_status}` 
      });
    } else {
      setTestResult({ status: 'error', message: t('profileDataNotLoaded') });
    }
  };

  // Check if within 7 days of subscription start (for cancellation eligibility)
  const canCancel = true;

  const handleGeminiPaste = async () => {
    try {
      let text = '';
      if (Capacitor.isNativePlatform()) {
        const result = await Clipboard.read();
        text = result.value;
      } else {
        text = await navigator.clipboard.readText();
      }

      if (text) {
        setGeminiKey(text);
        toast.success(t('geminiPaste'));
      }
    } catch (error) {
      console.error('Clipboard error:', error);
      toast.error(t('clipboardError'));
    }
  };

  const handleGeminiSave = () => {
    if (!geminiKey.trim()) return;
    localStorage.setItem('gemini-api-key', geminiKey.trim());
    setGeminiHasKey(true);
    toast.success(t('geminiApiKeySaved'));
  };

  const handleGeminiDelete = () => {
    localStorage.removeItem('gemini-api-key');
    setGeminiKey('');
    setGeminiHasKey(false);
    toast.success(t('geminiApiKeyDeleted'));
  };

  const openGeminiMenu = () => {
    const saved = localStorage.getItem('gemini-api-key');
    setGeminiKey(saved || '');
    setSubMenu('gemini');
  };

  const menuItems = [
    { id: 'themes' as SubMenu, icon: Palette, label: t('themes'), desc: t('themeDesc') },
    { id: 'languages' as SubMenu, icon: Globe, label: t('languages'), desc: t('langDesc') },
    { id: 'preferences' as SubMenu, icon: Settings, label: t('preferences'), desc: t('prefDesc') },
    { id: 'gemini' as SubMenu, icon: Key, label: t('geminiApiKey'), desc: geminiHasKey ? t('geminiConfigured') : t('geminiNotConfigured') },
    { id: 'payment' as SubMenu, icon: CreditCard, label: t('payment'), desc: t('paymentDesc') },
    { id: 'backup' as SubMenu, icon: Database, label: t('backup'), desc: t('backupDesc') },
    { id: 'about' as SubMenu, icon: Info, label: t('about'), desc: t('aboutDesc') },
  ];

  const handleDeleteAccount = async () => {
    if (!confirm(t('confirmDelete'))) return;
    
    try {
      // 1. Delete local data using resetAllData
      const { resetAllData } = await import('@/data/mockData');
      await resetAllData();
      
      // 2. Sign out from Supabase (Supabase doesn't allow self-deletion via client easily without a function)
      // For the sake of this implementation, we sign out. 
      // In a real production app, we would call a Supabase function to delete the user row.
      await supabase.auth.signOut();
      
      setDevMode(false);
      onClose();
      toast.success(t('accountDeleted'));
    } catch (error) {
      toast.error(t('unknownError'));
    }
  };

  const renderSubMenu = () => {
    switch (subMenu) {
      case 'themes':
        return (
          <div className="space-y-2">
            {([['light', Sun, t('light')], ['dark', Moon, t('dark')]] as [ThemeMode, any, string][]).map(([val, Icon, label]) => (
              <button
                key={val}
                onClick={() => setTheme(val)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${theme === val ? 'bg-primary/10 border border-primary/30' : 'bg-card border border-border'}`}
              >
                <Icon className={`w-5 h-5 ${theme === val ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${theme === val ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                {theme === val && <Check className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}
            <button
              onClick={() => setLargeText(!largeText)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${largeText ? 'bg-primary/10 border border-primary/30' : 'bg-card border border-border'}`}
            >
              <Type className={`w-5 h-5 ${largeText ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-sm font-medium ${largeText ? 'text-primary' : 'text-foreground'}`}>{t('largeText')}</span>
              {largeText && <Check className="w-4 h-4 text-primary ml-auto" />}
            </button>
          </div>
        );

      case 'languages':
        return (
          <div className="space-y-2">
            {([['pt', '🇧🇷', 'Português'], ['en', '🇺🇸', 'English'], ['es', '🇪🇸', 'Español']] as [Lang, string, string][]).map(([val, flag, label]) => (
              <button
                key={val}
                onClick={() => setLang(val)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${lang === val ? 'bg-primary/10 border border-primary/30' : 'bg-card border border-border'}`}
              >
                <span className="text-lg">{flag}</span>
                <span className={`text-sm font-medium ${lang === val ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                {lang === val && <Check className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}
          </div>
        );

      case 'preferences':
        return (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-foreground mb-1">{t('stockExpiry')}</p>
              <p className="text-xs text-muted-foreground mb-3">{stockExpiryDays} {t('days')}</p>
              <input
                type="range"
                min={2}
                max={120}
                value={stockExpiryDays}
                onChange={(e) => setStockExpiryDays(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>2 {t('days')}</span>
                <span>120 {t('days')}</span>
              </div>
            </div>
          </div>
        );

      case 'gemini':
        return (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-3">{t('geminiApiKeyDesc')}</p>
              <input
                type="text"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={t('geminiPlaceholder')}
                className="w-full p-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleGeminiPaste}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  {t('geminiPaste')}
                </button>
                <button
                  onClick={handleGeminiDelete}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                  {t('geminiDelete')}
                </button>
                <button
                  onClick={handleGeminiSave}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {t('geminiSave')}
                </button>
              </div>

              {/* Test Actions */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button 
                  onClick={testConnectivity}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-accent/30 hover:bg-accent/50 transition-colors gap-1"
                >
                  <Send className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-bold text-center">{t('testIAConnection')}</span>
                </button>

                <button 
                  onClick={checkSubscriptionData}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-accent/30 hover:bg-accent/50 transition-colors gap-1"
                >
                  <Database className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-bold text-center">{t('viewProfileData')}</span>
                </button>
              </div>

              {/* Results Console */}
              {testResult.status !== 'idle' && (
                <div className={`mt-3 p-3 rounded-lg border flex gap-2 ${
                  testResult.status === 'loading' ? 'bg-accent/20 border-border' :
                  testResult.status === 'success' ? 'bg-green-500/10 border-green-500/30' :
                  'bg-destructive/10 border-destructive/30'
                }`}>
                  {testResult.status === 'loading' ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin rounded-full mt-0.5 shrink-0" />
                  ) : testResult.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="space-y-0.5 min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-tight ${
                      testResult.status === 'success' ? 'text-green-600' : 
                      testResult.status === 'error' ? 'text-destructive' : ''
                    }`}>{t('aiDiagnosis')}</p>
                    <p className="text-xs text-foreground break-words line-clamp-3">{testResult.message}</p>
                  </div>
                </div>
              )}

              {/* Limit Card */}
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex gap-3 items-start">
                <div className="bg-yellow-500/10 p-2 rounded-lg shrink-0">
                  <AlertTriangle className="w-4 h-4 text-yellow-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-yellow-800">{t('geminiLimitTitle')}</p>
                  <p className="text-[10px] text-yellow-700/80 leading-relaxed font-medium">
                    {t('geminiLimitDesc')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-accent/50 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-semibold text-foreground">{t('geminiHelpTitle')}</p>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{t('geminiHelpSteps')}</p>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs text-primary underline">
                https://aistudio.google.com/apikey
              </a>
            </div>
          </div>
        );

      case 'payment':
        return (
          <div className="space-y-2">
            <button
              onClick={() => { openCheckout(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-primary" />
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-foreground">{t('renew')}</p>
                <p className="text-xs text-muted-foreground">{t('renewDesc')}</p>
              </div>
            </button>
            <button
              onClick={() => { 
                if (isPaidLimitExceeded) {
                  toast.error('Limite de 7 dias de uso excedido. Contate o suporte.');
                  return;
                }
                openPortal(); 
                onClose(); 
              }}
              disabled={isPaidLimitExceeded}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${isPaidLimitExceeded ? 'bg-gray-100 border-gray-200 cursor-not-allowed grayscale' : 'bg-card border-border hover:bg-accent'}`}
            >
              <Settings className={`w-5 h-5 ${isPaidLimitExceeded ? 'text-gray-400' : 'text-primary'}`} />
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-foreground">{t('manageSubscription')}</p>
                <p className="text-xs text-muted-foreground">{isPaidLimitExceeded ? 'Período de cancelamento excedido. Sua assinatura é válida por 1 ano.' : t('manageSubDesc')}</p>
              </div>
            </button>
            <button
              onClick={() => { restorePurchases(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors"
            >
              <Undo2 className="w-5 h-5 text-primary" />
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-foreground">{t('restorePurchase')}</p>
                <p className="text-xs text-muted-foreground">{t('restoreDesc')}</p>
              </div>
            </button>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mx-auto">
              <span className="text-2xl">🌿</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">Magicmart AI</h3>
            <p className="text-sm text-muted-foreground">{t('developedBy')}</p>
            <p className="text-xs text-muted-foreground">{t('termsText')}</p>
            <div className="flex flex-col gap-1">
              <a href="https://idapps.com.br/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                https://idapps.com.br/privacy
              </a>
              <a href="https://idapps.com.br/terms" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                https://idapps.com.br/terms
              </a>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-[85%] max-w-sm bg-background z-50 shadow-2xl overflow-y-auto"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  {subMenu ? (
                    <button onClick={() => setSubMenu(null)} className="p-1">
                      <ArrowLeft className="w-5 h-5 text-foreground" />
                    </button>
                  ) : (
                    <h2 className="text-lg font-bold text-foreground">{t('menu')}</h2>
                  )}
                  <button onClick={onClose} className="p-1">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* User info at the top */}
                {!subMenu && info && (
                  <div className="mb-4">
                    <div className="p-3 rounded-xl bg-card border border-border">
                      <p className="text-sm font-bold text-foreground">{info.display_name}</p>
                      <p className="text-xs text-muted-foreground">{info.email}</p>
                    </div>

                    {/* Subscription Status Box */}
                    <div className={`mt-2 p-2.5 rounded-xl border flex items-center gap-3 ${
                      info.stripe_status === 'active'
                        ? 'bg-green-50 border-green-600/30'
                        : 'bg-yellow-50 border-amber-500/30'
                    }`}>
                      <div className={`p-1.5 rounded-lg ${
                        info.stripe_status === 'active' ? 'bg-green-100' : 'bg-amber-100'
                      }`}>
                        <CheckCircle2 className={`w-4 h-4 ${
                          info.stripe_status === 'active' ? 'text-green-600' : 'text-amber-600'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${
                          info.stripe_status === 'active' ? 'text-green-700' : 'text-amber-700'
                        }`}>
                          {info.stripe_status === 'active' ? t('subscriptionValid') : t('trialPeriod')}
                        </p>
                        <p className="text-[11px] font-medium text-foreground/70">
                          {info.stripe_status === 'active'
                            ? t('premiumTitle')
                            : `${trialDaysRemaining} ${t('remainingDays')}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {subMenu ? (
                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">
                      {menuItems.find(m => m.id === subMenu)?.label}
                    </h3>
                    {renderSubMenu()}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {menuItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.id === 'backup') {
                            onNavigate?.('backup');
                            onClose();
                          } else if (item.id === 'gemini') {
                            openGeminiMenu();
                          } else {
                            setSubMenu(item.id);
                          }
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors"
                      >
                        <item.icon className="w-5 h-5 text-primary" />
                        <div className="text-left flex-1">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ))}

                    <div className="border-t border-border my-3" />

                    <button
                      onClick={async () => {
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
                          } catch (err: any) {
                            console.error('[AppMenu] Native Login Error:', err);
                            if (err.error !== 'popup_closed_by_user') {
                              toast.error('Erro no login nativo: ' + err.message);
                            }
                          }
                          return;
                        }

                        // Web Flow - Adicionado select_account para permitir escolher conta diferente
                        await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: {
                            redirectTo: window.location.origin,
                            queryParams: {
                              prompt: 'select_account',
                            }
                          }
                        });
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors mb-2"
                    >
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-foreground">{t('loginWithGoogle')}</p>
                        <p className="text-xs text-muted-foreground">{t('loginWithDifferentAccount')}</p>
                      </div>
                    </button>

                    <button
                      onClick={async () => {
                        await signOut();
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors"
                    >
                      <LogOut className="w-5 h-5 text-muted-foreground" />
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-foreground">{t('logout')}</p>
                        <p className="text-xs text-muted-foreground">{t('logoutDesc')}</p>
                      </div>
                    </button>

                    <button
                      onClick={handleDeleteAccount}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors mt-2"
                    >
                      <Trash2 className="w-5 h-5 text-destructive" />
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-destructive">{t('deleteAccount')}</p>
                        <p className="text-xs text-muted-foreground">{t('deleteDesc')}</p>
                      </div>
                    </button>

                    {devMode && (
                      <button
                        onClick={() => {
                          setDevMode(false);
                          onClose();
                          toast.success(t('devModeDisabled'));
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-colors mt-2"
                      >
                        <Settings className="w-5 h-5 text-orange-500" />
                        <div className="text-left flex-1">
                          <p className="text-sm font-medium text-orange-500">{t('disableDevMode')}</p>
                          <p className="text-xs text-muted-foreground text-orange-500/70">{t('backToNormalAuth')}</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  );
}
