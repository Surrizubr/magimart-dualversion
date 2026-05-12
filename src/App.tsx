import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { DevModeProvider } from "@/contexts/DevModeContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { AuthGuard } from "@/components/AuthGuard";
import Index from "./pages/Index";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DevModeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <LanguageProvider>
              <ThemeProvider>
                <PreferencesProvider>
                  <TooltipProvider>
                    <AuthGuard>
                      <Index />
                    </AuthGuard>
                    <Toaster position="top-center" richColors />
                  </TooltipProvider>
                </PreferencesProvider>
              </ThemeProvider>
            </LanguageProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </DevModeProvider>
    </QueryClientProvider>
  );
}
