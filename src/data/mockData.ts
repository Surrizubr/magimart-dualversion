
import { ShoppingList, StockItem, PurchaseHistory } from '@/types';
import { storage } from '@/lib/storage';

const defaultLists: ShoppingList[] = [];
const defaultStock: StockItem[] = [];
const defaultHistory: PurchaseHistory[] = [];

// Cache síncrono para não quebrar a interface do usuário
let stockCache: StockItem[] = [];
let listsCache: ShoppingList[] = [];
let historyCache: PurchaseHistory[] = [];
let isLoaded = false;

export async function initializeLocalData() {
  if (isLoaded) {
    console.log('[MockData] Data already loaded');
    return;
  }
  
  console.log('[MockData] Starting initialization...');
  
  // Check if a restore was just happening to prevent race conditions
  const isRestoring = localStorage.getItem('app_is_restoring');
  if (isRestoring === 'true') {
    console.log('[MockData] Restore detected in progress, waiting longer for storage flush...');
    await new Promise(resolve => setTimeout(resolve, 3500));
    // We NO LONGER clear the flag here. BackupPage will handle it on next meaningful interaction or reload.
    console.log('[MockData] Proceeding with fetch during restoration...');
  }

  try {
    // Tentar carregar da memória física do smartphone
    console.log('[MockData] Fetching stock...');
    const stock = await storage.get<StockItem[]>('stock_items');
    console.log('[MockData] Fetching lists...');
    const lists = await storage.get<ShoppingList[]>('shopping_lists');
    console.log('[MockData] Fetching history...');
    const history = await storage.get<PurchaseHistory[]>('purchase_history');

    console.log('[MockData] Processing data:', { 
      hasStock: !!stock, 
      hasLists: !!lists, 
      hasHistory: !!history,
      stockCount: stock?.length || 0
    });

    // Se não houver nada, usa os padrões e salva
    if (!stock) {
      console.log('[MockData] No stock found, using defaults');
      stockCache = defaultStock;
      storage.set('stock_items', defaultStock).catch(e => console.warn('[MockData] Failed to save default stock:', e));
    } else {
      stockCache = stock;
    }

    if (!lists) {
      console.log('[MockData] No lists found, using defaults');
      listsCache = defaultLists;
      storage.set('shopping_lists', defaultLists).catch(e => console.warn('[MockData] Failed to save default lists:', e));
    } else {
      listsCache = lists;
    }

    if (!history) {
      console.log('[MockData] No history found, using defaults');
      historyCache = defaultHistory;
      storage.set('purchase_history', defaultHistory).catch(e => console.warn('[MockData] Failed to save default history:', e));
    } else {
      historyCache = history;
    }

    isLoaded = true;
    console.log('[MockData] Initialization complete');
  } catch (error) {
    console.error("[MockData] Failed to initialize local data, falling back to defaults:", error);
    stockCache = defaultStock;
    listsCache = defaultLists;
    historyCache = defaultHistory;
    isLoaded = true;
  }
}

// Funções síncronas para as páginas usarem sem delay
export function getStock(): StockItem[] {
  // Fallback para localStorage se o cache ainda não estiver pronto (compatibilidade)
  if (!isLoaded) {
    try {
      const fallback = localStorage.getItem('stock_items');
      return fallback ? JSON.parse(fallback) : defaultStock;
    } catch (e) {
      console.error("Error parsing stock_items", e);
      return defaultStock;
    }
  }
  return stockCache;
}

export function getLists(): ShoppingList[] {
  if (!isLoaded) {
    try {
      const fallback = localStorage.getItem('shopping_lists');
      return fallback ? JSON.parse(fallback) : defaultLists;
    } catch (e) {
      console.error("Error parsing shopping_lists", e);
      return defaultLists;
    }
  }
  return listsCache;
}

export function getHistory(): PurchaseHistory[] {
  if (!isLoaded) {
    try {
      const fallback = localStorage.getItem('purchase_history');
      return fallback ? JSON.parse(fallback) : defaultHistory;
    } catch (e) {
      console.error("Error parsing purchase_history", e);
      return defaultHistory;
    }
  }
  return historyCache;
}

export async function saveStock(data: StockItem[]) {
  stockCache = data;
  await storage.set('stock_items', data);
  // Manter localStorage sincronizado para compatibilidade web
  localStorage.setItem('stock_items', JSON.stringify(data));
}

export async function saveLists(data: ShoppingList[]) {
  listsCache = data;
  await storage.set('shopping_lists', data);
  localStorage.setItem('shopping_lists', JSON.stringify(data));
}

export async function saveHistory(data: PurchaseHistory[]) {
  historyCache = data;
  await storage.set('purchase_history', data);
  localStorage.setItem('purchase_history', JSON.stringify(data));
}

export async function resetAllData() {
  // Clear Capacitor Preferences
  await storage.clear();
  // Clear LocalStorage (including API Key, tabs, filters, etc.)
  localStorage.clear();
  
  stockCache = [];
  listsCache = [];
  historyCache = [];
  
  // Also clear session-based state if any
  sessionStorage.clear();
  
  // Reload to apply clean state
  window.location.reload();
}
