import { StockItem, PurchaseHistory, ShoppingList } from '@/types';

/**
 * Computes how many days are left for a stock item based on:
 *  - current quantity
 *  - daily consumption rate (learned from purchase history)
 *  - days elapsed since last purchase (so the value decreases day by day)
 */
export function computeDaysLeft(item: StockItem & { last_purchase_date?: string }): number {
  const rate = item.daily_consumption_rate || 0;
  if (rate <= 0) return 99;

  // Effective remaining quantity = quantity - (days since last purchase * rate)
  let effectiveQty = item.quantity;
  if (item.last_purchase_date) {
    const last = new Date(item.last_purchase_date).getTime();
    if (!isNaN(last)) {
      const daysElapsed = Math.max(0, (Date.now() - last) / (1000 * 60 * 60 * 24));
      effectiveQty = item.quantity - daysElapsed * rate;
    }
  }

  if (effectiveQty <= 0) return 0;
  return Math.max(0, Math.ceil(effectiveQty / rate));
}

/**
 * Derives stock status from days left and minimum quantity.
 * critical: 0-3 days left
 * low: 4-7 days left or below min_quantity
 * ok: otherwise
 */
export function deriveStatus(item: StockItem & { last_purchase_date?: string }): StockItem['status'] {
  const days = computeDaysLeft(item);
  if (days <= 3) return 'critical';
  if (days <= 7 || item.quantity <= item.min_quantity) return 'low';
  return 'ok';
}

/**
 * Updates all stock items in localStorage with fresh status based on
 * computed days left. Called on app start and once per day.
 */
export function refreshStockStatuses(): StockItem[] {
  const stock: (StockItem & { last_purchase_date?: string })[] =
    JSON.parse(localStorage.getItem('stock_items') || '[]');
  if (stock.length === 0) return stock;

  let changed = false;
  stock.forEach(item => {
    const newStatus = deriveStatus(item);
    if (item.status !== newStatus) {
      item.status = newStatus;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem('stock_items', JSON.stringify(stock));
  }
  localStorage.setItem('stock_last_refresh', new Date().toISOString().split('T')[0]);
  return stock;
}

/**
 * Sets last_purchase_date on stock items based on the most recent purchase
 * found in history. Should be called whenever history changes.
 */
export function syncLastPurchaseDates(): void {
  const stock: (StockItem & { last_purchase_date?: string })[] =
    JSON.parse(localStorage.getItem('stock_items') || '[]');
  const history: PurchaseHistory[] =
    JSON.parse(localStorage.getItem('purchase_history') || '[]');
  if (stock.length === 0) return;

  let changed = false;
  stock.forEach(item => {
    const matches = history
      .filter(h => h.product_name.toLowerCase() === item.product_name.toLowerCase())
      .map(h => h.purchase_date)
      .sort()
      .reverse();
    if (matches.length > 0 && item.last_purchase_date !== matches[0]) {
      item.last_purchase_date = matches[0];
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem('stock_items', JSON.stringify(stock));
  }
}

/**
 * Returns a human-readable string for "comprado X dias atrás".
 */
export function daysSincePurchase(item: StockItem & { last_purchase_date?: string }): number | null {
  if (!item.last_purchase_date) return null;
  const last = new Date(item.last_purchase_date).getTime();
  if (isNaN(last)) return null;
  return Math.max(0, Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24)));
}

/**
 * Returns the estimated price for a product based on history.
 * Uses exact matches first. If none, tries to find similar products by name similarity.
 */
export function getEstimatedPrice(productName: string, history: PurchaseHistory[], stock: StockItem[] = []): number {
  if (!productName) return 0;

  const normalizedTarget = productName.toLowerCase().trim();
  
  // 1. Try exact matches first in history
  if (history && history.length > 0) {
    const exactMatches = history
      .filter(h => h.product_name.toLowerCase().trim() === normalizedTarget)
      .sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());

    if (exactMatches.length > 0) {
      // Use last 3 purchases to average out some variations
      const last3 = exactMatches.slice(0, 3);
      const sum = last3.reduce((acc, curr) => acc + curr.price, 0);
      return sum / last3.length;
    }
  }

  // 2. Try exact match in stock
  if (stock && stock.length > 0) {
    const stockMatch = stock.find(s => s.product_name.toLowerCase().trim() === normalizedTarget);
    if (stockMatch && stockMatch.last_price > 0) {
      return stockMatch.last_price;
    }
  }

  // 3. If no exact match, look for similar products in history
  if (history && history.length > 0) {
    const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length > 0) {
      const similarityScores = history.map(h => {
        const hName = h.product_name.toLowerCase().trim();
        const hWords = hName.split(/\s+/).filter(w => w.length > 2);
        if (hWords.length === 0) return { item: h, score: 0 };

        const intersection = targetWords.filter(w => hWords.includes(w));
        const score = (2.0 * intersection.length) / (targetWords.length + hWords.length);
        return { item: h, score };
      });

      const similarItems = similarityScores
        .filter(s => s.score > 0.3)
        .sort((a, b) => b.score - a.score || new Date(b.item.purchase_date).getTime() - new Date(a.item.purchase_date).getTime());

      if (similarItems.length > 0) {
        const topScore = similarItems[0].score;
        const selectedItems = similarItems.filter(s => s.score >= topScore * 0.8).slice(0, 5);
        const sum = selectedItems.reduce((acc, curr) => acc + curr.item.price, 0);
        return sum / selectedItems.length;
      }
    }
  }

  // 4. Try similar matches in stock if history failed
  if (stock && stock.length > 0) {
    const targetWords = normalizedTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length > 0) {
      const similarityScores = stock.map(s => {
        const sName = s.product_name.toLowerCase().trim();
        const sWords = sName.split(/\s+/).filter(w => w.length > 2);
        if (sWords.length === 0) return { item: s, score: 0 };

        const intersection = targetWords.filter(w => sWords.includes(w));
        const score = (2.0 * intersection.length) / (targetWords.length + sWords.length);
        return { item: s, score };
      });

      const similarItems = similarityScores
        .filter(s => s.score > 0.3 && s.item.last_price > 0)
        .sort((a, b) => b.score - a.score);

      if (similarItems.length > 0) {
        const topScore = similarItems[0].score;
        const selectedItems = similarItems.filter(s => s.score >= topScore * 0.8).slice(0, 3);
        const sum = selectedItems.reduce((acc, curr) => acc + curr.item.last_price, 0);
        return sum / selectedItems.length;
      }
    }
  }

  return 0;
}

/**
 * Automatically fills missing estimated prices in a shopping list
 * using purchase history and current stock information.
 */
export function autoFillListPrices(list: ShoppingList, history: PurchaseHistory[], stock: StockItem[]): ShoppingList {
  let changed = false;
  const updatedItems = list.items.map(item => {
    if (item.estimated_price === 0 || !item.estimated_price) {
      const estimated = getEstimatedPrice(item.product_name, history, stock);
      if (estimated > 0) {
        changed = true;
        return { ...item, estimated_price: estimated };
      }
    }
    return item;
  });
  
  if (!changed) return list;
  
  const estimated_total = updatedItems.reduce((acc, curr) => acc + (curr.estimated_price * curr.quantity), 0);
  
  return { ...list, items: updatedItems, estimated_total };
}

/**
 * Sort stock items by criticality (least days left first).
 */
export function sortByCriticality<T extends StockItem & { last_purchase_date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => computeDaysLeft(a) - computeDaysLeft(b));
}
