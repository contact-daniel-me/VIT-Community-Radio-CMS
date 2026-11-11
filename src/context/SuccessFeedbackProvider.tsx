import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfettiCanvas } from '@/components/feedback/ConfettiCanvas';
import { SuccessToastViewport } from '@/components/feedback/SuccessToastViewport';
import {
  SuccessFeedbackContext,
  TOAST_DURATION_MS,
  createFeedbackDeduper,
  formatBookingCelebrationMessage,
  formatPublishCelebrationMessage,
  isReducedMotionPreferred,
  type BookingCelebrationPayload,
  type ConfettiBurstRequest,
  type ConfettiPreset,
  type FeedbackVariant,
  type PublishCelebrationPayload,
  type SimpleSavePayload,
  type SubtleFeedbackPayload,
  type SuccessFeedbackContextValue,
  type ToastItem,
} from '@/context/successFeedbackContext';

export function SuccessFeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [burst, setBurst] = useState<ConfettiBurstRequest | null>(null);

  const deduperRef = useRef(createFeedbackDeduper());
  const toastSeqRef = useRef(0);
  const burstSeqRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      variant: FeedbackVariant,
      title: string,
      detail?: string,
      badgeText?: string,
      dedupeKey?: string,
    ) => {
      if (!deduperRef.current.canShowToast(dedupeKey)) return;

      toastSeqRef.current += 1;
      const now = Date.now();
      const item: ToastItem = {
        id: `sf-toast-${toastSeqRef.current}-${now}`,
        variant,
        title,
        detail,
        badgeText,
        dedupeKey,
        createdAt: now,
        durationMs: TOAST_DURATION_MS[variant],
      };

      setToasts((prev) => {
        const filtered = dedupeKey
          ? prev.filter((existing) => existing.dedupeKey !== dedupeKey)
          : prev;
        return [...filtered, item].slice(-3);
      });
    },
    [],
  );

  const triggerConfetti = useCallback((preset: ConfettiPreset, dedupeKey?: string) => {
    if (isReducedMotionPreferred()) return;
    if (!deduperRef.current.canTriggerConfetti(dedupeKey)) return;

    burstSeqRef.current += 1;
    setBurst({ id: burstSeqRef.current, preset });
  }, []);

  const handleBurstDone = useCallback((id: number) => {
    setBurst((current) => (current?.id === id ? null : current));
  }, []);

  const celebrateBooking = useCallback(
    (payload?: BookingCelebrationPayload) => {
      const msg = formatBookingCelebrationMessage(payload);
      const dedupeKey = payload?.dedupeKey ?? (payload?.reference ? `booking:${payload.reference}` : undefined);
      triggerConfetti('subtle', dedupeKey);
      pushToast('booking', msg.title, msg.detail, undefined, dedupeKey);
    },
    [pushToast, triggerConfetti],
  );

  const celebratePublish = useCallback(
    (payload?: PublishCelebrationPayload) => {
      const msg = formatPublishCelebrationMessage(payload);
      const dedupeKey = payload?.dedupeKey;
      triggerConfetti('celebration', dedupeKey);
      pushToast('publish', msg.title, msg.detail, msg.badgeText, dedupeKey);
    },
    [pushToast, triggerConfetti],
  );

  const notifyUpload = useCallback(
    (payload: SubtleFeedbackPayload) => {
      pushToast('upload', payload.title, payload.detail, undefined, payload.dedupeKey);
    },
    [pushToast],
  );

  const notifyApproval = useCallback(
    (payload: SubtleFeedbackPayload) => {
      pushToast('approval', payload.title, payload.detail, undefined, payload.dedupeKey);
    },
    [pushToast],
  );

  const notifySave = useCallback(
    (payload: SimpleSavePayload) => {
      pushToast('save', payload.title, payload.detail, undefined, payload.dedupeKey);
    },
    [pushToast],
  );

  const value = useMemo<SuccessFeedbackContextValue>(
    () => ({
      celebrateBooking,
      celebratePublish,
      notifyUpload,
      notifyApproval,
      notifySave,
      dismissToast,
    }),
    [celebrateBooking, celebratePublish, notifyUpload, notifyApproval, notifySave, dismissToast],
  );

  return (
    <SuccessFeedbackContext.Provider value={value}>
      {children}
      <ConfettiCanvas burst={burst} onDone={handleBurstDone} />
      <SuccessToastViewport toasts={toasts} onDismiss={dismissToast} />
    </SuccessFeedbackContext.Provider>
  );
}

