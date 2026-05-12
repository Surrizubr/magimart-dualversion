import { supabase } from "@/integrations/supabase/client";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

export async function testGeminiConnection(providedApiKey?: string) {
  try {
    const geminiApiKey = providedApiKey || localStorage.getItem('gemini-api-key') || process.env.GEMINI_API_KEY || '';
    if (!geminiApiKey) return false;
    
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: "ping" }] }
    });
    return !!response.text;
  } catch (error) {
    console.error("Gemini connection test failed:", error);
    return false;
  }
}

export async function analyzeWithGemini(images: string[], prompt: string, providedApiKey?: string) {
  try {
    const geminiApiKey = providedApiKey || localStorage.getItem('gemini-api-key') || process.env.GEMINI_API_KEY || '';
    if (!geminiApiKey) {
      throw new Error('Chave API não encontrada. Por favor, configure-a no Menu > Configurações.');
    }

    // For both receipts and product recognition, call Gemini directly from the client
    console.log("Using direct Gemini API for analysis...");
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    
    // Prepare image parts
    const imageParts = images.map(img => {
      const matches = img.match(/^data:(.+);base64,(.+)$/);
      return {
        inlineData: {
          mimeType: matches ? matches[1] : "image/jpeg",
          data: matches ? matches[2] : img,
        }
      };
    });

    const isProductPrompt = prompt === PRODUCT_PROMPT;
    const isReceiptPrompt = prompt === RECEIPT_PROMPT;
    
    const responseSchema = isReceiptPrompt ? {
      type: Type.OBJECT,
      properties: {
        store_name: { type: Type.STRING },
        store_address: { type: Type.STRING },
        establishment_type: { 
          type: Type.STRING, 
          enum: ["supermarket", "restaurant", "transport", "maintenance"] 
        },
        date: { type: Type.STRING },
        receipt_total: { type: Type.NUMBER },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              product_name: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              unit_price: { type: Type.NUMBER },
              total_price: { type: Type.NUMBER },
              discount_amount: { type: Type.NUMBER },
              discounted_price: { type: Type.NUMBER },
              category: { type: Type.STRING },
            },
            required: ["product_name", "quantity", "unit", "unit_price", "total_price", "category"]
          }
        }
      },
      required: ["store_name", "date", "receipt_total", "items", "establishment_type"]
    } : isProductPrompt ? {
      type: Type.OBJECT,
      properties: {
        product_name: { type: Type.STRING },
        category: { type: Type.STRING },
      },
      required: ["product_name", "category"]
    } : undefined;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: prompt }, ...imageParts] },
      config: {
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    const text = response.text;

    if (!text) {
      throw new Error("A IA não retornou uma resposta válida.");
    }

    return JSON.parse(text);
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
}

export const RECEIPT_PROMPT = `Você é um scanner de cupons fiscais brasileiros altamente preciso.
Analise a imagem e extraia os dados exatamente no seguinte formato JSON:

{
  "store_name": "Nome da Loja",
  "store_address": "Endereço (opcional)",
  "establishment_type": "supermarket | restaurant | transport | maintenance",
  "date": "YYYY-MM-DD",
  "receipt_total": 0.00,
  "items": [
    {
      "product_name": "Nome do Produto",
      "quantity": 1.0,
      "unit": "un",
      "unit_price": 0.00,
      "total_price": 0.00,
      "discount_amount": 0.00,
      "discounted_price": 0.00,
      "category": "Categoria"
    }
  ]
}

REGRAS:
1. "items" DEVE ser um array. Se não houver itens, retorne array vazio.
2. "receipt_total" DEVE ser o valor final pago no cupom.
3. Classifique o cupom em "establishment_type": 
   - "restaurant": para bares, restaurantes, lanchonetes, padaria (se for consumo local), etc.
   - "supermarket": para mercados, mercearias, hortifruti, etc.
   - "transport": para postos de combustível, apps de transporte, pedágios, etc.
   - "maintenance": para lojas de material de construção, ferragens, hidráulica, elétrica, itens de manutenção da casa, etc.
   - REGRAS DE FALLBACK: Se houver dúvida, analise os itens: itens de consumo imediato ou refeições indicam "restaurant"; combustível ou serviços de mobilidade indicam "transport"; parafusos, lâmpadas, torneiras ou ferramentas indicam "maintenance"; compras de mercearia variadas indicam "supermarket". Se ainda assim não for possível identificar, use "supermarket" como padrão.
4. Categorias de ITENS: Laticínios, Grãos, Bebidas, Temperos, Limpeza, Carnes, Frutas, Alimentos, Higiene, Hortifruti, Padaria, Restaurante, Manutenção, Transporte, Outros. 
   - Se establishment_type for "restaurant", a categoria de TODOS os itens deve ser obrigatoriamente "Restaurante".
   - Se establishment_type for "maintenance", a categoria de TODOS os itens deve ser obrigatoriamente "Manutenção".
   - Se establishment_type for "transport", a categoria de TODOS os itens deve ser obrigatoriamente "Transporte".
5. Identifique itens duplicados e remova-os.
6. Retorne APENAS o JSON válido, sem qualquer texto adicional antes ou depois.`;

export const PRODUCT_PROMPT = `Você é um assistente de compras. Analise a imagem e identifique o nome do produto e sua categoria (Frutas, Verduras, Carnes, Laticínios, Padaria, Bebidas, Limpeza, Higiene, Grãos, Temperos, Restaurante, Manutenção, Outros). Retorne apenas um JSON: { "product_name": "...", "category": "..." }`;
