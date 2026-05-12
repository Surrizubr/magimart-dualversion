import { PurchaseHistory } from '@/types';

/**
 * Calculates the daily consumption rate for a product based on purchase history.
 * 
 * Logic: If a product was bought multiple times, each repurchase implies the previous
 * batch was consumed. The interval between purchases divided by the quantity purchased
 * gives us the consumption rate.
 * 
 * Example: Bought 2 units on Jan 1, bought 3 units on Jan 15 → 2 units lasted 14 days → 0.14/day
 */
export function calculateConsumptionRate(
  productName: string,
  history: PurchaseHistory[]
): { rate: number; purchaseCount: number; avgDurationDays: number | null } {
  // Get all purchases of this product, sorted by date ascending
  const purchases = history
    .filter(h => h.product_name.toLowerCase() === productName.toLowerCase())
    .map(h => ({
      date: new Date(h.purchase_date),
      quantity: h.quantity,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (purchases.length < 2) {
    // Not enough data to learn — return default
    return { rate: 0.1, purchaseCount: purchases.length, avgDurationDays: null };
  }

  // Calculate intervals: each gap between consecutive purchases tells us
  // how long the previous quantity lasted
  const intervals: { days: number; quantity: number }[] = [];
  for (let i = 1; i < purchases.length; i++) {
    const daysDiff = Math.max(1, Math.round(
      (purchases[i].date.getTime() - purchases[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
    ));
    intervals.push({
      days: daysDiff,
      quantity: purchases[i - 1].quantity,
    });
  }

  // Weighted average: total quantity consumed / total days
  const totalQty = intervals.reduce((sum, iv) => sum + iv.quantity, 0);
  const totalDays = intervals.reduce((sum, iv) => sum + iv.days, 0);

  const rate = totalQty / totalDays;
  const avgDurationDays = Math.round(totalDays / intervals.length);

  return {
    rate: Math.round(rate * 1000) / 1000, // 3 decimal precision
    purchaseCount: purchases.length,
    avgDurationDays,
  };
}

/**
 * Recalculates consumption rates for provided stock items based on purchase history.
 * Returns the updated stock array.
 */
export function recalculateStockRates(stock: any[], history: PurchaseHistory[]): any[] {
  if (stock.length === 0) return stock;

  return stock.map((item: any) => {
    const newItem = { ...item };
    // Update last_purchase_date from history
    const matches = history
      .filter(h => h.product_name.toLowerCase() === item.product_name.toLowerCase())
      .map(h => h.purchase_date)
      .sort()
      .reverse();
    
    if (matches.length > 0) {
      newItem.last_purchase_date = matches[0];
    }

    // Learn consumption rate when we have 2+ purchases
    const result = calculateConsumptionRate(item.product_name, history);
    if (result.purchaseCount >= 2) {
      newItem.daily_consumption_rate = result.rate;
      newItem.learned_consumption = true;
      newItem.purchase_count = result.purchaseCount;
      newItem.avg_duration_days = result.avgDurationDays;
    }
    return newItem;
  });
}

/**
 * Recalculates all consumption rates and updates localStorage.
 * Returns the updated stock items for sync purposes.
 */
export function recalculateAllConsumptionRates(): any[] | null {
  try {
    const stock = JSON.parse(localStorage.getItem('stock_items') || '[]');
    const history: PurchaseHistory[] = JSON.parse(localStorage.getItem('purchase_history') || '[]');
    
    if (stock.length === 0) return null;

    const updatedStock = recalculateStockRates(stock, history);
    localStorage.setItem('stock_items', JSON.stringify(updatedStock));
    return updatedStock;
  } catch (err) {
    console.error('Error recalculating consumption rates:', err);
    return null;
  }
}
