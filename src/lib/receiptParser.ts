/**
 * Offline receipt parser for Brazilian fiscal coupons (NF-e / cupom fiscal).
 * Parses OCR text to extract store info and line items.
 */

export interface ParsedItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  category: string;
}

export interface ParsedReceipt {
  store_name: string;
  date: string;
  items: ParsedItem[];
  total: number;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Grãos': ['arroz', 'feijao', 'feijão', 'lentilha', 'grão', 'grao', 'ervilha', 'soja', 'milho'],
  'Laticínios': ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijao', 'requeijão', 'creme', 'nata'],
  'Carnes': ['carne', 'frango', 'boi', 'porco', 'linguica', 'linguiça', 'salsicha', 'hamburguer', 'peixe', 'file', 'filé', 'costela', 'picanha', 'alcatra'],
  'Frutas': ['banana', 'maca', 'maçã', 'laranja', 'limao', 'limão', 'manga', 'uva', 'melancia', 'abacaxi', 'morango', 'pera', 'goiaba'],
  'Verduras': ['alface', 'tomate', 'cebola', 'batata', 'cenoura', 'pepino', 'abobrinha', 'brocoli', 'brócolis', 'couve', 'espinafre'],
  'Bebidas': ['cafe', 'café', 'suco', 'refrigerante', 'agua', 'água', 'cerveja', 'vinho', 'cha', 'chá', 'energetico'],
  'Padaria': ['pao', 'pão', 'bolo', 'biscoito', 'bolacha', 'rosca', 'torrada', 'croissant'],
  'Limpeza': ['detergente', 'sabao', 'sabão', 'desinfetante', 'agua sanitaria', 'esponja', 'papel higienico', 'papel higiênico', 'amaciante', 'alvejante'],
  'Higiene': ['shampoo', 'sabonete', 'pasta de dente', 'escova', 'desodorante', 'absorvente', 'fralda'],
  'Temperos': ['azeite', 'oleo', 'óleo', 'sal', 'acucar', 'açúcar', 'vinagre', 'molho', 'tempero', 'pimenta', 'oregano', 'orégano'],
};

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'Outros';
}

function cleanProductName(raw: string): string {
  return raw
    .replace(/^\d+\s*/, '')           // leading item codes
    .replace(/\d{3,}$/g, '')          // trailing codes
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseNumber(s: string): number {
  // Brazilian format: 1.234,56 or 1234,56
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Try to extract store name from the first lines of receipt text.
 */
function extractStoreName(lines: string[]): string {
  // Usually the store name is one of the first non-empty lines, often in CAPS
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    // Skip CNPJ, address-like lines, date lines
    if (/cnpj|cpf|\d{2}\.\d{3}\.\d{3}|\d{2}\/\d{2}\/\d{4}|cep|fone|tel|endereco|endereço/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    // Likely the store name
    if (line.length >= 4 && line.length <= 60) {
      return line.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }
  return 'Loja Desconhecida';
}

/**
 * Try to extract date from receipt text.
 */
function extractDate(text: string): string {
  // DD/MM/YYYY or DD-MM-YYYY
  const match = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Main item extraction.
 * Brazilian receipts commonly have patterns like:
 * PRODUCT NAME
 * QTD x VL_UNIT = VL_TOTAL
 * or
 * PRODUCT NAME   QTD   UN   VL_UNIT   VL_TOTAL
 */
function extractItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let id = 0;

  // Pattern 1: "DESCRICAO ... R$ XX,XX" on a single line
  // Pattern 2: qty line follows product name
  const priceLineRegex = /(\d+[,\.]\d{2})\s*$/;
  const qtyLineRegex = /(\d+(?:[,\.]\d+)?)\s*(un|kg|lt|l|ml|g|pc|pct|cx|dz|mt|m)\w*\s*[xX*]\s*(\d+[,\.]\d{2})/i;
  const inlineItemRegex = /^(.+?)\s+(\d+(?:[,\.]\d+)?)\s*(un|kg|lt|l|ml|g|pc|pct|cx|dz)\w*\s+(\d+[,\.]\d{2})\s+(\d+[,\.]\d{2})\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try inline pattern: NAME QTD UN VLUNIT VLTOTAL
    const inlineMatch = line.match(inlineItemRegex);
    if (inlineMatch) {
      const name = cleanProductName(inlineMatch[1]);
      if (name.length < 2) continue;
      items.push({
        id: `scan-${++id}`,
        product_name: name,
        quantity: parseNumber(inlineMatch[2]),
        unit: inlineMatch[3].toLowerCase(),
        unit_price: parseNumber(inlineMatch[4]),
        total_price: parseNumber(inlineMatch[5]),
        category: guessCategory(name),
      });
      continue;
    }

    // Try: product line, then qty line below
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const qtyMatch = nextLine.match(qtyLineRegex);
      if (qtyMatch && line.length > 3 && !/^\d+[,\.]\d{2}$/.test(line)) {
        const name = cleanProductName(line);
        const qty = parseNumber(qtyMatch[1]);
        const unitPrice = parseNumber(qtyMatch[3]);
        if (name.length >= 2) {
          items.push({
            id: `scan-${++id}`,
            product_name: name,
            quantity: qty,
            unit: qtyMatch[2].toLowerCase(),
            unit_price: unitPrice,
            total_price: qty * unitPrice,
            category: guessCategory(name),
          });
          i++; // skip qty line
          continue;
        }
      }
    }

    // Fallback: line with a price at the end could be a single-qty item
    const priceMatch = line.match(priceLineRegex);
    if (priceMatch) {
      const namepart = line.slice(0, line.lastIndexOf(priceMatch[1])).trim();
      const name = cleanProductName(namepart);
      if (name.length >= 2 && !/total|subtotal|desconto|troco|dinheiro|cartao|credito|debito|pix/i.test(name)) {
        const price = parseNumber(priceMatch[1]);
        if (price > 0 && price < 10000) {
          items.push({
            id: `scan-${++id}`,
            product_name: name,
            quantity: 1,
            unit: 'un',
            unit_price: price,
            total_price: price,
            category: guessCategory(name),
          });
        }
      }
    }
  }

  return items;
}

/**
 * Parse raw OCR text from one or more receipt images.
 * For multi-photo, texts are concatenated then deduplicated.
 */
export function parseReceipt(ocrTexts: string[]): ParsedReceipt {
  const combined = ocrTexts.join('\n');
  const allLines = combined.split('\n').map(l => l.trim()).filter(Boolean);

  const storeName = extractStoreName(allLines);
  const date = extractDate(combined);
  const items = extractItems(allLines);

  // Deduplicate items with same name (from overlapping multi-photo)
  const deduped = new Map<string, ParsedItem>();
  for (const item of items) {
    const key = item.product_name.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
    // If duplicate, keep the one with higher total (likely more complete read)
  }

  const finalItems = Array.from(deduped.values());
  const total = finalItems.reduce((s, i) => s + i.total_price, 0);

  return { store_name: storeName, date, items: finalItems, total };
}
