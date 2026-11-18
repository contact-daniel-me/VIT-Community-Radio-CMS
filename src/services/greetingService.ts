import type { UserRole } from '@/types/database';

export type GreetingPeriod =
  | 'MORNING'
  | 'AFTERNOON'
  | 'LUNCH'
  | 'AFTER_LUNCH'
  | 'EVENING'
  | 'NIGHT'
  | 'LATE_NIGHT';

export type ActivityEventType =
  | 'STUDIO_BOOKED'
  | 'RAW_AUDIO_UPLOADED'
  | 'FINAL_AUDIO_UPLOADED'
  | 'QC_APPROVED'
  | 'SHOW_SCHEDULED';

export interface ActivityEvent {
  type: ActivityEventType;
  userId: string;
  timestamp: number;
  showName?: string;
  reference?: string;
  details?: string;
}

export interface GreetingContext {
  userId: string;
  fullName?: string | null;
  role: UserRole;
  date?: Date;
  recentActivity?: ActivityEvent | null;
  isFirstTime?: boolean;
  isReturningUser?: boolean;
  hasMultipleActivitiesToday?: boolean;
  isMilestone?: boolean;
  milestoneDetail?: string;
  variationIndex?: number;
  mode?: 'AUTO' | 'ACTIVITY' | 'SPECIAL' | 'ROLE' | 'TIME';
}

export interface GreetingMessage {
  greeting: string;
  headline: string;
  message: string;
  tag: string;
  period: GreetingPeriod;
  category: 'ACTIVITY' | 'SPECIAL' | 'ROLE' | 'TIME' | 'GENERAL';
  activityType?: ActivityEventType;
  formattedTime: string;
  formattedTimeIst: string;
}

/**
 * Extracts the user's first name, handling honorary prefixes like "RJ " gracefully.
 * Never hardcodes any name.
 */
export function extractFirstName(fullName?: string | null): string {
  if (!fullName) return 'there';
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('rj ')) {
    const afterRj = trimmed.slice(3).trim().split(/\s+/)[0];
    if (afterRj) return afterRj;
  }

  const parts = trimmed.split(/\s+/);
  return parts[0] || 'there';
}

/**
 * Resolves hours, minutes, seconds and day of week in Asia/Kolkata timezone.
 */
export function getKolkataTimeParts(date: Date = new Date()): {
  hours: number;
  minutes: number;
  seconds: number;
  totalMinutes: number;
  formattedTime: string;
  formattedTimeIst: string;
} {
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const displayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  });

  const parts = timeFormatter.formatToParts(date);
  const get = (type: string) => {
    const val = parts.find((p) => p.type === type)?.value;
    return val ? parseInt(val, 10) : 0;
  };

  const rawHours = get('hour');
  const hours = rawHours === 24 ? 0 : rawHours;
  const minutes = get('minute');
  const seconds = get('second');
  const totalMinutes = hours * 60 + minutes;
  const rawDisplay = displayFormatter.format(date);

  return {
    hours,
    minutes,
    seconds,
    totalMinutes,
    formattedTime: rawDisplay.toLowerCase(),
    formattedTimeIst: `${rawDisplay} IST`,
  };
}

/**
 * Maps current Asia/Kolkata time to the exact greeting period.
 *
 * Exact boundaries (Asia/Kolkata):
 * - 05:00 AM - 11:59 AM: Morning (300 to 719 minutes)
 * - 12:00 PM - 12:29 PM: Afternoon (720 to 749 minutes)
 * - 12:30 PM - 02:30 PM: Lunch (750 to 870 minutes, inclusive)
 * - 02:31 PM - 03:59 PM: Afternoon / After Lunch (871 to 959 minutes)
 * - 04:00 PM - 07:59 PM: Evening (960 to 1199 minutes)
 * - 08:00 PM - 11:59 PM: Night (1200 to 1439 minutes)
 * - 12:00 AM - 04:59 AM: Late Night (0 to 299 minutes)
 */
export function getGreetingPeriod(date: Date = new Date()): GreetingPeriod {
  const { totalMinutes } = getKolkataTimeParts(date);

  if (totalMinutes >= 300 && totalMinutes <= 719) {
    return 'MORNING';
  }
  if (totalMinutes >= 720 && totalMinutes <= 749) {
    return 'AFTERNOON';
  }
  if (totalMinutes >= 750 && totalMinutes <= 870) {
    return 'LUNCH';
  }
  if (totalMinutes >= 871 && totalMinutes <= 959) {
    return 'AFTER_LUNCH';
  }
  if (totalMinutes >= 960 && totalMinutes <= 1199) {
    return 'EVENING';
  }
  if (totalMinutes >= 1200 && totalMinutes <= 1439) {
    return 'NIGHT';
  }
  return 'LATE_NIGHT'; // 0 to 299 minutes (12:00 AM to 4:59 AM)
}

