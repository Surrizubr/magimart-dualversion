import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';

interface SplashScreenProps {
  progress?: number;
  message?: string;
}

export function SplashScreen({ progress = 0, message }: SplashScreenProps) {
  const { t } = useLanguage();
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    // Smooth progress animation
    const timer = setTimeout(() => {
      if (displayProgress < progress) {
        setDisplayProgress(prev => Math.min(prev + 1, progress));
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [progress, displayProgress]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-12 text-center"
      >
        <div className="space-y-4">
          <motion.div
            animate={{ 
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mx-auto shadow-elevated"
          >
            <span className="text-4xl">🌿</span>
          </motion.div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              Magicmart <span className="text-primary">AI</span>
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t('appTagline')}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-8">
          <div className="relative h-2 w-full bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            />
          </div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold animate-pulse">
            {message || t('checkingSubscription')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
