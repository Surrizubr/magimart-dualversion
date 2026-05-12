
import { getStock, saveStock, getHistory, saveHistory } from '@/data/mockData';
import { saveProductMapping } from './categoryMappings';

/**
 * Updates the category of a product across all data structures (Stock and History),
 * and saves the mapping for future imports.
 */
export async function updateProductCategorySync(productName: string, newCategory: string) {
  const normalizedName = productName.toLowerCase().trim();
  
  // 1. Save mapping for future AI/Auto-categorization
  await saveProductMapping(productName, newCategory);
  
  // 2. Update all occurrences in History
  const history = getHistory();
  let historyChanged = false;
  const updatedHistory = history.map(item => {
    if (item.product_name.toLowerCase().trim() === normalizedName) {
      if (item.category !== newCategory) {
        historyChanged = true;
        return { ...item, category: newCategory };
      }
    }
    return item;
  });
  
  if (historyChanged) {
    await saveHistory(updatedHistory);
  }
  
  // 3. Update all occurrences in Stock
  const stock = getStock();
  let stockChanged = false;
  const updatedStock = stock.map(item => {
    if (item.product_name.toLowerCase().trim() === normalizedName) {
      if (item.category !== newCategory) {
        stockChanged = true;
        return { ...item, category: newCategory };
      }
    }
    return item;
  });
  
  if (stockChanged) {
    await saveStock(updatedStock);
  }
  
  return { historyChanged, stockChanged };
}
