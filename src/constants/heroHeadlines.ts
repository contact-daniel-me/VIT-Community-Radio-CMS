/**
 * VIT Community Radio 90.8 FM - Multilingual Hero Headlines
 *
 * Continuous rotating hero headline in five languages:
 * 1. English
 * 2. Tamil
 * 3. Hindi
 * 4. Telugu
 * 5. Malayalam
 */

export interface MultilingualHeadline {
  id: 'en' | 'ta' | 'hi' | 'te' | 'ml';
  lang: string;
  label: string;
  line1: string;
  line2: string;
}

export const HERO_HEADLINES: readonly MultilingualHeadline[] = [
  {
    id: 'en',
    lang: 'en',
    label: 'ENGLISH',
    line1: 'Your Voice.',
    line2: 'Your Radio.',
  },
  {
    id: 'ta',
    lang: 'ta',
    label: 'தமிழ் · TAMIL',
    line1: 'உங்கள் குரல்.',
    line2: 'உங்கள் வானொலி.',
  },
  {
    id: 'hi',
    lang: 'hi',
    label: 'हिन्दी · HINDI',
    line1: 'आपकी आवाज़।',
    line2: 'आपका रेडियो।',
  },
  {
    id: 'te',
    lang: 'te',
    label: 'తెలుగు · TELUGU',
    line1: 'మీ స్వరం.',
    line2: 'మీ రేడియో.',
  },
  {
    id: 'ml',
    lang: 'ml',
    label: 'മലയാളം · MALAYALAM',
    line1: 'നിങ്ങളുടെ ശബ്ദം.',
    line2: 'നിങ്ങളുടെ റേഡിയോ.',
  },
] as const;
