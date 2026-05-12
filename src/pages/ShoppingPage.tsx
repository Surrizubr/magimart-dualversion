import { useState, useRef, useEffect } from 'react';
import { recalculateStockRates } from '@/lib/consumptionCalculator';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { ArrowLeft, ListChecks, Camera, Search, MapPin, X, Plus, Minus, ShoppingCart, XCircle, CheckCircle, CheckCircle2, Loader2, RotateCcw, Send, Info, Lightbulb } from 'lucide-react';
import { TabId, StockItem, PurchaseHistory } from '@/types';
import { toast } from 'sonner';
import { analyzeWithGemini, PRODUCT_PROMPT } from '@/services/geminiService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { getStock, saveStock, getHistory, saveHistory } from '@/data/mockData';
import { PermissionGate } from '@/components/PermissionGate';

type ShoppingMode = null | 'list' | 'register' | 'category';

interface ShoppingItem {
  id: string;
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
}

const categories = [
  'Frutas', 'Verduras', 'Carnes', 'Laticínios', 'Padaria',
  'Bebidas', 'Limpeza', 'Higiene', 'Grãos', 'Temperos', 'Outros'
];

interface ShoppingPageProps {
  onNavigate: (tab: TabId) => void;
  onBack?: () => void;
}

interface InstructionsBannerProps {
  item2Text: string;
}

