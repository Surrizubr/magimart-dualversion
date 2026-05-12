import { useAuthContext } from '@/contexts/AuthContext';

export function useAuth() {
  const { user, loading, signOut } = useAuthContext();
  return { user, loading, signOut };
}
