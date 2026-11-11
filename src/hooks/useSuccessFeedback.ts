import { useContext } from 'react';
import {
  SuccessFeedbackContext,
  type SuccessFeedbackContextValue,
} from '@/context/successFeedbackContext';

const NOOP_FEEDBACK: SuccessFeedbackContextValue = {
  celebrateBooking: () => {},
  celebratePublish: () => {},
  notifyUpload: () => {},
  notifyApproval: () => {},
  notifySave: () => {},
  dismissToast: () => {},
};

/**
 * Returns feedback / subtle celebration triggers backed by SuccessFeedbackProvider.
 * Safely degrades to a no-op outside the provider so isolated tests never crash.
 */
export function useSuccessFeedback(): SuccessFeedbackContextValue {
  return useContext(SuccessFeedbackContext) ?? NOOP_FEEDBACK;
}

