import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { LogService, type LogEntry } from '@/services/LogService';
import { PageHeader } from '@/components/PageHeader';
import { Camera, Images, X, Loader2, Check, ArrowLeft, Package, MapPin, Trash2, AlertTriangle, Edit2, Plus, History, Eye, Settings, Info, Calendar, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { analyzeWithGemini, testGeminiConnection, RECEIPT_PROMPT } from '@/services/geminiService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { recalculateAllConsumptionRates } from '@/lib/consumptionCalculator';
import { getHistory, saveHistory, getStock, saveStock } from '@/data/mockData';
import { PurchaseHistory, StockItem } from '@/types';
import { getCategoryForProduct, saveProductMapping } from '@/lib/categoryMappings';
import { PermissionGate } from '@/components/PermissionGate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ScanMode = 'choose' | 'single' | 'multi' | 'history';
type ScanStep = 'capture' | 'processing' | 'results';

interface ReceiptItem {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  discount_amount: number;
  discounted_price: number;
  category: string;
}

interface AIReceiptResult {
  store_name: string;
  store_address?: string;
  establishment_type: 'supermarket' | 'restaurant' | 'transport' | 'maintenance';
  date: string;
  extracted_date?: string;
  items: ReceiptItem[];
  receipt_total: number;
  items_sum: number;
  discounted_sum: number;
  discount?: number;
  difference: number;
  notes?: string;
}

interface ScannerPageProps {
  onBack?: () => void;
  onNavigateToHistory?: (date: string, store: string) => void;
  onOpenMenu?: () => void;
  initialDate?: string;
  initialStore?: string;
}

export function ScannerPage({ onBack, onNavigateToHistory, onOpenMenu, initialDate, initialStore }: ScannerPageProps) {
  const { lang, currency, formatCurrency: fc, t } = useLanguage();
  const [mode, setMode] = useState<ScanMode>(() => (sessionStorage.getItem('scanner_mode') as ScanMode) || 'choose');
  const [step, setStep] = useState<ScanStep>(() => (sessionStorage.getItem('scanner_step') as ScanStep) || 'capture');

  useEffect(() => {
    try {
      sessionStorage.setItem('scanner_mode', mode);
      sessionStorage.setItem('scanner_step', step);
    } catch (e) {
      console.warn('[Scanner] Failed saved state to sessionStorage', e);
    }
  }, [mode, step]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode, step]);

  const [images, setImages] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const openLogs = () => {
    setLogs(LogService.getLogs());
    setShowLogs(true);
  };
  
  useEffect(() => {
    // We used to save to sessionStorage, but it causes crashes on mobile when images are large
    try {
      sessionStorage.removeItem('scanner_images');
    } catch {}
  }, []);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [trialCount, setTrialCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [result, setResult] = useState<AIReceiptResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [showLocationGate, setShowLocationGate] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalDiscounts, setOriginalDiscounts] = useState<Map<string, { discount_amount: number; discounted_price: number; discount: number }>>(new Map());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode('choose');
    setStep('capture');
    setImages([]);
    setProgressMsg('');
    setProgressPercent(0);
    setTrialCount(0);
    setIsRetrying(false);
    setResult(null);
    setSaved(false);
    setEditingItem(null);
    setError(null);
    sessionStorage.removeItem('scanner_mode');
    sessionStorage.removeItem('scanner_step');
    sessionStorage.removeItem('scanner_images');
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const compressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onerror = () => {
          console.error('[Scanner] Failed to load image for compression');
          resolve(dataUrl); 
        };
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Max size 1000px for better memory safety on mobile
            const max = 1000;
            if (width > height) {
              if (width > max) {
                height *= max / width;
                width = max;
              }
            } else {
              if (height > max) {
                width *= max / height;
                height = max;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, width, height);
            }
            // Compress with lower quality (0.5) to keep memory footprint small
            resolve(canvas.toDataURL('image/jpeg', 0.5));
          } catch (e) {
            console.error('[Scanner] Compression canvas error:', e);
            resolve(dataUrl);
          }
        };
        img.src = dataUrl;
      } catch (e) {
        console.error('[Scanner] Compression setup error:', e);
        resolve(dataUrl);
      }
    });
  };

  const isProcessingRef = useRef(false);

  const processImages = useCallback(async (imgs: string[]) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    setStep('processing');
    setError(null);
    setProgressPercent(0);

    const geminiApiKey = localStorage.getItem('gemini-api-key') || '';
    const activeKey = geminiApiKey || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
    
    if (!activeKey) {
      console.log('[Scanner] No API key found (local or env)');
      setStep('capture');
      setError('API_KEY_ERROR');
      return;
    }

    try {
      console.log('[Scanner] Starting analysis with images:', imgs.length);
      // Step 1: Checando comunicação com servidor
      setProgressMsg(t('aiStep1'));
      setProgressPercent(5);
      await new Promise(r => setTimeout(r, 600));

      // Step 2: Validando chave API
      setProgressMsg(t('aiStep2'));
      setProgressPercent(15);
      await new Promise(r => setTimeout(r, 600));

      // Step 3: Comprimindo e enviando foto
      setProgressMsg(t('aiStep3'));
      setProgressPercent(25);
      const compressedImgs = await Promise.all(imgs.map(img => compressImage(img)));
      console.log('[Scanner] Compression complete');
      setProgressPercent(35);

      let resultData: any = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 3; 
      let lastError: any = null;

      while (attempts < MAX_ATTEMPTS) {
        let interval: any = null;
        try {
          console.log(`[Scanner] AI Analysis Attempt ${attempts + 1}...`);
          if (attempts > 0 || isRetrying) {
            setIsRetrying(true);
            setProgressMsg(t('analyzingWait'));
            await new Promise(r => setTimeout(r, 1000));
          }

          // Start AI Analysis
          const aiPromise = analyzeWithGemini(compressedImgs, RECEIPT_PROMPT, activeKey);
          
          const aiStartTime = Date.now();
          interval = setInterval(() => {
            const elapsed = Date.now() - aiStartTime;
            if (elapsed < 3000) {
              setProgressMsg((attempts > 0 || isRetrying) ? t('analyzingWait') : t('aiStep4'));
              setProgressPercent(Math.round(Math.min(45, 35 + (elapsed / 300))));
            } else if (elapsed < 7000) {
              setProgressMsg((attempts > 0 || isRetrying) ? t('analyzingWait') : t('aiStep5'));
              setProgressPercent(Math.round(Math.min(65, 45 + (elapsed - 3000) / 200)));
            } else {
              setProgressMsg((attempts > 0 || isRetrying) ? t('analyzingWait') : t('aiStep6'));
              setProgressPercent(Math.round(Math.min(85, 65 + (elapsed - 7000) / 400)));
            }
          }, 500);

          resultData = await aiPromise;
          break; // Success!
        } catch (err: any) {
          lastError = err;
          attempts++;
          console.warn(`Analysis attempt ${attempts} failed:`, err);
        } finally {
          if (interval) clearInterval(interval);
        }
      }

      if (!resultData) {
        throw lastError;
      }

      // ... existing value consolidation code ...
      // Step 7: Consolidando valores
      setProgressMsg(t('aiStep7'));
      setProgressPercent(95);
      await new Promise(r => setTimeout(r, 800));

      const items: ReceiptItem[] = await Promise.all((resultData.items || []).map(async (item: any, i: number) => {
        const product_name = item.product_name || item.name || t('unnamedProduct');
        const quantity = Number(item.quantity) || 1;
        const unit_price = Number(item.unit_price || item.price || 0);
        const total_price = Number(item.total_price || (quantity * unit_price) || 0);
        
        // Try to get category from learned mappings
        const learnedCategory = await getCategoryForProduct(product_name);
        
        return {
          ...item,
          id: `ai-${i + 1}`,
          product_name,
          quantity,
          unit: item.unit || 'un',
          unit_price,
          total_price,
          discount_amount: Number(item.discount_amount || 0),
          discounted_price: Number(item.discounted_price ?? total_price),
          category: learnedCategory || item.category || 'Outros',
        };
      }));

      const itemsSum = items.reduce((s: number, i: ReceiptItem) => s + i.total_price, 0);
      const discountedSum = items.reduce((s: number, i: ReceiptItem) => s + i.discounted_price, 0);

      // Store original discounts for toggle
      const discountMap = new Map<string, { discount_amount: number; discounted_price: number; discount: number }>();
      items.forEach(item => {
        if (item.discount_amount > 0) {
          discountMap.set(item.id, { 
            discount_amount: item.discount_amount, 
            discounted_price: item.discounted_price, 
            discount: resultData.discount || 0 
          });
        }
      });
      setOriginalDiscounts(discountMap);

      setProgressPercent(100);
      setProgressMsg(t('completingAnalysis'));

      const finalResult: AIReceiptResult = {
        store_name: resultData.store_name || initialStore || t('unknownMarket'),
        store_address: resultData.store_address,
        establishment_type: resultData.establishment_type || 'supermarket',
        date: resultData.date || initialDate || new Date().toISOString().slice(0, 10),
        extracted_date: resultData.date,
        items,
        receipt_total: resultData.receipt_total || 0,
        items_sum: itemsSum,
        discounted_sum: discountedSum,
        discount: resultData.discount,
        difference: Math.abs((resultData.receipt_total || 0) - discountedSum),
        notes: resultData.notes
      };

      setTrialCount(0);
      setIsRetrying(false);
      setResult(finalResult);
      setStep('results');
      isProcessingRef.current = false;
      
      // Memory Optimization: Clear raw images after processing if we have a result
      // This reduces memory footprint on mobile devices significantly
      setImages([]);
    } catch (err: any) {
      console.error('AI analysis error:', err);
      setIsRetrying(false);
      isProcessingRef.current = false;
      
      if (trialCount === 0) {
        // First overall failure for this image set
        setTrialCount(1);
        setError('RETRY_WITHOUT_PHOTO');
        setStep('capture');
      } else if (trialCount === 1) {
        // Failed even after "Retry Analysis" button
        setTrialCount(2);
        setError('REQUIRED_NEW_PHOTO');
        setStep('capture');
      } else {
        // Failed after taking a new photo
        setTrialCount(3);
        setError('API_LIMIT_REACHED');
        setStep('capture');
      }
    }
  }, [t, isRetrying, trialCount, initialDate, initialStore]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      // Use ObjectURL instead of FileReader for better memory management
      const objectUrl = URL.createObjectURL(file as Blob);
      const img = new Image();
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const max = 1000;
          if (width > height) {
            if (width > max) {
              height *= max / width;
              width = max;
            }
          } else {
            if (height > max) {
              width *= max / height;
              height = max;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, width, height);
          
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
          
          // Cleanup
          URL.revokeObjectURL(objectUrl);
          
          setImages(prev => {
            const next = [...prev, compressedDataUrl];
            return next;
          });
          
          if (mode === 'single') {
            processImages([compressedDataUrl]);
          }
        } catch (err) {
          console.error('[Scanner] Image loading/compression error:', err);
          URL.revokeObjectURL(objectUrl);
        }
      };
      
      img.onerror = () => {
        console.error('[Scanner] Failed to load image from file');
        URL.revokeObjectURL(objectUrl);
      };
      
      img.src = objectUrl;
    });
    
    e.target.value = '';
  }, [mode, processImages]);

  const handleSave = () => {
    if (!result) return;
    
    // Validate date
    if (!result.date || result.date.trim() === '' || isNaN(new Date(result.date + 'T12:00:00').getTime())) {
      const today = new Date().toISOString().slice(0, 10);
      setResult(prev => prev ? { ...prev, date: today } : null);
    }
    
    setShowDateConfirm(true);
  };

  const performSave = async () => {
    if (!result) return;
    
    console.log('[Scanner] Starting performSave...');
    try {
      // Final date validation
      if (!result.date || result.date.trim() === '' || isNaN(new Date(result.date + 'T12:00:00').getTime())) {
        setDateError(true);
        toast.error(t('fillDateWarning'));
        return;
      }
      setDateError(false);
      setShowDateConfirm(false);

      const receiptId = `receipt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      console.log('[Scanner] Generated Receipt ID:', receiptId);
      
      // Save to purchase_history
      let history = getHistory();
      if (!Array.isArray(history)) history = [];
      
      // If we are updating an existing purchase from history page
      if (initialDate && initialStore) {
        console.log('[Scanner] Updating existing purchase:', { initialDate, initialStore });
        const oldItems = history.filter(h => h.purchase_date === initialDate && h.store_name === initialStore);
        
        // "Undo" the previous stock additions
        const stock = getStock();
        if (Array.isArray(stock)) {
          oldItems.forEach(oldItem => {
            const stockItem = stock.find(s => s.product_name.toLowerCase() === oldItem.product_name.toLowerCase());
            if (stockItem) {
              stockItem.quantity = Math.max(0, stockItem.quantity - oldItem.quantity);
            }
          });
          await saveStock(stock);
        }

        history = history.filter(h => !(h.purchase_date === initialDate && h.store_name === initialStore));
      }

      console.log('[Scanner] Adding items to history. Count:', result.items.length);
      await Promise.all(result.items.map(async (item) => {
        // Learn the categorization for future use
        try {
          await saveProductMapping(item.product_name, item.category);
        } catch (e) {
          console.warn('[Scanner] Mapping save failed:', e);
        }
        
        history.push({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          product_name: item.product_name,
          category: item.category,
          quantity: item.quantity,
          price: item.discount_amount > 0 ? item.discounted_price / item.quantity : item.unit_price,
          total_price: item.discount_amount > 0 ? item.discounted_price : item.total_price,
          store_name: result.store_name,
          purchase_date: result.date,
          scanned: true,
          receipt_id: receiptId,
        });
      }));
      
      console.log('[Scanner] Calling saveHistory...');
      await saveHistory(history);

      // Save to stock_items
      const existingStock = getStock();
      let newStock = Array.isArray(existingStock) ? [...existingStock] : [];
      
      console.log('[Scanner] Updating stock items...');
      result.items.forEach(item => {
        const sameNameItems = newStock.filter((s: any) => s.product_name.toLowerCase() === item.product_name.toLowerCase());
        const activeItem = sameNameItems.find((s: any) => s.quantity > 0) || sameNameItems[0];

        if (activeItem) {
          const idx = newStock.findIndex((s: any) => s.id === activeItem.id);
          newStock[idx] = {
            ...newStock[idx],
            quantity: (newStock[idx].quantity || 0) + item.quantity,
            last_price: item.discount_amount > 0 ? item.discounted_price / item.quantity : item.unit_price,
            last_purchase_date: result.date,
            status: 'ok',
            receipt_id: receiptId // Update last receipt ID
          };
          
          // Prune zero-stock duplicates
          const entriesToRemove = sameNameItems.filter((e: any) => e.id !== activeItem.id && e.quantity === 0).map((e: any) => e.id);
          if (entriesToRemove.length > 0) {
            newStock = newStock.filter((s: any) => !entriesToRemove.includes(s.id));
          }
        } else {
          newStock.push({
            id: `stock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            product_name: item.product_name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            min_quantity: 1,
            daily_consumption_rate: 0.1,
            status: 'ok',
            last_price: item.discount_amount > 0 ? item.discounted_price / item.quantity : item.unit_price,
            last_purchase_date: result.date,
            receipt_id: receiptId,
          });
        }
      });
      
      console.log('[Scanner] Calling saveStock...');
      await saveStock(newStock);

      // Recalculate consumption rates based on purchase history
      try {
        console.log('[Scanner] Recalculating consumption rates...');
        const updatedStock = recalculateAllConsumptionRates();
        if (updatedStock) {
          await saveStock(updatedStock);
        }
      } catch (e) {
        console.error('[Scanner] Consumption recalc failed:', e);
      }

      console.log('[Scanner] performSave complete');
      setSaved(true);
      toast.success(t('saveSuccessful'));
    } catch (err: any) {
      console.error('[Scanner] CRITICAL SAVE ERROR:', err);
      toast.error(t('receiptSaveError'));
      // Log error for debug
      LogService.error('Receipt Save Error', err.message || JSON.stringify(err));
    }
  };

  const deleteReceipt = (receiptId: string) => {
    // Remove from purchase_history
    const history = getHistory();
    const filteredHistory = history.filter((h: any) => h.receipt_id !== receiptId);
    saveHistory(filteredHistory);

    // Remove from stock_items (only items that have this receipt_id)
    const stock = getStock();
    const filteredStock = stock.filter((s: any) => s.receipt_id !== receiptId);
    saveStock(filteredStock);
  };

  // Get grouped receipts for history view with monthly separation
  const scannedReceiptsGrouped = useMemo(() => {
    const history = getHistory();
    const scanned = history.filter((h: any) => h.scanned && h.receipt_id);
    const grouped: Record<string, { receipt_id: string; store_name: string; date: string; items: any[]; total: number }> = {};
    
    scanned.forEach((item: any) => {
      if (!grouped[item.receipt_id]) {
        grouped[item.receipt_id] = {
          receipt_id: item.receipt_id,
          store_name: item.store_name,
          date: item.purchase_date,
          items: [],
          total: 0,
        };
      }
      grouped[item.receipt_id].items.push(item);
      grouped[item.receipt_id].total += item.total_price;
    });

    const sortedArray = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
    
    // Group by month
    const monthlyGroups: { monthKey: string; monthLabel: string; receipts: any[]; total: number }[] = [];
    
    sortedArray.forEach(receipt => {
      const date = new Date(receipt.date + 'T12:00:00');
      const monthKey = receipt.date.slice(0, 7); // YYYY-MM
      const monthLabel = date.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { month: 'long', year: 'numeric' });
      
      let group = monthlyGroups.find(g => g.monthKey === monthKey);
      if (!group) {
        group = { monthKey, monthLabel, receipts: [], total: 0 };
        monthlyGroups.push(group);
      }
      group.receipts.push(receipt);
      group.total += receipt.total;
    });
    
    return monthlyGroups;
  }, [mode, lang]);


  const handleGeoLocation = () => {
    setShowLocationGate(true);
  };

  const executeGeoLocation = () => {
    setShowLocationGate(false);
    if (!result) return;
    
    setGeoLoading(true);
    console.log("Starting geolocation in ScannerPage...");
    
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(t('locationError'));
      setGeoLoading(false);
      return;
    }

    const loadingToast = toast.info(t('gettingLocation'), { duration: 10000 });

    const options = {
      timeout: 15000,
      enableHighAccuracy: false,
      maximumAge: 60000
    };

    const successCallback = async (pos: GeolocationPosition) => {
      try {
        console.log("Geolocation successful in ScannerPage:", pos.coords.latitude, pos.coords.longitude);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
          { 
            headers: { 
              'Accept-Language': lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-US',
              'User-Agent': 'MagicmartAI/1.0'
            } 
          }
        );
        if (!res.ok) throw new Error("OSM API error");
        
        const data = await res.json();
        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.street || '';
        const number = addr.house_number || '';
        const shop = addr.shop || addr.supermarket || addr.building || addr.commercial || addr.mall || addr.marketplace || '';
        const city = addr.city || addr.town || addr.village || addr.suburb || '';
        
        let name = '';
        if (shop) name = shop;
        if (road) name += (name ? ' - ' : '') + road;
        if (number) name += ', ' + number;
        if (!name.trim() && city) name = city;
        
        if (!name.trim()) name = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        
        setResult({ ...result, store_name: name.trim() });
        toast.dismiss(loadingToast);
        toast.success(t('locationObtained'));
      } catch (err) {
        console.error("Geocoding Error in ScannerPage:", err);
        setResult({ ...result, store_name: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
        toast.dismiss(loadingToast);
        toast.info(t('coordsSaved'));
      }
      setGeoLoading(false);
    };

    const errorCallback = (err: GeolocationPositionError) => {
      console.error("Geolocation error callback in ScannerPage:", err);
      setGeoLoading(false);
      toast.dismiss(loadingToast);
      
      const messages: Record<number, string> = {
        1: t('permissionDenied') || "Permissão de localização negada.",
        2: t('locationError') || "Localização indisponível.",
        3: t('locationError') || "Tempo de busca excedido."
      };
      toast.error(messages[err.code] || t('locationError'));
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  };

  const updateItem = async (id: string, field: keyof ReceiptItem, value: string | number) => {
    if (!result) return;
    const newItems = await Promise.all(result.items.map(async (item) => {
      if (item.id !== id) return item;
      
      if (field === 'category') {
        await saveProductMapping(item.product_name, value as string);
      }
      
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.total_price = Number(updated.quantity) * Number(updated.unit_price);
        updated.discounted_price = updated.total_price - updated.discount_amount;
      }
      if (field === 'discount_amount') {
        updated.discounted_price = updated.total_price - Number(value);
      }
      return updated;
    }));
    const newSum = newItems.reduce((s, i) => s + i.total_price, 0);
    const newDiscountedSum = newItems.reduce((s, i) => s + i.discounted_price, 0);
    setResult({
      ...result,
      items: newItems,
      items_sum: newSum,
      discounted_sum: newDiscountedSum,
      difference: Math.abs(result.receipt_total - newDiscountedSum),
    });
  };

  const removeItem = (id: string) => {
    if (!result) return;
    const newItems = result.items.filter(i => i.id !== id);
    const newSum = newItems.reduce((s, i) => s + i.total_price, 0);
    const newDiscountedSum = newItems.reduce((s, i) => s + i.discounted_price, 0);
    setResult({
      ...result,
      items: newItems,
      items_sum: newSum,
      discounted_sum: newDiscountedSum,
      difference: Math.abs(result.receipt_total - newDiscountedSum),
    });
  };

  const addItem = () => {
    if (!result) return;
    const newId = `ai-new-${Date.now()}`;
    const newItem: ReceiptItem = {
      id: newId,
      product_name: t('newProduct'),
      quantity: 1,
      unit: 'un',
      unit_price: 0,
      total_price: 0,
      discount_amount: 0,
      discounted_price: 0,
      category: result.establishment_type === 'restaurant' ? 'Restaurante' : (result.establishment_type === 'maintenance' ? 'Manutenção' : (result.establishment_type === 'transport' ? 'Transporte' : 'Outros')),
    };
    const newItems = [...result.items, newItem];
    const newSum = newItems.reduce((s, i) => s + i.total_price, 0);
    const newDiscountedSum = newItems.reduce((s, i) => s + i.discounted_price, 0);
    setResult({
      ...result,
      items: newItems,
      items_sum: newSum,
      discounted_sum: newDiscountedSum,
      difference: Math.abs(result.receipt_total - newDiscountedSum),
    });
    setEditingItem(newId);
  };

  // Mode selection screen
  if (mode === 'choose') {
    return (
      <div className="pb-20">
        <PermissionGate 
          isOpen={showLocationGate} 
          type="location" 
          onAllow={executeGeoLocation} 
          onCancel={() => setShowLocationGate(false)} 
        />
        <PageHeader title={t('scan')} subtitle={t('digitalizeReceipts')} onBack={onBack} />
        <div className="p-4 space-y-4">

          {(() => {
            const hasLocalKey = !!localStorage.getItem('gemini-api-key');
            const hasSystemKey = !!(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
            const hasKey = hasLocalKey || hasSystemKey;
            
            return (
              <div className={`rounded-lg p-3 flex items-start gap-3 ${hasKey ? 'bg-primary/10' : 'bg-accent/50'}`}>
                {hasKey ? <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" /> : <Settings className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-sm text-foreground font-medium">
                    {hasKey ? (hasLocalKey ? t('scannerApiKeyConfigured') : 'Usando chave do sistema (Magicmart AI)') : t('scannerApiKeyInfo')}
                  </p>
                  <button
                    onClick={() => onOpenMenu?.()} 
                    className="text-sm text-primary font-semibold mt-1 underline underline-offset-2 hover:opacity-80 transition-opacity"
                  >
                    {hasLocalKey ? t('scannerGoToSettings') : 'Configurar chave própria (opcional)'}
                  </button>
                </div>
              </div>
            );
          })()}

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => {
              const hasLocalKey = !!localStorage.getItem('gemini-api-key');
              const hasSystemKey = !!(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
              if (!hasLocalKey && !hasSystemKey) {
                toast.error(t('scannerApiKeyInfo'));
                return;
              }
              setMode('single');
            }}
            className="w-full bg-card rounded-lg shadow-card p-5 flex items-center gap-4 text-left hover:shadow-elevated transition-shadow"
          >
            <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">{t('singlePhoto')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('singlePhotoDesc')}
              </p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => {
              const hasLocalKey = !!localStorage.getItem('gemini-api-key');
              const hasSystemKey = !!(typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
              if (!hasLocalKey && !hasSystemKey) {
                toast.error(t('scannerApiKeyInfo'));
                return;
              }
              setMode('multi');
            }}
            className="w-full bg-card rounded-lg shadow-card p-5 flex items-center gap-4 text-left hover:shadow-elevated transition-shadow"
          >
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shrink-0">
              <Images className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">{t('multiPhoto')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('multiPhotoDesc')}
              </p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => setMode('history')}
            className="w-full bg-card rounded-lg shadow-card p-5 flex items-center gap-4 text-left hover:shadow-elevated transition-shadow"
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <History className="w-6 h-6 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">{t('scannerHistory')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('scannerHistoryDesc')}
              </p>
            </div>
          </motion.button>

          {/* AI Scanner Info Banner */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-accent/30 rounded-lg p-4 space-y-2"
          >
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">AI</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {t('aiScannerTitle')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('aiScannerDesc')}
                </p>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 mt-2">
              <p className="text-xs font-semibold text-foreground mb-2">
                {t('getApiKeyHowTo')}
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 pl-4 list-decimal">
                <li>Acesse <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-mono text-primary underline">aistudio.google.com/apikey</a></li>
                <li>{t('loginToGoogle')}</li>
                <li>{t('clickCreateKey')}</li>
                <li>{t('copyKey')}</li>
                <li>
                  {t('pasteInSettings')}{' '}
                  <button
                    onClick={() => onOpenMenu?.()}
                    className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity inline"
                  >
                    {t('menu')} → {t('geminiApiKey')}
                  </button>
                </li>
              </ol>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Receipt history screen
  if (mode === 'history') {
    return (
      <div className="pb-20">
        <PageHeader
          title={t('scannerHistory')}
          subtitle={t('digitalizeReceipts')}
          onBack={reset}
        />
        <div className="p-4 space-y-6">
          {scannedReceiptsGrouped.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <History className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('noReceiptsScanned')}</p>
            </div>
          ) : (
            scannedReceiptsGrouped.map((group) => (
              <div key={group.monthKey} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <h3 className="text-sm font-bold text-foreground capitalize">{group.monthLabel}</h3>
                  <span className="text-xs font-bold text-primary">{fc(group.total)}</span>
                </div>
                <div className="space-y-3">
                  {group.receipts.map((receipt) => (
                    <motion.div
                      key={receipt.receipt_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card rounded-lg shadow-card p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-card-foreground truncate">{receipt.store_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(receipt.date + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {receipt.items.length} {receipt.items.length === 1 ? t('historyItemCount') : t('historyItemsCount')} — {fc(receipt.total)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => onNavigateToHistory?.(receipt.date, receipt.store_name)}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t('seeItems')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(receipt.receipt_id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('delete')}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Confirmation dialog */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setConfirmDeleteId(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-card rounded-xl shadow-elevated p-6 w-full max-w-sm space-y-4"
              >
                <p className="text-sm font-semibold text-card-foreground">{t('deleteReceiptConfirm')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('deleteReceiptDesc')}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    {t('no')}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      deleteReceipt(confirmDeleteId);
                      setConfirmDeleteId(null);
                      setMode('choose');
                      setTimeout(() => setMode('history'), 0);
                    }}
                  >
                    {t('yesDelete')}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Processing screen
  if (step === 'processing') {
    return (
      <div className="pb-20">
        <PageHeader title={t('scan')} subtitle={t('analyzingWithAI')} />
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] space-y-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="w-12 h-12 text-primary" />
          </motion.div>
          <div className="w-full max-w-xs space-y-3">
            <div className="relative">
              <Progress value={progressPercent} className="h-3" />
              {isRetrying && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-6 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow-sm">
                  !
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-foreground text-center">{progressMsg}</p>
            <p className="text-xs text-muted-foreground text-center">
              {progressPercent}% {t('completedPercent')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Results screen
  if (step === 'results' && result) {
    const hasDifference = result.difference > 0.01;

    return (
      <div className="pb-20">
        <PermissionGate 
          isOpen={showLocationGate} 
          type="location" 
          onAllow={executeGeoLocation} 
          onCancel={() => setShowLocationGate(false)} 
        />
        <PageHeader
          title={t('results')}
          subtitle={`${result.items.length} ${t('foundItemsSubtitle')}`}
          onBack={reset}
        />
        <div className="p-4 space-y-4">
          {/* Store & date info */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-lg shadow-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <input
                value={result.store_name}
                onChange={e => setResult({ ...result, store_name: e.target.value })}
                className="text-sm font-semibold text-card-foreground bg-transparent outline-none flex-1 border-b border-transparent focus:border-primary/30"
              />
              <button
                onClick={handleGeoLocation}
                disabled={geoLoading}
                className="p-2 rounded-lg bg-accent text-primary hover:bg-accent/80 transition-colors disabled:opacity-50"
                title={t('useLocation')}
              >
                {geoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
              </button>
            </div>

            {result.store_address && (
              <p className="text-xs text-muted-foreground pl-6">{result.store_address}</p>
            )}

            {/* General Classification */}
            <div className="space-y-2 pt-1 border-t border-border/50">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('generalClassification')}</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'supermarket', label: t('supermarket'), icon: '🛒' },
                  { id: 'restaurant', label: t('restaurant'), icon: '🍽️' },
                  { id: 'transport', label: t('transport'), icon: '🚗' },
                  { id: 'maintenance', label: t('maintenance'), icon: '🛠️' },
                ].map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      const newItems = result.items.map(item => {
                        let newCategory = item.category;
                        if (cls.id === 'restaurant') newCategory = 'Restaurante';
                        else if (cls.id === 'maintenance') newCategory = 'Manutenção';
                        else if (cls.id === 'transport') newCategory = 'Transporte';
                        
                        return {
                          ...item,
                          category: newCategory
                        };
                      });
                      setResult({ ...result, establishment_type: cls.id as any, items: newItems });
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                      result.establishment_type === cls.id 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <span className="text-lg mb-1">{cls.icon}</span>
                    <span className="text-[10px] font-semibold text-center leading-tight">{cls.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{t('purchaseDateLabel')}</span>
                  {result.date === new Date().toISOString().slice(0, 10) ? (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                      {t('dateNotFound')}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                      {t('extractedFromReceipt')}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-primary">
                  {new Date(result.date + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {result.extracted_date && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setResult({ ...result, date: result.extracted_date! })}
                    className={`h-6 px-2 text-[10px] font-bold transition-colors ${result.date === result.extracted_date ? 'text-green-600 bg-green-50' : 'text-primary hover:bg-primary/10'}`}
                  >
                    <History className="w-3 h-3 mr-1" />
                    {t('receiptDate')}
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setResult({ ...result, date: new Date().toISOString().slice(0, 10) })}
                  className={`h-6 px-2 text-[10px] font-bold transition-colors ${result.date === new Date().toISOString().slice(0, 10) ? 'text-green-600 bg-green-50' : 'text-primary hover:bg-primary/10'}`}
                >
                  <Calendar className="w-3 h-3 mr-1" />
                  {t('today')}
                </Button>
              </div>
              <input
                type="date"
                value={result.date}
                onChange={e => { setResult({ ...result, date: e.target.value }); setDateError(false); }}
                className={`w-full p-2 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 ring-primary/30 ${dateError ? 'border-destructive' : 'border-border'}`}
              />
              {dateError && (
                <p className="text-xs text-destructive font-medium">⚠️ {t('fillDateWarning')}</p>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('sumOriginal')}:</span>
                <span className="text-sm font-semibold text-foreground">{fc(result.items_sum)}</span>
              </div>
              {result.discount != null && result.discount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t('discountApplied')}:</span>
                  <span className="text-sm font-semibold text-green-600">- {fc(result.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('sumWithDiscount')}:</span>
                <span className="text-sm font-bold text-primary">{fc(result.discounted_sum)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="text-xs font-medium text-foreground">{t('receiptTotalKey')}:</span>
                <span className="text-sm font-bold text-primary">{fc(result.receipt_total)}</span>
              </div>
              {hasDifference && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 mt-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    {t('differenceWarningPrefix')} {fc(result.difference)} {t('differenceWarningSuffix')}
                  </span>
                </div>
              )}
            </div>

            {result.notes && (
              <p className="text-xs text-muted-foreground italic bg-secondary/30 rounded p-2">
                📝 {result.notes}
              </p>
            )}
          </motion.div>

          {/* Top action buttons */}
          {!saved && result.items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('itemsCount')}</span>
                <span className="text-sm font-bold text-foreground">{result.items.length}</span>
              </div>
              <Button
                onClick={handleSave}
                className="w-full gradient-primary text-primary-foreground border-0 h-11"
              >
                <Package className="w-4 h-4 mr-2" />
                {result.establishment_type === 'supermarket' ? t('saveToStock') : t('saveToHistoryOnly')}
              </Button>
              {/* Discount toggle buttons */}
              {originalDiscounts.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant={result.items.some(i => i.discount_amount > 0) ? "default" : "outline"}
                    onClick={() => {
                      const newItems = result.items.map(item => {
                        const orig = originalDiscounts.get(item.id);
                        if (orig) {
                          return { ...item, discount_amount: orig.discount_amount, discounted_price: orig.discounted_price };
                        }
                        return item;
                      });
                      const firstDiscountObj = Array.from(originalDiscounts.values())[0] as { discount: number } | undefined;
                      const origDiscount = firstDiscountObj?.discount || 0;
                      const newDiscountedSum = newItems.reduce((s, i) => s + i.discounted_price, 0);
                      setResult({
                        ...result,
                        items: newItems,
                        discount: origDiscount,
                        discounted_sum: newDiscountedSum,
                        difference: Math.abs(result.receipt_total - newDiscountedSum),
                      });
                    }}
                    className="flex-1 h-9 text-xs"
                    disabled={result.items.some(i => i.discount_amount > 0)}
                  >
                    ✅ {t('applyDiscounts')}
                  </Button>
                  <Button
                    variant={result.items.every(i => i.discount_amount === 0) ? "default" : "outline"}
                    onClick={() => {
                      const newItems = result.items.map(item => ({
                        ...item,
                        discount_amount: 0,
                        discounted_price: item.total_price,
                      }));
                      const newDiscountedSum = newItems.reduce((s, i) => s + i.discounted_price, 0);
                      setResult({
                        ...result,
                        items: newItems,
                        discount: 0,
                        discounted_sum: newDiscountedSum,
                        difference: Math.abs(result.receipt_total - newDiscountedSum),
                      });
                    }}
                    className="flex-1 h-9 text-xs"
                    disabled={result.items.every(i => i.discount_amount === 0)}
                  >
                    ❌ {t('withoutDiscounts')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Items */}
          <div className="space-y-2">
            {result.items.map((item, i) => {
              const isEditing = editingItem === item.id;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="bg-card rounded-lg shadow-card p-3"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={item.product_name}
                        onChange={e => updateItem(item.id, 'product_name', e.target.value)}
                        className="text-sm font-medium text-card-foreground bg-background border border-border rounded px-2 py-1.5 w-full outline-none focus:ring-2 ring-primary/30"
                        placeholder={t('productNamePlaceholder')}
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">{t('qtyLabel')}</label>
                          <input
                            type="number"
                            step="0.001"
                            value={item.quantity}
                            onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="text-xs bg-background border border-border rounded px-2 py-1.5 w-full outline-none focus:ring-2 ring-primary/30"
                          />
                        </div>
                        <div className="w-16">
                          <label className="text-[10px] text-muted-foreground">{t('unitLabel')}</label>
                          <select
                            value={item.unit}
                            onChange={e => updateItem(item.id, 'unit', e.target.value)}
                            className="text-xs bg-background border border-border rounded px-2 py-1.5 w-full outline-none"
                          >
                            {['un', 'kg', 'lt', 'l', 'ml', 'g', 'pc', 'pct', 'cx', 'dz'].map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">{t('unitPriceLabel')}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="text-xs bg-background border border-border rounded px-2 py-1.5 w-full outline-none focus:ring-2 ring-primary/30"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">{t('discountLabel')}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.discount_amount}
                            onChange={e => updateItem(item.id, 'discount_amount', parseFloat(e.target.value) || 0)}
                            className="text-xs bg-background border border-border rounded px-2 py-1.5 w-full outline-none focus:ring-2 ring-primary/30"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="space-y-0.5">
                          <span className="text-xs text-muted-foreground">
                            {t('originalLabel')}: {fc(item.total_price)}
                          </span>
                          {item.discount_amount > 0 && (
                            <span className="text-xs text-green-600 block">
                              {t('withDiscountLabel')}: {fc(item.discounted_price)}
                            </span>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)} className="h-7 text-xs">
                          <Check className="w-3 h-3 mr-1" /> {t('editItemBtn')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-card-foreground">{item.product_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px] font-medium">{t(item.category)}</span>
                          <span>{item.quantity} {item.unit}</span>
                          <span>× {fc(item.unit_price)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-right">
                          {item.discount_amount > 0 ? (
                            <>
                              <span className="text-xs text-muted-foreground line-through block">{fc(item.total_price)}</span>
                              <span className="text-sm font-bold text-green-600">{fc(item.discounted_price)}</span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-foreground">{fc(item.total_price)}</span>
                          )}
                        </div>
                        <button onClick={() => setEditingItem(item.id)} className="text-muted-foreground hover:text-primary p-0.5">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Add item button */}
          {!saved && (
            <Button variant="outline" onClick={addItem} className="w-full h-10">
              <Plus className="w-4 h-4 mr-2" />
              {t('addItemBtn')}
            </Button>
          )}

          {result.items.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t('noneFoundMsg')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('lightingTip')}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            {!saved && result.items.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('itemsCount')}</span>
                <span className="text-sm font-bold text-foreground">{result.items.length}</span>
              </div>
            )}
            {!saved ? (
              <Button
                onClick={handleSave}
                className="w-full gradient-primary text-primary-foreground border-0 h-11"
                disabled={result.items.length === 0}
              >
                <Package className="w-4 h-4 mr-2" />
                {result.establishment_type === 'supermarket' ? t('saveToStock') : t('saveToHistoryOnly')}
              </Button>
            ) : (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-primary/10 rounded-lg p-4 text-center"
              >
                <Check className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold text-primary">{t('saveSuccessful')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.items.length} {result.establishment_type === 'supermarket' ? t('itemsAddedMsg') : t('itemsAddedHistoryOnlyMsg')}
                </p>
              </motion.div>
            )}
            <Button variant="outline" onClick={reset} className="w-full">
              {t('scanAnotherBtn')}
            </Button>
          </div>
        </div>

        {/* Date confirmation dialog */}
        <AnimatePresence>
          {showDateConfirm && result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              onClick={() => setShowDateConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-card rounded-xl shadow-elevated p-6 w-full max-w-sm space-y-4"
              >
                <div className="flex items-center gap-2 text-primary">
                  <Calendar className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-foreground">{t('confirmDateTitle')}</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('confirmDateDesc')}
                </p>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('purchaseDateLabel')}</label>
                  <input
                    type="date"
                    value={result.date}
                    onChange={e => setResult({ ...result, date: e.target.value })}
                    className="w-full p-3 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDateConfirm(false)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    className="flex-1 gradient-primary text-primary-foreground border-0"
                    onClick={performSave}
                  >
                    {t('confirm')}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    );
  }

  // Capture screen
  return (
    <div className="pb-20">
      <PermissionGate 
        isOpen={showLocationGate} 
        type="location" 
        onAllow={executeGeoLocation} 
        onCancel={() => setShowLocationGate(false)} 
      />
      <PageHeader
        title={mode === 'single' ? t('singlePhoto') : t('multiPhoto')}
        subtitle={mode === 'single' ? t('takePhotoSub') : `${images.length} ${t('photosAddedSub')}`}
        onBack={reset}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={mode === 'multi'}
        onChange={handleFileSelect}
        className="hidden"
      />

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple={mode === 'multi'}
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="p-4 space-y-4">
        {error === 'API_KEY_ERROR' ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 font-semibold">{t('scannerApiKeyWarning')}</p>
              <button
                onClick={() => onOpenMenu?.()} 
                className="text-xs text-amber-900 font-bold mt-1 underline underline-offset-2 hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                {t('scannerGoToSettings')}
              </button>
            </div>
            <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-600">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ) : error === 'API_LIMIT_REACHED' ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive font-semibold">{t('aiLimitReached')}</p>
              <button
                onClick={() => onOpenMenu?.()} 
                className="text-xs text-destructive/80 font-bold mt-1 underline underline-offset-2 hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                {t('scannerGoToSettings')}
              </button>
            </div>
            <button onClick={() => setError(null)} className="text-destructive/40 hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ) : error === 'RETRY_WITHOUT_PHOTO' ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-amber-800 font-semibold">{t('analysisError')}</p>
                <p className="text-xs text-amber-700 mt-1">Houve um problema temporário. Gostaria de tentar a análise novamente com as mesmas fotos?</p>
              </div>
              <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Button 
              className="w-full bg-amber-600 hover:bg-amber-700 text-white border-0" 
              onClick={() => processImages(images)}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('retryAnalysis')}
            </Button>
          </motion.div>
        ) : error === 'REQUIRED_NEW_PHOTO' ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive font-semibold">{t('errorNewPhoto')}</p>
            </div>
            <button onClick={() => setError(null)} className="text-destructive/40 hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ) : error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-destructive font-medium">{t('analysisError')}</p>
              <p className="text-xs text-destructive/80 mt-0.5">{typeof error === 'string' && error.length < 100 ? error : 'Erro técnico na API'}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-destructive" />
            </button>
          </motion.div>
        )}

        {/* Image previews */}
        <AnimatePresence>
          {images.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                {images.map((img, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative shrink-0"
                  >
                    <img src={img} alt={`Foto ${i + 1}`} className="w-24 h-32 object-cover rounded-lg shadow-card" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-destructive-foreground" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-foreground/70 text-background text-[10px] px-1 rounded">
                      {i + 1}
                    </span>
                  </motion.div>
                ))}
              </div>

              {trialCount === 1 && images.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4"
                >
                  <Button
                    onClick={() => processImages(images)}
                    className="w-full gradient-primary text-primary-foreground h-11 shadow-md"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('retryAnalysis')}
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capture buttons */}
        <div className="space-y-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-card rounded-lg shadow-card p-8 flex flex-col items-center gap-3 border-2 border-dashed border-primary/20 hover:border-primary/40 transition-colors"
          >
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center">
              <Camera className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-card-foreground">
                {images.length === 0 ? t('takeReceiptPhoto') : t('addMorePhotos')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('tapToTakePhoto')}
              </p>
            </div>
          </button>

          <Button
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full h-12 border-2"
          >
            <Images className="w-4 h-4 mr-2" />
            {t('selectFromGallery')}
          </Button>

          {/* Single Photo Tips Banner */}
          {mode === 'single' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Info className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider">Dicas para uma boa foto</p>
              </div>
              
              <ol className="space-y-2">
                {[
                  "Coloque o cupom plano em uma mesa",
                  "Escolha um local bem iluminado",
                  "Veja se o cupom está bem legível",
                  "Enquadre todos os itens do cupom (produtos, nome do estabelecimento e data)",
                  "Se o cupom for muito longo, use a opção \"Múltiplas Fotos\" no menu anterior"
                ].map((tip, idx) => (
                  <li key={idx} className="flex gap-2 text-xs text-foreground/80 leading-relaxed">
                    <span className="font-bold text-primary">{idx + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}

          {mode === 'multi' && (
            <div className="bg-accent/50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-accent-foreground">
                {t('multiPhotoTipTitle')}
              </p>
              <p className="text-xs text-accent-foreground/80">
                {t('multiPhotoTipDesc')}
              </p>
              {images.length > 1 && (
                <p className="text-[10px] text-primary font-medium mt-1">
                  ✅ {images.length} {t('imagesAddedMsg')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Process and cancel buttons */}
        {mode === 'multi' && images.length > 0 && (
          <div className="space-y-2">
            <Button
              onClick={() => processImages(images)}
              className="w-full gradient-primary text-primary-foreground border-0 h-11"
            >
              <Check className="w-4 h-4 mr-2" />
              {t('processMultiWithAI')} ({images.length})
            </Button>
          </div>
        )}

      </div>
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              Logs de Erro ({logs.length})
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => { LogService.clearLogs(); setLogs([]); }}>Limpar</Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/10">
            {logs.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-10">Nenhum erro registrado.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`p-2 rounded-md border text-[10px] font-mono break-all ${log.level === 'error' ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-card border-border text-foreground'}`}>
                  <div className="flex justify-between font-bold mb-1 border-b border-current/10 pb-0.5">
                    <span>{log.level.toUpperCase()}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="font-bold">{log.message}</div>
                  {log.context && <pre className="mt-1 opacity-80 overflow-x-auto">{JSON.stringify(log.context, null, 2)}</pre>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