/**
 * Returns human-readable label for a greeting period.
 */
export function getPeriodLabel(period: GreetingPeriod): string {
  switch (period) {
    case 'MORNING':
      return 'Morning welcome';
    case 'AFTERNOON':
      return 'Afternoon check-in';
    case 'LUNCH':
      return 'Lunchtime check-in';
    case 'AFTER_LUNCH':
      return 'Post-lunch check-in';
    case 'EVENING':
      return 'Evening wrap-up';
    case 'NIGHT':
      return 'Night check-in';
    case 'LATE_NIGHT':
      return 'Late night reminder';
  }
}

/**
 * Headline greeting for the top-level H1.
 */
export function getHeadlineGreeting(period: GreetingPeriod, firstName: string): string {
  switch (period) {
    case 'MORNING':
      return `Good morning, ${firstName}`;
    case 'AFTERNOON':
      return `Good afternoon, ${firstName}`;
    case 'LUNCH':
      return `Lunch break, ${firstName}`;
    case 'AFTER_LUNCH':
      return `Welcome back, ${firstName}`;
    case 'EVENING':
      return `Good evening, ${firstName}`;
    case 'NIGHT':
      return `Good night, ${firstName}`;
    case 'LATE_NIGHT':
      return `Working late, ${firstName}`;
  }
}

// ---------------------------------------------------------------------------
// MESSAGE TEMPLATES (Zero emojis, zero decorative symbols, clean punctuation)
// ---------------------------------------------------------------------------

const TIME_MESSAGES: Record<GreetingPeriod, string[]> = {
  MORNING: [
    "Good morning, {{name}}! A fresh day, a fresh start! Hope you woke up feeling good. Let's make today a beautiful one. And remember, don't forget to smile!",
    "Morning, {{name}}! It is always wonderful to have your energy on the team. Grab your favorite drink, take a deep breath, and let's get into it.",
    "Hey {{name}}, good morning! Ready to bring great radio to life today? Take it one step at a time, you have got this.",
    "Good morning, {{name}}! Hope your day is off to a peaceful start. The station is brighter with you here.",
  ],
  AFTERNOON: [
    "Hey {{name}}, how's your day going? Hope everything is going smoothly. Keep going, you're doing great!",
    "Good afternoon, {{name}}! Half the day is behind us, and you have accomplished so much. Keep up the great pace!",
    "Hey {{name}}, checking in on you this afternoon. Hope your morning went well and your afternoon is just as productive.",
    "Afternoon, {{name}}! Hope you are having a pleasant day. Keep your head high and your spirits higher.",
  ],
  LUNCH: [
    "Good afternoon, {{name}}! It's lunchtime. Take a little break, grab something delicious, and recharge. I'll be here when you're back!",
    "Hey {{name}}, it's lunch time! Enough work for a moment. Go grab something delicious, relax, and enjoy your break. Work can wait a little. Take care of yourself!",
    "Time for a well-deserved lunch break, {{name}}! Step away from the screen, enjoy a good meal, and recharge. The station will be right here when you return.",
    "Lunchtime check-in, {{name}}! Make sure you step away and eat something nourishing. You have worked hard, and you deserve a peaceful break.",
  ],
  AFTER_LUNCH: [
    "Welcome back, {{name}}! Hope you had a nice lunch. Feeling refreshed? Let's finish the day with the same energy!",
    "Hey {{name}}, hope your lunch gave you a nice boost. Let's keep the momentum going for the rest of the afternoon.",
    "Afternoon check-in, {{name}}! If the post-lunch sluggishness is creeping in, grab some water, take a stretch, and power through. You are doing fantastic.",
    "Hey {{name}}, hope you feel rejuvenated after your meal. We are in the home stretch of the day now!",
  ],
  EVENING: [
    "Hey {{name}}, good evening! Take a moment to look back at what you've accomplished. Even the little things count. Proud to have you on the team!",
    "Good evening, {{name}}! The day is winding down. Thank you for putting your heart into today's broadcast work.",
    "Evening, {{name}}! We hope your day felt meaningful. Remember to pace yourself as you wrap up today's tasks.",
    "Hey {{name}}, sunset is here. Take a breath and appreciate the effort you put in today. You made a real difference.",
  ],
  NIGHT: [
    "Still here, {{name}}? Thank you for giving your time and effort today. Don't forget that you deserve some rest too. Have a peaceful night!",
    "Hey {{name}}, good night! Wrapping up late? Your hard work is truly appreciated, but don't forget to unwind and get good rest.",
    "Thank you for being here tonight, {{name}}. Community radio thrives because of people like you. Finish up safely and sleep well.",
    "Hey {{name}}, late hours at the station! Please make sure you wrap up soon and give yourself the rest you have earned today.",
  ],
  LATE_NIGHT: [
    "Hey {{name}}, it's quite late! Your dedication means a lot, but your health and rest matter too. If you're finishing up, please get some good sleep. Good night!",
    "Burning the midnight oil, {{name}}? Your dedication is inspiring, but remember that rest is essential. Please take care of yourself and get some sleep soon.",
    "It is the quiet hours, {{name}}. Thank you for your care, but your well-being comes first. Wrap up gently and get some rest.",
    "Hey {{name}}, working into the early hours? You are doing amazing work, but your sleep is precious. Please rest when you can.",
  ],
};

