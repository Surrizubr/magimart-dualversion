import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Upload, History, FileJson, AlertTriangle, CheckCircle2, ChevronLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { storage } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { resetAllData } from '@/data/mockData';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BackupPageProps {
  onBack: () => void;
  key?: string;
}

export function BackupPage({ onBack }: BackupPageProps) {
  const { t } = useLanguage();
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState<any>(null);

  const handleReset = () => {
    resetAllData();
    setConfirmReset(false);
    window.location.reload();
  };

  useEffect(() => {
    const checkLastBackup = async () => {
      const last = await storage.get<{ date: string }>('last_backup_info');
      if (last && last.date) {
        setLastBackupDate(last.date);
      }
    };
    checkLastBackup();
  }, []);

  const handleBackup = async () => {
    try {
      const allData = await storage.getAll();
      
      // Exclude internal backup data to avoid recursive size growth
      const keysToExclude = ['last_backup_data', 'last_backup_info'];
      keysToExclude.forEach(key => delete allData[key]);
      
      // Include all app and user settings
      const appSettings: Record<string, any> = {
        'app-lang': await storage.get('app-lang') || localStorage.getItem('app-lang'),
        'app-theme': await storage.get('app-theme') || localStorage.getItem('app-theme'),
        'app-fontSize': await storage.get('app-fontSize') || localStorage.getItem('app-fontSize'),
        'app-region': await storage.get('app-region') || localStorage.getItem('app-region'),
        'gemini-api-key': await storage.get('gemini-api-key') || localStorage.getItem('gemini-api-key'),
        'user-name': await storage.get('user-name') || localStorage.getItem('user-name'),
        'user-currency': await storage.get('user-currency') || localStorage.getItem('user-currency'),
        'user-currency-symbol': await storage.get('user-currency-symbol') || localStorage.getItem('user-currency-symbol'),
      };

      // Sanitize settings: remove extra quotes if they were mistakenly stored as stringified strings
      Object.keys(appSettings).forEach(key => {
        let val = appSettings[key];
        if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
          try {
            appSettings[key] = JSON.parse(val);
          } catch (e) {
            // Keep as is if not valid JSON
          }
        }
      });

      // Add version/metadata
      const backupData = {
        version: 2,
        timestamp: new Date().toISOString(),
        settings: appSettings,
        data: allData
      };

      // Save as "last backup" in storage (minified to save space)
      try {
        await storage.set('last_backup_data', backupData);
      } catch (e) {
        console.warn('[Backup] Failed to save quick-restore data to storage (likely too large):', e);
      }
      
      const now = new Date().toLocaleString();
      await storage.set('last_backup_info', { date: now });
      setLastBackupDate(now);

      // Generate filename: magic-mart-backup-YYYY-MM-DD-vN.json
      const dateStr = new Date().toISOString().split('T')[0];
      
      // Simple logic for versioning based on today's count
      const backupsToday = await storage.get<number>(`backups_count_${dateStr}`) || 0;
      const nextVersion = (backupsToday as number) + 1;
      await storage.set(`backups_count_${dateStr}`, nextVersion);

      const filename = `magic-mart-backup-${dateStr}-v${nextVersion}.json`;
      const jsonString = JSON.stringify(backupData, null, 2);
      
      // NATIVE BACKUP (Android/iOS)
      if (Capacitor.isNativePlatform()) {
        try {
          const path = `Download/${filename}`;
          console.log('[Backup] Attempting to save to:', path);

          await Filesystem.writeFile({
            path: path,
            data: jsonString,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
            recursive: true
          });
          toast.success(`${t('backupSuccess')}! Salvo na pasta Downloads/${filename}`);
          return;
        } catch (e: any) {
          console.error('[Backup] Native save error (ExternalStorage/Download):', e);

          // Tentar salvamento simplificado sem prefixo 'Download/' se falhar,
          // pois Directory.ExternalStorage as vezes já aponta para a raiz externa
          try {
            await Filesystem.writeFile({
              path: filename,
              data: jsonString,
              directory: Directory.ExternalStorage,
              encoding: Encoding.UTF8,
              recursive: true
            });
            toast.success(`${t('backupSuccess')}! Salvo na raiz do armazenamento interno.`);
            return;
          } catch (e2) {
            // Fallback para Documents se ExternalStorage falhar completamente
            try {
              await Filesystem.writeFile({
                path: filename,
                data: jsonString,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
                recursive: true
              });
              toast.success(`${t('backupSuccess')}! Salvo em Documentos/${filename}`);
              return;
            } catch (e3) {
              if (Capacitor.isNativePlatform()) {
                await Clipboard.write({ string: jsonString });
              } else {
                await navigator.clipboard.writeText(jsonString);
              }
              toast.error("Erro ao salvar. O backup foi copiado para a área de transferência.");
              return;
            }
          }
        }
      }

      // WEB BACKUP (Chrome/PC)
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Fallback: Copy to clipboard if possible
      try {
        if (Capacitor.isNativePlatform()) {
          await Clipboard.write({ string: jsonString });
        } else {
          await navigator.clipboard.writeText(jsonString);
        }
        toast.success(t('backupSuccess') + " (Copiado para área de transferência)");
      } catch (e) {
        toast.success(t('backupSuccess'));
      }
    } catch (error) {
      console.error('Backup error:', error);
      toast.error(t('backupError'));
    }
  };

    const setRestoreStatus = (status: boolean) => {
    if (status) {
      localStorage.setItem('app_is_restoring', 'true');
      sessionStorage.setItem('app_is_restoring', 'true');
    } else {
      localStorage.removeItem('app_is_restoring');
      sessionStorage.removeItem('app_is_restoring');
    }
    window.dispatchEvent(new Event('app-restore-status-change'));
  };  const restoreData = async (backupJson: any) => {
    setIsRestoring(true);
    setRestoreStatus(true);

    try {
      console.log('[Backup] Starting wipe and restore...');
      
      let data = backupJson.data;
      let settings = backupJson.settings || {};

      // Backward compatibility
      if (!data && backupJson && typeof backupJson === 'object') {
        const hasKnownKeys = 'stock_items' in backupJson || 'shopping_lists' in backupJson || 'purchase_history' in backupJson;
        if (hasKnownKeys) data = backupJson;
      }

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid format: no data found');
      }

      const entries = Object.entries(data);
      const essentialPrefixes = [
        'sb-', 'supabase-', 'supabase.auth', 'app-theme', 'app-lang', 
        'user-name', 'user-currency', 'user-currency-symbol', 
        'app-fontSize', 'gemini-api-key', 'magicmart_install_date',
        'nav_stack', 'history_filter', 'app_is_restoring'
      ];
      const dataKeysToMirrorInLocalStorage = ['stock_items', 'shopping_lists', 'purchase_history'];
      
      // Clear current app data
      const currentKeys = await storage.keys();
      for (const key of currentKeys) {
        const isEssential = essentialPrefixes.some(prefix => key.startsWith(prefix));
        if (!isEssential) await storage.remove(key);
      }
      
      // Sweep localStorage
      Object.keys(localStorage).forEach(key => {
        const isEssential = essentialPrefixes.some(prefix => key.startsWith(prefix));
        if (!isEssential && key !== 'app_is_restoring') {
          localStorage.removeItem(key);
        }
      });

      // Restore data from backup
      let restoredCount = 0;
      for (const [key, value] of entries) {
        const isAuthKey = key.startsWith('sb-') || key.startsWith('supabase.auth');
        if (!isAuthKey) {
          let valueToRestore = value;
          if (key === 'stock_items' && Array.isArray(value)) {
            const excludedStrings = [
              'Manutenção', 'Restaurante', 'Transporte', 'Combustível',
              'Casa e Manutenção', 'Bares e Restaurantes', 'Transporte e Apps',
              'Maintenance', 'Restaurant', 'Transport', 'Fuel',
              'Home & Maintenance', 'Dining & Drinks', 'Transport & Fuel',
              'Mantenimiento', 'Restaurante', 'Transporte', 'Combustible',
              'Hogar y Mantenimiento', 'Bares y Restaurantes', 'Transporte e Apps'
            ];
            valueToRestore = value.filter((item: any) => {
              if (!item.category) return true;
              return !excludedStrings.some(ex => ex.toLowerCase() === String(item.category).toLowerCase());
            });
          }
          await storage.set(key, valueToRestore);
          if (dataKeysToMirrorInLocalStorage.includes(key)) {
            localStorage.setItem(key, typeof valueToRestore === 'string' ? valueToRestore : JSON.stringify(valueToRestore));
          }
          restoredCount++;
        }
      }

      // Restore settings
      const settingsToRestore = ['app-lang', 'app-theme', 'app-fontSize', 'gemini-api-key', 'user-currency', 'user-currency-symbol', 'user-name', 'app-region'];
      for (const key of settingsToRestore) {
        let val = settings[key] ?? data[key];
        if (val !== undefined && val !== null) {
          await storage.set(key, val);
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }

      console.log(`[Backup] Restoration completed. ${restoredCount} items restored.`);
      toast.success(t('restoreSuccess'));

      setTimeout(() => {
        window.location.reload();
      }, 3500);
    } catch (error: any) {
      console.error('[Backup] Restore failed:', error);
      setRestoreStatus(false);
      toast.error(error.message || t('restoreError'));
      setIsRestoring(false);
    }
  };

  const handleRestoreLast = async () => {
    const last = await storage.get('last_backup_data');
    if (!last) {
      toast.error(t('noLastBackup'));
      return;
    }
    
    setRestoreStatus(true);
    setPendingData(last);
    setIsConfirmOpen(true);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleRestoreFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) {
      // If user canceled, we already logged them out. 
      // We could try to restore session here, but user asked for logout on click.
      return;
    }

    console.log('[Backup] Reading file:', file.name);
    
    // 1. Prepare for restoration state
    setRestoreStatus(true);
    sessionStorage.setItem('app_is_restoring', 'true');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        console.log('[Backup] File read complete, parsing JSON...');
        const content = event.target?.result as string;
        const json = JSON.parse(content);
        
        const isLegacyFormat = json && ('stock_items' in json || 'shopping_lists' in json || 'purchase_history' in json);
        const isNewFormat = json && json.data && typeof json.data === 'object';
        
        if (!isNewFormat && !isLegacyFormat) {
          console.error('[Backup] Invalid backup format detected');
          toast.error("Formato de backup inválido");
          setRestoreStatus(false);
          sessionStorage.removeItem('app_is_restoring');
          input.value = '';
          return;
        }

        console.log('[Backup] Backup valid. Deferring confirmation dialog open...');
        
        // Use a small delay to ensure React has processed status-change re-renders
        setTimeout(() => {
          setPendingData(json);
          setIsConfirmOpen(true);
          console.log('[Backup] Confirmation dialog should be open now');
          input.value = '';
        }, 300);
      } catch (err) {
        console.error('[Backup] Error processing backup file:', err);
        setRestoreStatus(false);
        sessionStorage.removeItem('app_is_restoring');
        toast.error(t('restoreError'));
        input.value = '';
      }
    };
    reader.onerror = () => {
      console.error('[Backup] FileReader encountered an error');
      setRestoreStatus(false);
      sessionStorage.removeItem('app_is_restoring');
      toast.error("Erro na leitura do arquivo");
      input.value = '';
    };
    reader.readAsText(file);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="pb-20">
      <PageHeader 
        title={t('backup')} 
        subtitle={t('backupDesc')} 
        onBack={onBack}
      />

      <div className="p-4 space-y-6">
        {/* Status Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/5 border border-primary/10 rounded-2xl p-6 text-center space-y-3"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <History className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('backupStatus')}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {lastBackupDate 
                ? `${t('lastBackupFound')} ${lastBackupDate}`
                : t('noLastBackup')
              }
            </p>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={handleBackup} 
            className="w-full h-14 gradient-primary text-primary-foreground border-0 shadow-lg flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5" />
              <div className="text-left">
                <p className="font-bold">{t('makeBackup')}</p>
                <p className="text-[10px] opacity-80">{t('saveOnDevice')}</p>
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            onClick={handleRestoreLast}
            disabled={!lastBackupDate || isRestoring}
            className="w-full h-14 bg-card border-border shadow-sm flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-primary" />
              <div className="text-left">
                <p className="font-bold text-foreground">{t('restoreLastBackup')}</p>
                <p className="text-[10px] text-muted-foreground">{t('recoverLocalBackup')}</p>
              </div>
            </div>
          </Button>

          <div className="relative">
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleRestoreFromFile}
              className="hidden"
              disabled={isRestoring}
            />
            <Button 
              variant="outline" 
              onClick={triggerFileSelect}
              disabled={isRestoring}
              className="w-full h-14 bg-card border-border shadow-sm flex items-center justify-between px-6"
            >
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <p className="font-bold text-foreground">{t('restoreFromFile')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('selectJsonFile')}</p>
                </div>
              </div>
            </Button>
          </div>
        </div>

        {/* Security Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-900">{t('attention')}</p>
            <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
              {t('backupWarning')}
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Button
            variant="outline"
            onClick={() => setConfirmReset(true)}
            className="w-full h-14 bg-destructive/5 border-destructive/20 hover:bg-destructive/10 shadow-sm flex items-center justify-between px-6 group transition-all"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-destructive group-hover:rotate-[-45deg] transition-transform" />
              <div className="text-left">
                <p className="font-bold text-destructive">{t('resetAll')}</p>
                <p className="text-[10px] text-muted-foreground">{t('resetDesc')}</p>
              </div>
            </div>
          </Button>
        </div>
      </div>

      {isRestoring && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent animate-spin rounded-full" />
          <p className="text-sm font-bold text-primary">{t('restoringData')}</p>
          <p className="text-xs text-muted-foreground">{t('appWillRestart')}</p>
        </div>
      )}

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="w-[90vw] rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resetAll')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmReset')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel className="mt-0 flex-1 rounded-xl">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl border-0">
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={(open) => {
        if (!open) {
          localStorage.removeItem('app_is_restoring');
          sessionStorage.removeItem('app_is_restoring');
          setPendingData(null);
        }
        setIsConfirmOpen(open);
      }}>
        <AlertDialogContent className="w-[90vw] rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restoreFromFile')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmRestore')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel 
              onClick={() => {
                localStorage.removeItem('app_is_restoring');
                sessionStorage.removeItem('app_is_restoring');
                setPendingData(null);
              }}
              className="mt-0 flex-1 rounded-xl"
            >{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (pendingData) {
                  restoreData(pendingData);
                }
                setIsConfirmOpen(false);
              }} 
              className="flex-1 gradient-primary text-primary-foreground rounded-xl border-0 shadow-lg"
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
