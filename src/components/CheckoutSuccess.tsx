import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export function CheckoutSuccess() {
  const handleReturnToApp = () => {
    // Tenta abrir o app via Deep Link
    window.location.href = 'com.magicmart.app://callback?checkout=success';
    
    // Se não abrir em 2 segundos (provavelmente já está no app web), 
    // apenas remove os parâmetros da URL
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, document.title, url.pathname);
      window.location.reload();
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 relative overflow-hidden">
      {/* Estética Premium */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-card border border-border p-8 rounded-3xl shadow-elevated text-center space-y-8 z-10"
      >
        <div className="space-y-4">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
            className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/20"
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </motion.div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              Pagamento Confirmado!
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Sua assinatura Premium está ativa. Obrigado por apoiar o Magicmart AI!
            </p>
          </div>
        </div>

        <div className="bg-accent/30 rounded-2xl p-4 border border-border">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Status da Transação</p>
          <p className="text-sm font-bold text-green-500 flex items-center justify-center gap-1">
            Sucesso via Stripe
          </p>
        </div>

        <button
          onClick={handleReturnToApp}
          className="w-full group flex items-center justify-center gap-3 p-4 rounded-2xl gradient-primary text-primary-foreground shadow-lg hover:shadow-elevated transition-all active:scale-[0.98] font-bold"
        >
          <span>ABRIR O APLICATIVO</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        <p className="text-[10px] text-muted-foreground/60 px-4">
          Se o aplicativo não abrir automaticamente, clique no botão acima para concluir a ativação.
        </p>
      </motion.div>
    </div>
  );
}
