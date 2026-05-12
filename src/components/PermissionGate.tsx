import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapPin, Camera, X } from 'lucide-react';

interface PermissionGateProps {
  isOpen: boolean;
  type: 'location' | 'camera';
  onAllow: () => void;
  onCancel: () => void;
}

export function PermissionGate({ isOpen, type, onAllow, onCancel }: PermissionGateProps) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-6 shadow-elevated border border-border"
          >
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-full ${type === 'location' ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-600'}`}>
                {type === 'location' ? <MapPin className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
              </div>
              <button onClick={onCancel} className="p-1 hover:bg-secondary rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">
                {type === 'location' ? t('locationPermissionTitle') : t('cameraPermissionTitle')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {type === 'location' ? t('locationPermissionDesc') : t('cameraPermissionDesc')}
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onCancel}>
                {t('notNow')}
              </Button>
              <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={onAllow}>
                {t('allow')}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
