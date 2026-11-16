import { describe, it, expect } from 'vitest';
import {
  ALL_LOADING_MESSAGES,
  CASUAL_INDIAN_MESSAGES,
  EVERYDAY_INDIAN_MESSAGES,
  RADIO_THEMED_MESSAGES,
  UPLOAD_MESSAGES,
  OFFLINE_LOADING_MESSAGE,
  RETRY_LOADING_MESSAGE,
  getNextLoadingMessage,
} from '@/constants/loadingMessages';

describe('Global Funny Loading Message System', () => {
  it('contains all required message sets with minimum 33 messages', () => {
    expect(CASUAL_INDIAN_MESSAGES.length).toBeGreaterThanOrEqual(15);
    expect(EVERYDAY_INDIAN_MESSAGES.length).toBeGreaterThanOrEqual(10);
    expect(RADIO_THEMED_MESSAGES.length).toBeGreaterThanOrEqual(8);
    expect(ALL_LOADING_MESSAGES.length).toBeGreaterThanOrEqual(33);

    // Verify key Indian humour samples
    expect(CASUAL_INDIAN_MESSAGES).toContain('Bro, just a second!');
    expect(CASUAL_INDIAN_MESSAGES).toContain('Wait da, almost done!');
    expect(CASUAL_INDIAN_MESSAGES).toContain('Enna avasaram, boss?');
    expect(CASUAL_INDIAN_MESSAGES).toContain('Aiyo! Konjam wait pannunga!');
    expect(CASUAL_INDIAN_MESSAGES).toContain('Aachu aachu… almost aachu!');
    expect(EVERYDAY_INDIAN_MESSAGES).toContain('Even Maggi takes two minutes, boss!');
    expect(EVERYDAY_INDIAN_MESSAGES).toContain('Good things take time… like proper biryani!');
    expect(EVERYDAY_INDIAN_MESSAGES).toContain('Have some tea. We\'ll be back before it gets cold! ☕');
    expect(RADIO_THEMED_MESSAGES).toContain('Hello hello! Please stay tuned!');
    expect(RADIO_THEMED_MESSAGES).toContain('Our RJ is waiting too. Please cooperate!');
  });

  it('provides dedicated offline and retry friendly messages', () => {
    expect(OFFLINE_LOADING_MESSAGE).toContain('internet went for a tea break');
    expect(RETRY_LOADING_MESSAGE).toContain('try once more');
  });

  it('guarantees that the previous message is never immediately repeated', () => {
    const totalRuns = 50;
    let prev = getNextLoadingMessage('all');

    for (let i = 0; i < totalRuns; i++) {
      const next = getNextLoadingMessage('all', prev);
      expect(next).not.toBe(prev);
      expect(ALL_LOADING_MESSAGES).toContain(next);
      prev = next;
    }
  });

  it('respects category filtering', () => {
    for (let i = 0; i < 20; i++) {
      const casualMsg = getNextLoadingMessage('casual');
      expect(CASUAL_INDIAN_MESSAGES).toContain(casualMsg);

      const everydayMsg = getNextLoadingMessage('everyday');
      expect(EVERYDAY_INDIAN_MESSAGES).toContain(everydayMsg);

      const radioMsg = getNextLoadingMessage('radio');
      expect(RADIO_THEMED_MESSAGES).toContain(radioMsg);
    }
  });

  it('includes specialized upload messages when in upload category', () => {
    const uploadPool = [...UPLOAD_MESSAGES, ...ALL_LOADING_MESSAGES];
    for (let i = 0; i < 25; i++) {
      const msg = getNextLoadingMessage('upload');
      expect(uploadPool).toContain(msg);
    }
  });
});