const ACTIVITY_MESSAGES: Record<ActivityEventType, { templates: string[]; tag: string }> = {
  STUDIO_BOOKED: {
    templates: [
      "All set, {{name}}! Your studio is booked. Looking forward to hearing something wonderful!",
      "Your studio session is confirmed, {{name}}! Have fun in the studio and create something great.",
      "Studio reserved, {{name}}! Make the most of your recording time today.",
    ],
    tag: 'Studio session booked',
  },
  RAW_AUDIO_UPLOADED: {
    templates: [
      "Got it, {{name}}! Your recording is safely uploaded. One step closer!",
      "Audio received, {{name}}! Your raw take is safe with us and ready for the next step.",
      "Great job getting the audio in, {{name}}! Another recording successfully banked.",
    ],
    tag: 'Raw audio uploaded',
  },
  FINAL_AUDIO_UPLOADED: {
    templates: [
      "That's wonderful, {{name}}! Your final audio is in. Great work!",
      "Master recording in place, {{name}}! The final cut is ready to sound incredible on 90.8 FM.",
      "Brilliant work, {{name}}! The final audio has been locked in and is set to impress.",
    ],
    tag: 'Final broadcast audio ready',
  },
  QC_APPROVED: {
    templates: [
      "Nicely done, {{name}}! Another show is ready to move forward. Your attention to quality makes a difference!",
      "QC check completed, {{name}}! Thank you for maintaining our broadcast standards with such care.",
      "Show approved, {{name}}! Your sharp ears keep VIT Community Radio sounding its very best.",
    ],
    tag: 'Quality review approved',
  },
  SHOW_SCHEDULED: {
    templates: [
      "It's on the schedule, {{name}}! Another show is getting ready to reach our listeners.",
      "Broadcast slot secured, {{name}}! Everything is lined up for the community to tune in.",
      "Nicely planned, {{name}}! The schedule is updated and listeners have something great to look forward to.",
    ],
    tag: 'Broadcast scheduled',
  },
};

const ROLE_MESSAGES: Record<string, { templates: string[]; tag: string }> = {
  RJ: {
    templates: [
      "Hey {{name}}! Hope you are getting your voice and notes ready. The station sounds better with you on the air!",
      "Welcome back, {{name}}! Ready to bring great stories, music, and voice to VIT Vellore today?",
      "Hey {{name}}, your voice and passion bring life to 90.8 FM. Excited to hear what you are creating next!",
    ],
    tag: 'RJ Desk',
  },
  QC: {
    templates: [
      "Hey {{name}}! Thank you for keeping our broadcast sound clean, balanced, and professional every single day.",
      "Welcome, {{name}}! Your attention to audio detail and quality standards makes all the difference for our listeners.",
      "Hey {{name}}, quality is the heart of good radio. Thank you for keeping our standards high!",
    ],
    tag: 'Quality Control Desk',
  },
  PRODUCER: {
    templates: [
      "Hey {{name}}! Great radio happens because of solid planning and coordination. Thank you for keeping everything on track!",
      "Welcome back, {{name}}! Producing great community content takes vision and patience. We are lucky to have you steering the ship.",
      "Hey {{name}}, your organization keeps our shows moving smoothly from idea to broadcast. Keep up the stellar work!",
    ],
    tag: 'Production Desk',
  },
  ADMIN: {
    templates: [
      "Hey {{name}}! Running the station behind the scenes takes a lot of care. Thank you for keeping the platform humming along smoothly.",
      "Welcome, {{name}}! Your operational support and leadership keep the whole VIT Community Radio team empowered.",
      "Hey {{name}}, keeping the CMS, schedules, and team synchronized is a big job. Thank you for your steady hand!",
    ],
    tag: 'Station Operations',
  },
  EDITOR: {
    templates: [
      "Hey {{name}}! Thank you for shaping our stories and keeping our broadcast audio crisp and engaging.",
      "Welcome, {{name}}! Your editing touch brings out the best in every recording.",
    ],
    tag: 'Editorial Desk',
  },
  SECTION_HEAD: {
    templates: [
      "Hey {{name}}! Thank you for leading your section with dedication and care for community radio.",
      "Welcome, {{name}}! Your leadership keeps our programming rich and consistent.",
    ],
    tag: 'Section Leadership',
  },
};

