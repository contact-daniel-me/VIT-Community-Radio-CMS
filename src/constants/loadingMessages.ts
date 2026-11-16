/**
 * VIT Community Radio 90.8 FM - Funny Loading Messages
 *
 * A collection of warm, witty, natural Indian-style quips and radio-themed banter
 * designed to bring a smile to station users while waiting for operations to complete.
 */

export const CASUAL_INDIAN_MESSAGES = [
  'Bro, just a second!',
  'Wait da, almost done!',
  "You came early. We're getting ready!",
  "Don't stare at me. I'm trying! 😂",
  'Macha, don\'t change the channel!',
  "Like always, we're running a little late!",
  "We know, bro. Even we're waiting!",
  "Okay okay, we're coming!",
  'Enna avasaram, boss?',
  'Aiyo! Konjam wait pannunga!',
  'Aachu aachu… almost aachu!',
  'Relax, boss! No need to panic!',
  'Just give us a minute, yaar!',
  "Don't go anywhere. We're almost there!",
  'One minute, boss! Please cooperate!',
] as const;

export const EVERYDAY_INDIAN_MESSAGES = [
  'Even Maggi takes two minutes, boss!',
  "Have some tea. We'll be back before it gets cold! ☕",
  'Good things take time… like proper biryani!',
  'Amma said wait… so please wait!',
  "Just like your friend who says '5 minutes'!",
  "Don't refresh like you're checking exam results!",
  'Why so serious, boss?',
  'This is not a government office queue! 😂',
  "Just a little longer. Don't make it a big story!",
  "Please wait… Don't call Appa just yet!",
] as const;

export const RADIO_THEMED_MESSAGES = [
  'Hello hello! Please stay tuned!',
  "Don't change the channel. We'll be right back!",
  'The show is about to begin. Hold your excitement!',
  'Our RJ is waiting too. Please cooperate!',
  'Breaking news: We\'re almost ready!',
  'Stay tuned! Your favourite show is getting ready!',
  'The show must go on… after this little wait!',
  'Keep smiling! Your studio is almost ready!',
] as const;

export const UPLOAD_MESSAGES = [
  'Beaming your high-bitrate broadcast to the cloud... 🚀',
  'Tuning the audio antennas at 90.8 FM... 📻',
  'RJ speech and background music traveling at light speed...',
  'Almost uploaded! Giving the frequency dials a quick polish...',
  'Checking the decibels… sounds crisp, boss!',
  'Audio packets are reaching the transmitter tower...',
] as const;

/** All general loading messages combined */
export const ALL_LOADING_MESSAGES: readonly string[] = [
  ...CASUAL_INDIAN_MESSAGES,
  ...EVERYDAY_INDIAN_MESSAGES,
  ...RADIO_THEMED_MESSAGES,
];

/** Offline / network status messages */
export const OFFLINE_LOADING_MESSAGE =
  'Looks like the internet went for a tea break! ☕ Please check your connection.';

export const RETRY_LOADING_MESSAGE =
  'Oops! That didn\'t work. Shall we try once more?';

export type LoadingCategory = 'all' | 'casual' | 'everyday' | 'radio' | 'upload';

/**
 * Returns a randomized message from the selected category, guaranteeing
 * that the previous message is never repeated immediately.
 */
export function getNextLoadingMessage(
  category: LoadingCategory = 'all',
  lastMessage?: string,
): string {
  let pool: readonly string[];

  switch (category) {
    case 'casual':
      pool = CASUAL_INDIAN_MESSAGES;
      break;
    case 'everyday':
      pool = EVERYDAY_INDIAN_MESSAGES;
      break;
    case 'radio':
      pool = RADIO_THEMED_MESSAGES;
      break;
    case 'upload':
      pool = [...UPLOAD_MESSAGES, ...ALL_LOADING_MESSAGES];
      break;
    case 'all':
    default:
      pool = ALL_LOADING_MESSAGES;
      break;
  }

  if (pool.length === 0) return 'Loading, please wait...';
  if (pool.length === 1) return pool[0];

  // Filter out the last message to avoid immediate repetition
  const candidates = lastMessage ? pool.filter((msg) => msg !== lastMessage) : pool;
  const choicePool = candidates.length > 0 ? candidates : pool;

  const randomIndex = Math.floor(Math.random() * choicePool.length);
  return choicePool[randomIndex];
}
