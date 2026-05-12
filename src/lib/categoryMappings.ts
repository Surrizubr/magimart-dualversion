
import { storage } from './storage';

interface ProductMapping {
  productName: string;
  category: string;
}

const STORAGE_KEY = 'product_category_mappings';

export async function getProductMappings(): Promise<Record<string, string>> {
  const mappings = await storage.get<Record<string, string>>(STORAGE_KEY);
  return mappings || {};
}

export async function saveProductMapping(productName: string, category: string) {
  const normalizedName = productName.toLowerCase().trim();
  const mappings = await getProductMappings();
  mappings[normalizedName] = category;
  await storage.set(STORAGE_KEY, mappings);
}

export async function getCategoryForProduct(productName: string): Promise<string | null> {
  const normalizedName = productName.toLowerCase().trim();
  const mappings = await getProductMappings();
  return mappings[normalizedName] || null;
}
