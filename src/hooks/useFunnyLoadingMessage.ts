import { useEffect, useRef, useState } from 'react';
import {
  getNextLoadingMessage,
  OFFLINE_LOADING_MESSAGE,
  type LoadingCategory,
} from '@/constants/loadingMessages';

export interface UseFunnyLoadingOptions {
  category?: LoadingCategory;
  intervalMs?: number;
  initialMessage?: string;
  checkOffline?: boolean;
}

export function useFunnyLoadingMessage({
  category = 'all',
  intervalMs = 3200,
  initialMessage,
  checkOffline = true,
}: UseFunnyLoadingOptions = {}) {
  const [currentMessage, setCurrentMessage] = useState<string>(() =>
    initialMessage || getNextLoadingMessage(category)
  );
  const [isFading, setIsFading] = useState(false);
  const [isOffline, setIsOffline] = useState(() =>
    checkOffline && typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const lastMessageRef = useRef(currentMessage);
  lastMessageRef.current = currentMessage;

  // Track offline events
  useEffect(() => {
    if (!checkOffline || typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      setCurrentMessage(getNextLoadingMessage(category, lastMessageRef.current));
    };

    const handleOffline = () => {
      setIsOffline(true);
      setCurrentMessage(OFFLINE_LOADING_MESSAGE);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [category, checkOffline]);

  // Rotate messages while mounted and not offline
  useEffect(() => {
    if (isOffline) return;

    const timer = setInterval(() => {
      // 1. Trigger subtle fade-out
      setIsFading(true);

      // 2. Switch text after short fade
      const switchTimer = setTimeout(() => {
        const next = getNextLoadingMessage(category, lastMessageRef.current);
        setCurrentMessage(next);
        setIsFading(false);
      }, 200);

      return () => clearTimeout(switchTimer);
    }, Math.max(2000, intervalMs));

    return () => clearInterval(timer);
  }, [category, intervalMs, isOffline]);

  return {
    message: isOffline ? OFFLINE_LOADING_MESSAGE : currentMessage,
    isFading,
    isOffline,
  };
}
