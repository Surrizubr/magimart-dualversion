import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';
import { Key, Send, Database, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription } from '@/hooks/useSubscription';
import { APP_VERSION, LAST_DEPLOY } from '@/version';

interface DevToolsPageProps {
  onBack: () => void;
}

export function DevToolsPage({ onBack }: DevToolsPageProps) {
  const { lang, t } = useLanguage();
  const { info, status: subStatus } = useSubscription();
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini-api-key') || '');
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'error', message: string }>({
    status: 'idle',
    message: ''
  });

  const saveApiKey = () => {
    localStorage.setItem('gemini-api-key', apiKey.trim());
    toast.success(t('apiKeySaved'));
  };

  const clearApiKey = () => {
    localStorage.removeItem('gemini-api-key');
    setApiKey('');
    toast.info(t('apiKeyRemoved'));
  };

  const testConnectivity = async () => {
    if (!apiKey.trim()) {
      toast.error(t('enterKeyBeforeTest'));
      return;
    }

    setTestResult({ status: 'loading', message: t('testingConnection') });

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      
      const response = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview",
        contents: t('testPrompt')
      });
      
      const text = response.text || '';

      if (text.includes('OK')) {
        setTestResult({ status: 'success', message: t('connectionSuccess') + text });
      } else {
        setTestResult({ status: 'error', message: t('iaUnexpectedResponse') + text });
      }
    } catch (error: any) {
      console.error('Gemini Test Error:', error);
      setTestResult({ status: 'error', message: t('connectionError') + (error.message || t('unknownError')) });
    }
  };

  const checkSubscriptionData = () => {
    if (info) {
      setTestResult({ 
        status: 'success', 
        message: `${t('profileDataTitle')} ${info.display_name} (${info.email}). ${t('statusContext')} ${subStatus}. Stripe Status: ${info.stripe_status}` 
      });
    } else {
      setTestResult({ status: 'error', message: t('profileDataNotLoaded') });
    }
  };

  return (
    <div className="pb-20">
      <PageHeader 
        title={t('developerMode')} 
        subtitle={t('diagnosticTools')}
        onBack={onBack}
      />

      <div className="px-4 pt-6 space-y-6">
        {/* API Key Card */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">{t('geminiConfig')}</h3>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">{t('yourApiKey')}</label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button 
                  onClick={clearApiKey}
                  className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20"
                  title={t('clearKey')}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <a 
                href="https://aistudio.google.com/apikey" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity inline-flex items-center gap-1"
              >
                {t('getApiKeyAt')} aistudio.google.com/apikey
              </a>
            </div>
          </div>

          <button 
            onClick={saveApiKey}
            className="w-full py-2.5 rounded-lg gradient-primary text-primary-foreground font-bold text-sm"
          >
            {t('saveKey')}
          </button>
        </div>

        {/* Test Actions */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">{t('testActions')}</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={testConnectivity}
              className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-accent/30 hover:bg-accent/50 transition-colors gap-2"
            >
              <Send className="w-6 h-6 text-primary" />
              <span className="text-xs font-bold text-center">{t('testIaConnection')}</span>
            </button>

            <button 
              onClick={checkSubscriptionData}
              className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-accent/30 hover:bg-accent/50 transition-colors gap-2"
            >
              <Database className="w-6 h-6 text-primary" />
              <span className="text-xs font-bold text-center">{t('viewProfileData')}</span>
            </button>
          </div>
        </div>

        {/* Results Console */}
        {testResult.status !== 'idle' && (
          <div className={`p-4 rounded-xl border flex gap-3 ${
            testResult.status === 'loading' ? 'bg-accent/20 border-border' :
            testResult.status === 'success' ? 'bg-green-500/10 border-green-500/30' :
            'bg-destructive/10 border-destructive/30'
          }`}>
            {testResult.status === 'loading' ? (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent animate-spin rounded-full mt-0.5" />
            ) : testResult.status === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-tight">{t('diagnosticResult')}</p>
              <p className="text-sm text-foreground break-words">{testResult.message}</p>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-[10px] text-muted-foreground text-center">{t('devModeWarning')}</p>
        </div>

        {/* Versioning Card */}
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-white">{t('versioning')}</h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase">Build Info</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{t('currentVersion')}</p>
              <p className="text-lg font-mono font-bold text-white tracking-widest">{APP_VERSION}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{t('lastDeploy')}</p>
              <p className="text-[10px] font-mono text-slate-300">
                {new Date(LAST_DEPLOY).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR')} <br/>
                {new Date(LAST_DEPLOY).toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="text-[10px] leading-tight">
              {t('versionWarning')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
