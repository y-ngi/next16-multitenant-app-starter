import { useCallback } from 'react';

export interface Toast {
  readonly title?: string;
  readonly description?: string;
  readonly variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = useCallback((props: Toast) => {
    // For now, just log to console
    // In a real app, this would use a toast provider
    console.log('[Toast]', props);
  }, []);

  return { toast };
}