const SPECIAL_MESSAGES = {
  FIRST_TIME: {
    templates: [
      "Welcome to the team, {{name}}! We are thrilled to have you here at VIT Community Radio. Take a look around and make yourself at home.",
      "Hey {{name}}, welcome aboard! This is your creative home for community broadcasting. Let's make something memorable together.",
    ],
    tag: 'Welcome to the team',
  },
  RETURNING_USER: {
    templates: [
      "Welcome back, {{name}}! It has been a little while. So glad to see you back with the team!",
      "Hey {{name}}, wonderful to see you again! We missed your presence around the station. Hope you are doing well.",
    ],
    tag: 'Welcome back',
  },
  MULTIPLE_ACTIVITIES: {
    templates: [
      "Look at you go today, {{name}}! You have made so much progress across your broadcasts today. Your dedication really shines through!",
      "What a productive day, {{name}}! You are checking off tasks like a pro. Keep that wonderful rhythm going!",
    ],
    tag: 'Productive day',
  },
  MILESTONE: {
    templates: [
      "Congratulations, {{name}}! You have reached a notable milestone with your contributions. Thank you for making VIT Community Radio special!",
      "Milestone achieved, {{name}}! Every broadcast and recording builds our station's legacy. Thank you for your continuous dedication!",
    ],
    tag: 'Station milestone',
  },
};

function formatTemplate(template: string, firstName: string): string {
  return template.replace(/\{\{name\}\}/g, firstName);
}

// ---------------------------------------------------------------------------
// GREETING SELECTORS
// ---------------------------------------------------------------------------

export function getTimeBasedGreeting(
  period: GreetingPeriod,
  firstName: string,
  variationIndex = 0,
  formattedTime = '',
  formattedTimeIst = '',
): GreetingMessage {
  const list = TIME_MESSAGES[period];
  const idx = Math.abs(variationIndex) % list.length;
  const message = formatTemplate(list[idx], firstName);
  const tag = getPeriodLabel(period);
  const headline = getHeadlineGreeting(period, firstName);

  return {
    greeting: headline,
    headline,
    message,
    tag,
    period,
    category: 'TIME',
    formattedTime,
    formattedTimeIst,
  };
}

export function getActivityGreeting(
  activity: ActivityEvent,
  firstName: string,
  variationIndex = 0,
  period: GreetingPeriod = 'MORNING',
  formattedTime = '',
  formattedTimeIst = '',
): GreetingMessage {
  const item = ACTIVITY_MESSAGES[activity.type];
  const templates = item ? item.templates : ACTIVITY_MESSAGES.STUDIO_BOOKED.templates;
  const idx = Math.abs(variationIndex) % templates.length;
  const message = formatTemplate(templates[idx], firstName);
  const headline = `Appreciating your work, ${firstName}`;

  return {
    greeting: headline,
    headline,
    message,
    tag: item ? item.tag : 'Recent activity',
    period,
    category: 'ACTIVITY',
    activityType: activity.type,
    formattedTime,
    formattedTimeIst,
  };
}

