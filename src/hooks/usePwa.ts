import { useContext } from 'react';
import { PwaContext, type PwaContextType } from '@/context/pwaContext';

export function usePwa(): PwaContextType {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error('usePwa must be used within a PwaProvider');
  }
  return context;
}
