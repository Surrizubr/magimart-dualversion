import { ShoppingList, StockItem } from '@/types';
import { toast } from 'sonner';
import { getLists, saveLists } from '@/data/mockData';

const REMINDER_LIST_NAME = 'Lembrete de Compras';

export async function getOrCreateReminderList(): Promise<ShoppingList> {
  const lists = getLists();
  let reminder = lists.find(l => l.name === REMINDER_LIST_NAME && l.status !== 'archived');
  if (!reminder) {
    reminder = {
      id: `reminder_${Date.now()}`,
      name: REMINDER_LIST_NAME,
      status: 'active',
      total_items: 0,
      checked_items: 0,
      estimated_total: 0,
      actual_total: 0,
      created_at: new Date().toISOString().slice(0, 10),
      items: [],
    };
    const updatedLists = [reminder, ...lists];
    await saveLists(updatedLists);
  }
  return reminder;
}

export async function addToReminderList(product: { product_name: string; category: string; unit: string; last_price?: number; quantity?: number }) {
  const lists = [...getLists()];
  let reminder = lists.find(l => l.name === REMINDER_LIST_NAME && l.status !== 'archived');
  
  if (!reminder) {
    reminder = {
      id: `reminder_${Date.now()}`,
      name: REMINDER_LIST_NAME,
      status: 'active',
      total_items: 0,
      checked_items: 0,
      estimated_total: 0,
      actual_total: 0,
      created_at: new Date().toISOString().slice(0, 10),
      items: [],
    };
    lists.unshift(reminder);
  } else {
    // Deep copy to avoid mutating the original object before saving
    reminder = { ...reminder, items: [...reminder.items] };
    const idx = lists.findIndex(l => l.id === reminder!.id);
    lists[idx] = reminder;
  }

  const existing = reminder.items.find(i => i.product_name.toLowerCase() === product.product_name.toLowerCase());
  if (existing) {
    const existingIdx = reminder.items.findIndex(i => i.id === existing.id);
    reminder.items[existingIdx] = { 
      ...existing, 
      quantity: existing.quantity + (product.quantity || 1) 
    };
  } else {
    reminder.items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      list_id: reminder.id,
      product_name: product.product_name,
      category: product.category,
      quantity: product.quantity || 1,
      unit: product.unit,
      estimated_price: product.last_price || 0,
      actual_price: 0,
      is_checked: false,
    });
  }

  reminder.total_items = reminder.items.length;
  reminder.estimated_total = reminder.items.reduce((sum, i) => sum + i.estimated_price * i.quantity, 0);

  // Ensure reminder is at the top
  const idx = lists.findIndex(l => l.id === reminder!.id);
  if (idx > 0) {
    lists.splice(idx, 1);
    lists.unshift(reminder);
  }

  await saveLists(lists);
  toast.success(`${product.product_name} adicionado à lista Lembrete de Compras`);
}

export const REMINDER_LIST_NAME_CONST = REMINDER_LIST_NAME;