function InstructionsBanner({ item2Text }: InstructionsBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mt-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">{useLanguage().t('howItWorks')}</h3>
      </div>
      
      <div className="space-y-3">
        <ul className="space-y-2">
          {[
            useLanguage().t('shoppingStep1'),
            item2Text,
            useLanguage().t('shoppingStep3'),
            useLanguage().t('shoppingStep4')
          ].map((text, idx) => (
            <li key={idx} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-[10px]">
                {idx + 1}
              </span>
              {text}
            </li>
          ))}
        </ul>

        <div className="pt-2 mt-2 border-t border-primary/10">
          <div className="flex gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-bold text-foreground">{useLanguage().t('tip')}:</span> {useLanguage().t('shoppingTip')}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ShoppingPage({ onNavigate, onBack }: ShoppingPageProps) {
  const { t, currency, formatCurrency: fc } = useLanguage();
  const [mode, setMode] = useState<ShoppingMode>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);

  const [storeName, setStoreName] = useState('');
  const [storeSet, setStoreSet] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showLocationGate, setShowLocationGate] = useState(false);
  const [showCameraGate, setShowCameraGate] = useState(false);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState('un');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Outros');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStep, setCameraStep] = useState<'idle' | 'scanning' | 'captured' | 'processing'>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingThumbnail, setProcessingThumbnail] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const handleGeoLocation = () => {
    setShowLocationGate(true);
  };

  const executeGeoLocation = () => {
    setShowLocationGate(false);
    setGeoLoading(true);
    console.log("Starting geolocation in ShoppingPage...");

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
        console.log("Geolocation successful in ShoppingPage:", pos.coords.latitude, pos.coords.longitude);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
          { 
            headers: { 
              'Accept-Language': 'pt-BR',
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
        
        setStoreName(name.trim());
        toast.dismiss(loadingToast);
        toast.success(t('locationObtained'));
      } catch (err) {
        console.error("Geocoding Error in ShoppingPage:", err);
        setStoreName(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        toast.dismiss(loadingToast);
        toast.info(t('coordsSaved'));
      }
      setGeoLoading(false);
    };

    const errorCallback = (err: GeolocationPositionError) => {
      console.error("Geolocation error callback in ShoppingPage:", err);
      setGeoLoading(false);
      toast.dismiss(loadingToast);
      
      const messages: Record<number, string> = {
        1: t('permissionDenied') || "Permissão negada.",
        2: t('locationError') || "Localização indisponível.",
        3: t('locationError') || "Tempo de busca excedido."
      };
      
      // If high accuracy failed, we already tried false, so just show error
      toast.error(messages[err.code] || t('locationError'));
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  };

  const confirmStore = () => {
    if (!storeName.trim()) {
      toast.error(t('informMarketLocation'));
      return;
    }
    setStoreSet(true);
  };

  const addItem = () => {
    if (!newName.trim()) return;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      product_name: newName.trim(),
      category: newCategory,
      quantity: newQty,
      unit: newUnit,
      price: parseFloat(newPrice) || 0,
    }]);
    setNewName('');
    setNewQty(1);
    setNewPrice('');
    setNewCategory('Outros');
    setShowAddForm(false);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
    ));
  };

  const finishShopping = async () => {
    if (items.length === 0) {
      toast.error(t('noItemsAdded'));
      return;
    }
    
    // Save to history only
    const history = getHistory();
    const newHistory = [...history];
    
    items.forEach(item => {
      newHistory.push({
        id: crypto.randomUUID(),
        product_name: item.product_name,
        category: item.category,
        quantity: item.quantity,
        price: item.price,
        total_price: item.price * item.quantity,
        store_name: storeName,
        purchase_date: new Date().toISOString().slice(0, 10),
        scanned: false,
      });
    });
    
    await saveHistory(newHistory);

    toast.success(t('shoppingEnded'));
    onNavigate('home');
  };

  const cancelShopping = () => {
    setItems([]);
    setMode(null);
    setStoreSet(false);
    setStoreName('');
    onNavigate('home');
  };

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, cameraActive]);

  const startCamera = async () => {
    setShowCameraGate(true);
  };

  const executeStartCamera = async () => {
    setShowCameraGate(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      setCameraActive(true);
      setCameraStep('scanning');
    } catch (err: any) {
      console.error('Camera Access Error:', err);
      toast.error(t('cameraAccessError') + ' ' + (err.message || t('permissionDenied')));
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
    setCameraStep('idle');
    setCapturedImage(null);
    setProgress(0);
  };

  const compressImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max = 800; // Optimized size
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
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Optimized quality
      };
      img.src = dataUrl;
    });
  };

  const captureImage = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    setCameraStep('captured');
  };

  const processAndRecognize = async () => {
    if (!capturedImage) return;

    try {
      setProcessingThumbnail(capturedImage);
      setIsProcessing(true);
      stopCamera();
      
      setProgress(10);
      
      intervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 90;
          }
          return prev + 10; // Faster progress steps
        });
      }, 500);

      const compressedDataUrl = await compressImage(capturedImage);
      setProgress(40);

      const geminiApiKey = localStorage.getItem('gemini-api-key') || '';
      const result = await analyzeWithGemini([compressedDataUrl], PRODUCT_PROMPT, geminiApiKey);
      
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);

      const { product_name, category } = result;
      setNewName(product_name || '');
      setNewCategory(category || 'Outros');
      setShowAddForm(true);
      
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingThumbnail(null);
        setProgress(0);
        toast.success(t('productRecognized').replace('{name}', product_name));
      }, 500);
    } catch (err: any) {
      console.error('AI Recognition Error:', err);
      if (!err.message?.includes('aborted')) {
        toast.error(err.message || t('recognitionError'));
      }
      setIsProcessing(false);
      setProcessingThumbnail(null);
      setProgress(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const cancelProcessing = () => {
    setIsProcessing(false);
    setProcessingThumbnail(null);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    toast.info(t('recognitionCanceled'));
  };

  // Mode selection screen
  if (mode === null) {
    return (
      <div className="pb-20">
        <PageHeader
          title={t('shopping')}
          subtitle={t('chooseRegisterMode')}
          onBack={onBack}
        />
        <div className="px-4 pt-4 space-y-3">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            onClick={() => onNavigate('lists')}
            className="w-full bg-card rounded-xl border border-border p-5 text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ListChecks className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{t('withList')}</p>
              <p className="text-xs text-muted-foreground">{t('withListDesc')}</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => setMode('register')}
            className="w-full bg-card rounded-xl border border-border p-5 text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
              <Camera className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{t('registerAction')}</p>
              <p className="text-xs text-muted-foreground">{t('registerDesc')}</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setMode('category')}
            className="w-full bg-card rounded-xl border border-border p-5 text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{t('byCategory')}</p>
              <p className="text-xs text-muted-foreground">{t('byCategoryDesc')}</p>
            </div>
          </motion.button>

          <InstructionsBanner item2Text={t('shoppingStep2')} />
        </div>
      </div>
    );
  }

  // Store name input (before adding items)
  if (!storeSet) {
    return (
      <div className="pb-20">
        <PageHeader
          title={mode === 'register' ? t('registerPurchase') : t('purchaseByCategory')}
          subtitle={t('informMarketLocation')}
          onBack={() => setMode(null)}
        />
        <div className="px-4 pt-6 space-y-4">
          <PermissionGate 
            isOpen={showLocationGate} 
            type="location" 
            onAllow={executeGeoLocation} 
            onCancel={() => setShowLocationGate(false)} 
          />
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <label className="text-sm font-medium text-foreground">{t('marketNameLabel')}</label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder={t('marketNamePlaceholder')}
              className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ou</span>
              <button
                onClick={handleGeoLocation}
                disabled={geoLoading}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent text-primary text-xs font-medium"
              >
                <MapPin className="w-3.5 h-3.5" />
                {geoLoading ? t('obtaining') : t('useLocation')}
              </button>
            </div>
          </div>
          <button
            onClick={confirmStore}
            className="w-full p-3 rounded-xl gradient-primary text-primary-foreground text-sm font-bold"
          >
            {t('continueBtn')}
          </button>
          
          <InstructionsBanner 
            item2Text={mode === 'register' ? 
              t('photoStepInstruction') : 
              t('manualStepInstruction')
            } 
          />
        </div>
      </div>
    );
  }

  // Active shopping session
  return (
    <div className="pb-20">
      <PermissionGate 
        isOpen={showLocationGate} 
        type="location" 
        onAllow={executeGeoLocation} 
        onCancel={() => setShowLocationGate(false)} 
      />
      <PermissionGate 
        isOpen={showCameraGate} 
        type="camera" 
        onAllow={executeStartCamera} 
        onCancel={() => setShowCameraGate(false)} 
      />
      {/* Camera Full Screen Overlay */}
      <AnimatePresence>
        {cameraActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="relative flex-1">
              {cameraStep === 'scanning' && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-6 left-0 right-0 flex justify-center">
                    <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                      <p className="text-white text-sm font-medium">{t('pointToProduct')}</p>
                    </div>
                  </div>
                </>
              )}

              {cameraStep === 'captured' && capturedImage && (
                <>
                  <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
                  <div className="absolute inset-0 bg-black/10" />
                </>
              )}

              {cameraStep === 'processing' && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-8 space-y-8">
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className="w-24 h-24 rounded-full border-t-2 border-primary"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                  </div>
                  
                  <div className="w-full max-w-xs space-y-4 text-center">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-primary/70">
                        <span>{t('analyzingProduct')}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2 bg-white/5" />
                    </div>
                    <p className="text-white font-medium animate-pulse">{t('aiIdentifyingItem')}</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-tighter">{t('mayTakeSeconds')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            {cameraStep !== 'processing' && (
              <div className="bg-black p-6 pb-10 flex items-center justify-between gap-4">
                {cameraStep === 'scanning' ? (
                  <>
                    <Button
                      variant="ghost"
                      className="flex-1 text-white hover:bg-white/10"
                      onClick={stopCamera}
                    >
                      {t('cancelBtn')}
                    </Button>
                    <button
                      onClick={captureImage}
                      className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1"
                    >
                      <div className="w-full h-full rounded-full bg-white active:scale-95 transition-transform" />
                    </button>
                    <div className="flex-1" /> {/* Spacer */}
                  </>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      className="flex-1 h-12 text-sm font-bold"
                      onClick={() => setCameraStep('scanning')}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {t('decline')}
                    </Button>
                    <Button
                      className="flex-1 h-12 gradient-primary text-primary-foreground text-sm font-bold"
                      onClick={processAndRecognize}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {t('accept')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <PageHeader
        title={t('shoppingInProgress')}
        subtitle={storeName}
        onBack={() => { setStoreSet(false); setMode(null); }}
      />

      {/* Total bar */}
      <div className="px-4 pt-3">
        <div className="bg-card rounded-xl border border-primary/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">{items.length} {items.length === 1 ? t('item') : t('items')}</span>
          </div>
          <span className="text-lg font-bold text-primary">{fc(total)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pt-3 flex flex-col gap-3">
        <div className="flex gap-2">
          <button onClick={finishShopping} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold shadow-lg">
            <CheckCircle className="w-4 h-4" /> {t('finishShopping')}
          </button>
          <button onClick={cancelShopping} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs font-bold">
            <XCircle className="w-4 h-4" /> {t('cancelShopping')}
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3 shadow-sm">
          <div className="bg-amber-500/10 p-1.5 rounded-lg shrink-0">
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800 font-medium italic">
            {t('endShoppingBanner')}
          </p>
        </div>
      </div>

      {/* Camera section for register mode */}
      {mode === 'register' && !cameraActive && (
        <div className="px-4 pt-3 space-y-3">
          <button onClick={startCamera} className="w-full bg-card rounded-xl border border-border p-4 flex items-center justify-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">{t('openCamera')}</span>
          </button>

          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl border border-primary/20 p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                {processingThumbnail && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
                    <img src={processingThumbnail} className="w-full h-full object-cover" alt="Thumbnail" />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-primary">
                    <span>{t('recognizing')}</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground animate-pulse">A IA está identificando o item...</p>
                </div>
                <button 
                  onClick={cancelProcessing}
                  className="p-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Category filter for category mode */}
      {mode === 'category' && (
        <div className="px-4 pt-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat ? 'gradient-primary text-primary-foreground' : 'bg-card border border-border text-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add item button */}
      <div className="px-4 pt-3">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full bg-card rounded-xl border border-dashed border-primary/40 p-3 flex items-center justify-center gap-2 text-primary"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">{t('addItem')}</span>
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{t('newItem')}</span>
              <button onClick={() => setShowAddForm(false)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('productName')}
              className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Math.max(1, Number(e.target.value)))}
                className="w-16 p-2.5 rounded-lg border border-border bg-background text-foreground text-sm text-center"
              />
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="flex-1 p-2.5 rounded-lg border border-border bg-background text-foreground text-sm"
              >
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder={`${currency} 0,00`}
                className="w-24 p-2.5 rounded-lg border border-border bg-background text-foreground text-sm"
              />
            </div>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-sm"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={addItem} className="w-full p-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">
              {t('add')}
            </button>
          </motion.div>
        )}
      </div>

      {/* Items list */}
      <div className="px-4 pt-3 space-y-2">
        <AnimatePresence>
          {items.map(item => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">{t(item.category)} · {fc(item.price)}/{item.unit}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                  <Minus className="w-3 h-3 text-foreground" />
                </button>
                <span className="text-sm font-bold text-foreground w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQty(item.id, 1)} className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                  <Plus className="w-3 h-3 text-foreground" />
                </button>
              </div>
              <button onClick={() => removeItem(item.id)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-10">
        <InstructionsBanner 
          item2Text={mode === 'register' ? 
            "Tire a foto do rótulo do produto que quer adicionar;" : 
            "Adicione produtos manualmente a partir da lista de categorias;"
          } 
        />
      </div>
    </div>
  );
}
