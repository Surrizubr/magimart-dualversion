import { motion } from 'framer-motion';
import { Leaf, ShoppingCart, BarChart3, Camera, Users, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';

interface TrialWelcomeProps {
  onStartTrial: () => void;
}

const features = [
  { icon: ShoppingCart, text: 'Listas de compras inteligentes' },
  { icon: Camera, text: 'Scanner de cupom fiscal com IA' },
  { icon: BarChart3, text: 'Relatórios e economia mensal' },
  { icon: Users, text: 'Compartilhamento em família' },
  { icon: Bell, text: 'Alertas de reposição automáticos' },
];

export function TrialWelcome({ onStartTrial }: TrialWelcomeProps) {
  const { currency } = useLanguage();
  const { openCheckout } = useSubscriptionContext();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm space-y-5"
      >
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
            className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto"
          >
            <Leaf className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">Magicmart AI</h1>
          <p className="text-sm text-muted-foreground">
            Seu assistente inteligente de compras e controle de estoque doméstico
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-lg shadow-card p-4 space-y-3"
        >
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="flex items-center gap-3"
            >
              <f.icon className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm text-card-foreground">{f.text}</span>
              <span className="ml-auto text-primary text-sm">✓</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="gradient-primary rounded-lg p-4 text-center text-primary-foreground"
        >
          <p className="text-2xl font-bold">{currency} 49,90<span className="text-sm font-normal">/ano</span></p>
          <p className="text-xs opacity-90">Menos de {currency} 4,16 por mês</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="space-y-3"
        >
          <Button 
            onClick={openCheckout}
            className="w-full h-12 text-base font-semibold gradient-primary text-primary-foreground border-0"
          >
            Assinar Agora
          </Button>
          <Button
            variant="outline"
            onClick={onStartTrial}
            className="w-full h-12 text-base font-semibold border-warning text-warning hover:bg-warning-bg"
          >
            Experimentar 7 dias grátis
          </Button>
          <button className="w-full text-xs text-muted-foreground underline">
            Restaurar compra
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
