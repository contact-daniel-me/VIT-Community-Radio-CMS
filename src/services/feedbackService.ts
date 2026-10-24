import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type {
  FeedbackType,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackSubmissionRow,
  FeedbackWithUser,
} from '@/types/database';

export interface FeedbackInput {
  feedback_type: FeedbackType;
  category: FeedbackCategory;
  subject: string;
  message: string;
  rating?: number | null;
}

export interface FeedbackAdminFilter {
  type?: 'ALL' | FeedbackType;
  status?: 'ALL' | FeedbackStatus;
  category?: 'ALL' | FeedbackCategory;
  search?: string;
  sort?: 'newest' | 'oldest' | 'rating-high' | 'rating-low';
}

export interface FeedbackStats {
  total: number;
  needsReview: number;
  ideas: number;
  issues: number;
  resolved: number;
  identified: number;
  anonymous: number;
  averageRating: number | null;
  categoryDistribution: Record<FeedbackCategory, number>;
  statusDistribution: Record<FeedbackStatus, number>;
  recentTrend: { date: string; count: number }[];
}

const LOCAL_STORAGE_KEY = 'vcr_fallback_feedback_submissions';

function isMissingTableError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'PGRST205' || err.code === '42P01') return true;
    if (err.message && /could not find the table .*feedback/i.test(err.message)) return true;
  }
  return false;
}

