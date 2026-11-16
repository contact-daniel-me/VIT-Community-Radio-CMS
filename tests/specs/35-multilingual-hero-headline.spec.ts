import { describe, it, expect } from 'vitest';
import { HERO_HEADLINES } from '@/constants/heroHeadlines';

describe('Multilingual Rotating Hero Headline', () => {
  it('contains exactly five languages in proper cycle sequence', () => {
    expect(HERO_HEADLINES).toHaveLength(5);
    const ids = HERO_HEADLINES.map((h) => h.id);
    expect(ids).toEqual(['en', 'ta', 'hi', 'te', 'ml']);
  });

  it('preserves exact translation texts and punctuation for English', () => {
    const en = HERO_HEADLINES.find((h) => h.id === 'en')!;
    expect(en.line1).toBe('Your Voice.');
    expect(en.line2).toBe('Your Radio.');
    expect(en.label).toBe('ENGLISH');
    expect(en.lang).toBe('en');
  });

  it('preserves exact translation texts and punctuation for Tamil', () => {
    const ta = HERO_HEADLINES.find((h) => h.id === 'ta')!;
    expect(ta.line1).toBe('உங்கள் குரல்.');
    expect(ta.line2).toBe('உங்கள் வானொலி.');
    expect(ta.label).toBe('தமிழ் · TAMIL');
    expect(ta.lang).toBe('ta');
  });

  it('preserves exact translation texts and punctuation for Hindi (including purna viram)', () => {
    const hi = HERO_HEADLINES.find((h) => h.id === 'hi')!;
    expect(hi.line1).toBe('आपकी आवाज़।');
    expect(hi.line2).toBe('आपका रेडियो।');
    expect(hi.label).toBe('हिन्दी · HINDI');
    expect(hi.lang).toBe('hi');
  });

  it('preserves exact translation texts and punctuation for Telugu', () => {
    const te = HERO_HEADLINES.find((h) => h.id === 'te')!;
    expect(te.line1).toBe('మీ స్వరం.');
    expect(te.line2).toBe('మీ రేడియో.');
    expect(te.label).toBe('తెలుగు · TELUGU');
    expect(te.lang).toBe('te');
  });

  it('preserves exact translation texts and punctuation for Malayalam', () => {
    const ml = HERO_HEADLINES.find((h) => h.id === 'ml')!;
    expect(ml.line1).toBe('നിങ്ങളുടെ ശബ്ദം.');
    expect(ml.line2).toBe('നിങ്ങളുടെ റേഡിയോ.');
    expect(ml.label).toBe('മലയാളം · MALAYALAM');
    expect(ml.lang).toBe('ml');
  });

  it('supports infinite cyclical rotation without repeating consecutive languages', () => {
    let currentIndex = 0;
    const history: string[] = [];

    for (let step = 0; step < 15; step++) {
      const headline = HERO_HEADLINES[currentIndex];
      history.push(headline.id);
      currentIndex = (currentIndex + 1) % HERO_HEADLINES.length;
    }

    // Must cycle through en -> ta -> hi -> te -> ml three times
    expect(history.slice(0, 5)).toEqual(['en', 'ta', 'hi', 'te', 'ml']);
    expect(history.slice(5, 10)).toEqual(['en', 'ta', 'hi', 'te', 'ml']);
    expect(history.slice(10, 15)).toEqual(['en', 'ta', 'hi', 'te', 'ml']);

    // Check no consecutive duplicates
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).not.toBe(history[i - 1]);
    }
  });
});
