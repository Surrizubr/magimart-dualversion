import { useSubscriptionContext } from '@/contexts/SubscriptionContext';

export { SubscriptionProvider } from '@/contexts/SubscriptionContext';
export type { SubscriptionInfo, SubStatus } from '@/contexts/SubscriptionContext';

export function useSubscription() {
  return useSubscriptionContext();
}