function getLocalSubmissions(): FeedbackWithUser[] {
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (!storage) return [];
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSubmissions(items: FeedbackWithUser[]): void {
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (storage) {
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore
  }
}

function generateLocalReference(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FB-${year}-${rand}`;
}

export const feedbackService = {
  /**
   * Submit new feedback.
   * If feedback_type is 'ANONYMOUS', user_id is strictly NOT stored.
   * If feedback_type is 'IDENTIFIED', user_id is the active user's id.
   */
  async submitFeedback(input: FeedbackInput): Promise<FeedbackSubmissionRow> {
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData?.user;

    const subject = input.subject.trim();
    const message = input.message.trim();

    if (subject.length < 3) {
      throw new AppError('VALIDATION', 'Subject must be at least 3 characters.');
    }
    if (message.length < 10) {
      throw new AppError('VALIDATION', 'Feedback message must be at least 10 characters.');
    }

    const isAnonymous = input.feedback_type === 'ANONYMOUS';
    const userId = isAnonymous ? null : currentUser?.id ?? null;

    if (!isAnonymous && !userId) {
      throw new AppError('AUTH', 'You must be signed in to submit identified feedback.');
    }

    const payload: {
      feedback_type: FeedbackType;
      user_id: string | null;
      category: FeedbackCategory;
      subject: string;
      message: string;
      rating: number | null;
    } = {
      feedback_type: input.feedback_type,
      user_id: userId,
      category: input.category,
      subject,
      message,
      rating: input.rating && input.rating >= 1 && input.rating <= 5 ? input.rating : null,
    };

    try {
      const row = await unwrap(
        supabase
          .from('feedback_submissions')
          .insert(payload)
          .select('*')
          .single<FeedbackSubmissionRow>(),
      );
      return row;
    } catch (err) {
      if (isMissingTableError(err)) {
        let submitter = null;
        if (!isAnonymous && userId) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', userId)
            .maybeSingle();
          submitter = prof ?? null;
        }

        const localId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fb-${Date.now()}`;
        const newRow: FeedbackWithUser = {
          id: localId,
          reference: generateLocalReference(),
          feedback_type: input.feedback_type,
          user_id: userId,
          category: input.category,
          subject,
          message,
          rating: payload.rating,
          status: 'NEW',
          admin_response: null,
          admin_notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          resolved_at: null,
          resolved_by: null,
          submitter,
        };

        const local = getLocalSubmissions();
        local.unshift(newRow);
        saveLocalSubmissions(local);
        return newRow;
      }
      throw toAppError(err);
    }
  },

  /**
   * Fetch identified feedback submitted by the current authenticated user.
   * Anonymous submissions are never returned or associated with the user profile.
   */
  async getMyFeedback(): Promise<FeedbackSubmissionRow[]> {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return [];

    try {
      // Use the dedicated secure view or direct table filter
      const rows = await unwrap(
        supabase
          .from('feedback_submissions')
          .select('id, reference, feedback_type, category, subject, message, rating, status, admin_response, created_at, updated_at, resolved_at')
          .eq('user_id', userId)
          .eq('feedback_type', 'IDENTIFIED')
          .order('created_at', { ascending: false })
          .returns<FeedbackSubmissionRow[]>(),
      );
      return rows;
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalSubmissions();
        return local.filter((item) => item.user_id === userId && item.feedback_type === 'IDENTIFIED');
      }
      throw toAppError(err);
    }
  },

  /**
   * Fetch all feedback for administrators, supporting filters and joins on profiles.
   * For anonymous feedback, submitter profile is always null.
   */
  async getAllFeedback(filter: FeedbackAdminFilter = {}): Promise<FeedbackWithUser[]> {
    try {
      let query = supabase
        .from('feedback_submissions')
        .select(`
          *,
          submitter:profiles!feedback_submissions_user_id_fkey (id, full_name, email, role)
        `);

      if (filter.type && filter.type !== 'ALL') {
        query = query.eq('feedback_type', filter.type);
      }
      if (filter.status && filter.status !== 'ALL') {
        query = query.eq('status', filter.status);
      }
      if (filter.category && filter.category !== 'ALL') {
        query = query.eq('category', filter.category);
      }

      if (filter.sort === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (filter.sort === 'rating-high') {
        query = query.order('rating', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      } else if (filter.sort === 'rating-low') {
        query = query.order('rating', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const rows = await unwrap(query.returns<FeedbackWithUser[]>());

      // If search filter provided, filter client-side for subject, message, reference, and submitter name
      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        return rows.filter((row) => {
          return (
            row.reference.toLowerCase().includes(q) ||
            row.subject.toLowerCase().includes(q) ||
            row.message.toLowerCase().includes(q) ||
            row.category.toLowerCase().includes(q) ||
            (row.submitter?.full_name?.toLowerCase().includes(q) ?? false) ||
            (row.submitter?.email?.toLowerCase().includes(q) ?? false)
          );
        });
      }

      return rows;
    } catch (err) {
      if (isMissingTableError(err)) {
        let list = getLocalSubmissions();
        if (filter.type && filter.type !== 'ALL') {
          list = list.filter((r) => r.feedback_type === filter.type);
        }
        if (filter.status && filter.status !== 'ALL') {
          list = list.filter((r) => r.status === filter.status);
        }
        if (filter.category && filter.category !== 'ALL') {
          list = list.filter((r) => r.category === filter.category);
        }
        if (filter.search && filter.search.trim()) {
          const q = filter.search.trim().toLowerCase();
          list = list.filter(
            (r) =>
              r.reference.toLowerCase().includes(q) ||
              r.subject.toLowerCase().includes(q) ||
              r.message.toLowerCase().includes(q) ||
              (r.submitter?.full_name?.toLowerCase().includes(q) ?? false),
          );
        }
        if (filter.sort === 'oldest') {
          list.sort((a, b) => a.created_at.localeCompare(b.created_at));
        } else if (filter.sort === 'rating-high') {
          list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        } else if (filter.sort === 'rating-low') {
          list.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99));
        } else {
          list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
        return list;
      }
      throw toAppError(err);
    }
  },

  /**
   * Compute comprehensive feedback stats & distribution analytics.
   */
  async getFeedbackStats(): Promise<FeedbackStats> {
    const list = await this.getAllFeedback();

    const categoryDistribution: Record<FeedbackCategory, number> = {
      IDEA: 0,
      BUG: 0,
      STUDIO: 0,
      BOOKING: 0,
      TECHNICAL: 0,
      APPRECIATION: 0,
      OTHER: 0,
    };

    const statusDistribution: Record<FeedbackStatus, number> = {
      NEW: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      ARCHIVED: 0,
    };

    let totalRating = 0;
    let ratingCount = 0;
    let identified = 0;
    let anonymous = 0;

    const dateMap = new Map<string, number>();

    // Prepopulate last 7 days for trend
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      dateMap.set(iso, 0);
    }

    for (const item of list) {
      if (categoryDistribution[item.category] !== undefined) {
        categoryDistribution[item.category]++;
      }
      if (statusDistribution[item.status] !== undefined) {
        statusDistribution[item.status]++;
      }
      if (item.feedback_type === 'IDENTIFIED') identified++;
      else anonymous++;

      if (typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5) {
        totalRating += item.rating;
        ratingCount++;
      }

      const itemDate = item.created_at.slice(0, 10);
      if (dateMap.has(itemDate)) {
        dateMap.set(itemDate, (dateMap.get(itemDate) ?? 0) + 1);
      }
    }

    const recentTrend = Array.from(dateMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      total: list.length,
      needsReview: statusDistribution.NEW,
      ideas: categoryDistribution.IDEA,
      issues: categoryDistribution.BUG + categoryDistribution.TECHNICAL,
      resolved: statusDistribution.RESOLVED,
      identified,
      anonymous,
      averageRating: ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : null,
      categoryDistribution,
      statusDistribution,
      recentTrend,
    };
  },

  /**
   * Update feedback status and optional public admin response.
   */
  async updateStatus(
    id: string,
    status: FeedbackStatus,
    adminResponse?: string | null,
  ): Promise<FeedbackSubmissionRow> {
    const { data: authData } = await supabase.auth.getUser();
    const adminId = authData?.user?.id;

    const patch: Partial<FeedbackSubmissionRow> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (adminResponse !== undefined) {
      patch.admin_response = adminResponse ? adminResponse.trim() : null;
    }

    if (status === 'RESOLVED') {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = adminId ?? null;
    } else if (status === 'NEW' || status === 'IN_REVIEW') {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }

    try {
      const updated = await unwrap(
        supabase
          .from('feedback_submissions')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single<FeedbackSubmissionRow>(),
      );
      return updated;
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalSubmissions();
        const idx = local.findIndex((item) => item.id === id);
        if (idx === -1) throw new AppError('NOT_FOUND', 'Feedback item not found.');
        const updated = {
          ...local[idx],
          ...patch,
        };
        local[idx] = updated;
        saveLocalSubmissions(local);
        return updated;
      }
      throw toAppError(err);
    }
  },

  /**
   * Update internal admin note (never visible to submitters).
   */
  async updateAdminNotes(feedbackId: string, notes: string): Promise<void> {
    const trimmed = notes.trim();
    try {
      await unwrap(
        supabase
          .from('feedback_submissions')
          .update({
            admin_notes: trimmed || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', feedbackId),
      );
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalSubmissions();
        const idx = local.findIndex((item) => item.id === feedbackId);
        if (idx !== -1) {
          local[idx].admin_notes = trimmed || null;
          saveLocalSubmissions(local);
        }
        return;
      }
      throw toAppError(err);
    }
  },

  /**
   * Delete feedback item (Admin only).
   */
  async deleteFeedback(id: string): Promise<void> {
    try {
      await unwrap(supabase.from('feedback_submissions').delete().eq('id', id));
    } catch (err) {
      if (isMissingTableError(err)) {
        const local = getLocalSubmissions();
        saveLocalSubmissions(local.filter((item) => item.id !== id));
        return;
      }
      throw toAppError(err);
    }
  },
};
