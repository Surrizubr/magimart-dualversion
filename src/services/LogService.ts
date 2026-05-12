import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  stack?: string;
  context?: any;
}

const LOG_LIMIT = 50;
const STORAGE_KEY = 'app_error_logs';

export const LogService = {
  log: (level: LogEntry['level'], message: string, context?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stack: level === 'error' ? new Error().stack : undefined
    };

    console[level](`[${level.toUpperCase()}] ${message}`, context || '');

    try {
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      logs.unshift(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, LOG_LIMIT)));
    } catch (e) {
      console.warn('Failed to save log to localStorage', e);
    }
  },

  info: (message: string, context?: any) => LogService.log('info', message, context),
  warn: (message: string, context?: any) => LogService.log('warn', message, context),
  error: (message: string, context?: any) => LogService.log('error', message, context),

  getLogs: (): LogEntry[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  exportToDownloads: async () => {
    try {
      const logs = LogService.getLogs();
      const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message} ${l.context ? JSON.stringify(l.context) : ''}`).join('\n');

      await Filesystem.writeFile({
        path: 'magicmart_logs.txt',
        data: text,
        directory: Directory.Documents, // On Android this is often easier to find or maps to visible storage
        encoding: Encoding.UTF8,
      });
      return true;
    } catch (e) {
      console.error('Failed to export logs', e);
      return false;
    }
  },

  clearLogs: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
