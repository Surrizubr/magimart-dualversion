import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { ArrowLeft, Download } from 'lucide-react';
import { LogService } from '@/services/LogService';

export function LoginPage({ onBack }: { onBack?: () => void }) {
  const { t } = useLanguage();
  const { refresh } = useSubscriptionContext();

  const handleExportLogs = async () => {
    const success = await LogService.exportToDownloads();
    if (success) {
      toast.success('Logs exportados para a pasta Documentos/Downloads');
    } else {
      toast.error('Falha ao exportar logs');
    }
  };

  const handleGoogleLogin = async () => {
    LogService.info('Starting Google login...');
    
    // NATIVE LOGIN (CAPACITOR)
    if (Capacitor.isNativePlatform()) {
      try {
        LogService.info('Using Native Google Auth Plugin');
        await GoogleAuth.initialize({
          clientId: '759814822066-n501ukfn1tdntkev59284n64djsu6mj9.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });

        // Força a limpeza do cache nativo para permitir escolher outra conta
        try { await GoogleAuth.signOut(); } catch (e) {}

        const googleUser = await GoogleAuth.signIn();
        LogService.info('Google Native Success', { email: googleUser.email });
        
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: googleUser.authentication.idToken,
        });

        if (error) {
          LogService.error('Supabase signInWithIdToken Error', error);
          throw error;
        }

        if (data.session) {
          toast.success(t('loginSuccess'));
        }
        return;
      } catch (err: any) {
        LogService.error('Native Auth Catch Error', err);
        // Automatically export logs on error to help debugging
        await LogService.exportToDownloads();

        if (err.error !== 'popup_closed_by_user') {
          toast.error('Erro no login nativo: ' + (err.message || JSON.stringify(err)));
        }
        return;
      }
    }

    // WEB LOGIN (POPUP)
    try {
      console.log('[Login] Using Web Popup Auth');
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
          toast.error(t('popupBlockedError'));
          return;
        }

        const checkPopup = setInterval(async () => {
          if (popup.closed) {
            clearInterval(checkPopup);
            console.log('[Login] Popup closed, checking session...');
            
            setTimeout(async () => {
              await refresh();
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session) {
                console.log('[Login] User detected after popup close');
                toast.success(t('loginSuccess'));
                // AuthGuard should now allow access
              }
            }, 800);
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error('[Login] Web Error:', err);
      toast.error(err.message || t('loginError'));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background blobs for premium feel */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl" />

      {onBack && (
        <button 
          onClick={onBack}
          className="absolute top-10 left-6 p-2 rounded-full bg-card/50 border border-border backdrop-blur-sm z-50 hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-12 relative z-10"
      >
        <div className="text-center space-y-6">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto shadow-elevated"
          >
            <span className="text-4xl">🌿</span>
          </motion.div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              Magicmart <span className="text-primary">AI</span>
            </h1>
            <p className="text-sm text-muted-foreground font-medium tracking-wide">
              {t('appTagline')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-elevated hover:bg-accent transition-all active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-sm font-bold text-foreground">{t('loginWithGoogle')}</span>
          </button>

          <p className="text-center text-[11px] text-muted-foreground/60 px-4 leading-relaxed">
            {t('termsText')} <br />
            <a href="https://www.idapps.com.br/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline">
              idapps.com.br/terms
            </a>
          </p>

          <button
            onClick={handleExportLogs}
            className="w-full flex items-center justify-center gap-2 p-2 mt-4 rounded-xl border border-dashed border-border text-[10px] text-muted-foreground hover:bg-accent transition-all"
          >
            <Download className="w-3 h-3" />
            Exportar Logs de Erro (log.txt)
          </button>
        </div>
      </motion.div>
    </div>
  );
}
