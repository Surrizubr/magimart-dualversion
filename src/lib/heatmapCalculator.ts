
import { PurchaseHistory } from '@/types';

export enum PriceLevel {
  VERY_CHEAP = 0,
  CHEAP = 1,
  OK = 2,
  EXPENSIVE = 3,
  VERY_EXPENSIVE = 4
}

interface TemporalStats {
  sumEfficiency: number;
  count: number;
}

export function calculateHeatmapData(history: PurchaseHistory[]) {
  if (history.length === 0) return null;

  // 1. Find min prices per product
  const minPrices: Record<string, number> = {};
  history.forEach(item => {
    const name = item.product_name.toLowerCase();
    if (!minPrices[name] || item.price < minPrices[name]) {
      minPrices[name] = item.price;
    }
  });

  // 2. Group efficiency by day of week and day of month
  const weekStats: Record<number, TemporalStats> = {};
  const monthStats: Record<number, TemporalStats> = {};

  history.forEach(item => {
    const name = item.product_name.toLowerCase();
    const minPrice = minPrices[name];
    const efficiency = item.price > 0 ? minPrice / item.price : 1;

    const date = new Date(item.purchase_date + 'T12:00:00');
    const dayOfWeek = date.getDay(); // 0-6
    const dayOfMonth = date.getDate(); // 1-31

    // Week stats
    if (!weekStats[dayOfWeek]) weekStats[dayOfWeek] = { sumEfficiency: 0, count: 0 };
    weekStats[dayOfWeek].sumEfficiency += efficiency;
    weekStats[dayOfWeek].count += 1;

    // Month stats
    if (!monthStats[dayOfMonth]) monthStats[dayOfMonth] = { sumEfficiency: 0, count: 0 };
    monthStats[dayOfMonth].sumEfficiency += efficiency;
    monthStats[dayOfMonth].count += 1;
  });

  // 3. Calculate averages
  const weekAverages: Record<number, number> = {};
  Object.entries(weekStats).forEach(([day, stats]) => {
    weekAverages[Number(day)] = stats.sumEfficiency / stats.count;
  });

  const monthAverages: Record<number, number> = {};
  Object.entries(monthStats).forEach(([day, stats]) => {
    monthAverages[Number(day)] = stats.sumEfficiency / stats.count;
  });

  return { weekAverages, monthAverages };
}

export function getPriceLevelForDate(
  date: Date, 
  stats: { weekAverages: Record<number, number>, monthAverages: Record<number, number> } | null
): PriceLevel {
  if (!stats) return PriceLevel.OK;

  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();

  const weekAvg = stats.weekAverages[dayOfWeek] ?? 0.85; // Fallback to a neutral-ish value
  const monthAvg = stats.monthAverages[dayOfMonth] ?? 0.85;

  // Combine both (weighted 50/50)
  const combinedScore = (weekAvg + monthAvg) / 2;

  // Score mapping to levels:
  // Usually efficiency stays between 0.7 and 1.0
  if (combinedScore > 0.94) return PriceLevel.VERY_CHEAP;
  if (combinedScore > 0.88) return PriceLevel.CHEAP;
  if (combinedScore > 0.78) return PriceLevel.OK;
  if (combinedScore > 0.65) return PriceLevel.EXPENSIVE;
  return PriceLevel.VERY_EXPENSIVE;
}