export function getRoleGreeting(
  role: UserRole,
  firstName: string,
  variationIndex = 0,
  period: GreetingPeriod = 'MORNING',
  formattedTime = '',
  formattedTimeIst = '',
): GreetingMessage {
  const roleKey = role.toUpperCase();
  const item = ROLE_MESSAGES[roleKey] || ROLE_MESSAGES.RJ;
  const idx = Math.abs(variationIndex) % item.templates.length;
  const message = formatTemplate(item.templates[idx], firstName);
  const headline = getHeadlineGreeting(period, firstName);

  return {
    greeting: headline,
    headline,
    message,
    tag: item.tag,
    period,
    category: 'ROLE',
    formattedTime,
    formattedTimeIst,
  };
}

export function getSpecialRecognitionGreeting(
  type: 'FIRST_TIME' | 'RETURNING_USER' | 'MULTIPLE_ACTIVITIES' | 'MILESTONE',
  firstName: string,
  variationIndex = 0,
  period: GreetingPeriod = 'MORNING',
  formattedTime = '',
  formattedTimeIst = '',
): GreetingMessage {
  const item = SPECIAL_MESSAGES[type];
  const idx = Math.abs(variationIndex) % item.templates.length;
  const message = formatTemplate(item.templates[idx], firstName);
  const headline = getHeadlineGreeting(period, firstName);

  return {
    greeting: headline,
    headline,
    message,
    tag: item.tag,
    period,
    category: 'SPECIAL',
    formattedTime,
    formattedTimeIst,
  };
}

/**
 * Main Priority-Based Greeting Selector:
 *
 * 1. Recent successful activity appreciation (if within valid active window)
 * 2. First-time or returning-user recognition
 * 3. Role-specific greeting
 * 4. Time-based greeting
 * 5. General friendly greeting
 */
export function selectGreeting(context: GreetingContext): GreetingMessage {
  const date = context.date || new Date();
  const period = getGreetingPeriod(date);
  const { formattedTime, formattedTimeIst } = getKolkataTimeParts(date);
  const firstName = extractFirstName(context.fullName);
  const variationIndex = context.variationIndex ?? 0;

  // Mode overrides for testing / specific tabs
  if (context.mode === 'ACTIVITY' && context.recentActivity) {
    return getActivityGreeting(context.recentActivity, firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }
  if (context.mode === 'ROLE') {
    return getRoleGreeting(context.role, firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }
  if (context.mode === 'TIME') {
    return getTimeBasedGreeting(period, firstName, variationIndex, formattedTime, formattedTimeIst);
  }
  if (context.mode === 'SPECIAL') {
    if (context.isFirstTime) return getSpecialRecognitionGreeting('FIRST_TIME', firstName, variationIndex, period, formattedTime, formattedTimeIst);
    if (context.isReturningUser) return getSpecialRecognitionGreeting('RETURNING_USER', firstName, variationIndex, period, formattedTime, formattedTimeIst);
    if (context.isMilestone) return getSpecialRecognitionGreeting('MILESTONE', firstName, variationIndex, period, formattedTime, formattedTimeIst);
    if (context.hasMultipleActivitiesToday) return getSpecialRecognitionGreeting('MULTIPLE_ACTIVITIES', firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }

  // 1. Recent successful activity appreciation
  if (context.recentActivity && context.recentActivity.userId === context.userId) {
    return getActivityGreeting(context.recentActivity, firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }

  // 2. First-time or returning-user recognition
  if (context.isFirstTime) {
    return getSpecialRecognitionGreeting('FIRST_TIME', firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }
  if (context.isReturningUser) {
    return getSpecialRecognitionGreeting('RETURNING_USER', firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }
  if (context.isMilestone) {
    return getSpecialRecognitionGreeting('MILESTONE', firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }
  if (context.hasMultipleActivitiesToday) {
    return getSpecialRecognitionGreeting('MULTIPLE_ACTIVITIES', firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }

  // 3. Role-specific greeting or 4. Time-based greeting
  // During vital caring periods (LUNCH and LATE_NIGHT), time check-in takes caring precedence.
  // During normal working hours, alternate or select role greeting if variationIndex is odd.
  if (period === 'LUNCH' || period === 'LATE_NIGHT') {
    return getTimeBasedGreeting(period, firstName, variationIndex, formattedTime, formattedTimeIst);
  }

  // Check if role greeting is preferred by priority or variation
  if (context.mode === 'AUTO' && variationIndex % 2 === 1) {
    return getRoleGreeting(context.role, firstName, variationIndex, period, formattedTime, formattedTimeIst);
  }

  // 4. Time-based greeting
  return getTimeBasedGreeting(period, firstName, variationIndex, formattedTime, formattedTimeIst);
}
