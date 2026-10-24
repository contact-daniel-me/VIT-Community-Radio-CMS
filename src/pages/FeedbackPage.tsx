import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { PageHeader, Banner, Loading, Empty } from '@/components/ui';
import { can } from '@/lib/permissions';
import { feedbackService } from '@/services/feedbackService';
import {
  UserIcon,
  ShieldCheckIcon,
  StarIcon,
  RadioSoundWaveIcon,
  CheckCircleIcon,
  CheckIcon,
  CATEGORY_ICON_MAP,
  CATEGORY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/components/feedback/FeedbackIcons';
import type {
  FeedbackType,
  FeedbackCategory,
  FeedbackSubmissionRow,
} from '@/types/database';

const CATEGORIES: FeedbackCategory[] = [
  'IDEA',
  'BUG',
  'STUDIO',
  'BOOKING',
  'TECHNICAL',
  'APPRECIATION',
  'OTHER',
];

const RATING_DESCRIPTIONS: Record<number, string> = {
  1: 'Needs major improvement',
  2: 'Fair experience',
  3: 'Good experience',
  4: 'Very good experience',
  5: 'Outstanding experience',
};

export function FeedbackPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'submit' | 'history'>('submit');
  const [mode, setMode] = useState<FeedbackType | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>('IDEA');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<FeedbackSubmissionRow | null>(null);

  // Load identified submissions for "My Submissions"
  const myFeedback = useAsync(() => feedbackService.getMyFeedback(), [activeTab, submittedData]);

  const resetForm = () => {
    setMode(null);
    setCategory('IDEA');
    setSubject('');
    setMessage('');
    setRating(null);
    setHoverRating(null);
    setError(null);
    setSubmittedData(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) {
      setError('Please select whether you wish to submit identified or anonymous feedback.');
      return;
    }
    if (!subject.trim()) {
      setError('Please provide a subject line for your feedback.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Please provide at least 10 characters describing your idea or feedback.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await feedbackService.submitFeedback({
        feedback_type: mode,
        category,
        subject: subject.trim(),
        message: message.trim(),
        rating,
      });
      setSubmittedData(res);
      await myFeedback.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = profile ? can.manageFeedback(profile.role) : false;

  return (
    <>
      <PageHeader
        title="Feedback & Ideas"
        description="Share your ideas, suggestions, and feedback to help build a better community radio."
        actions={
          isAdmin ? (
            <Link to="/admin/feedback" className="btn btn-outline small">
              Feedback Management
            </Link>
          ) : undefined
        }
      />

      <Banner>{error}</Banner>

      {/* Hero Atmosphere Section */}
      <div className="fb-hero-card">
        <div className="fb-hero-content">
          <div className="fb-hero-badge">
            <RadioSoundWaveIcon size={18} />
            <span>VIT Community Radio &middot; 90.8 FM</span>
          </div>
          <h1 className="fb-hero-title">Your Voice. Our Radio. Better Together.</h1>
          <p className="fb-hero-subtitle">
            Have an idea, spotted a problem, or want to make our radio community better? We're listening.
          </p>
        </div>
        <RadioSoundWaveIcon size={240} className="fb-hero-soundwave" aria-hidden="true" />
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-nav-wrap" style={{ marginBottom: '1.5rem' }}>
        <div className="tabs" role="tablist" aria-label="Feedback views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submit'}
            className={`tab ${activeTab === 'submit' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('submit');
              setError(null);
            }}
          >
            Submit Feedback & Ideas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`tab ${activeTab === 'history' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              setError(null);
            }}
          >
            My Submissions
            <span className="tab-count">{myFeedback.data?.length ?? 0}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SUBMIT FEEDBACK */}
      {activeTab === 'submit' && (
        <>
          {submittedData ? (
            /* Section 4: Submission Success Screen */
            <div className="fb-success-card" role="region" aria-label="Submission Confirmation">
              <div className="fb-success-icon-wrap" aria-hidden="true">
                <CheckCircleIcon size={34} />
              </div>
              <h2 className="fb-success-title">Thank You for Your Feedback</h2>
              <p className="fb-success-subtitle">
                Your feedback helps us improve the VIT Community Radio experience.
              </p>

              <div className="fb-success-details">
                <div className="fb-success-row">
                  <span className="fb-success-label">Reference ID</span>
                  <span className="fb-success-val font-mono">{submittedData.reference}</span>
                </div>
                <div className="fb-success-row">
                  <span className="fb-success-label">Submission Date</span>
                  <span className="fb-success-val">
                    {new Date(submittedData.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="fb-success-row">
                  <span className="fb-success-label">Feedback Type</span>
                  <span className="fb-success-val">
                    <span
                      className={`badge ${
                        submittedData.feedback_type === 'ANONYMOUS' ? 'badge-blue' : 'badge-green'
                      }`}
                    >
                      {TYPE_LABELS[submittedData.feedback_type]}
                    </span>
                  </span>
                </div>
                <div className="fb-success-row">
                  <span className="fb-success-label">Category</span>
                  <span className="fb-success-val">{CATEGORY_LABELS[submittedData.category]}</span>
                </div>
                {submittedData.rating && (
                  <div className="fb-success-row">
                    <span className="fb-success-label">Rating</span>
                    <span className="fb-success-val" style={{ color: '#f59e0b', display: 'flex', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon key={star} size={14} filled={star <= (submittedData.rating ?? 0)} />
                      ))}
                    </span>
                  </div>
                )}
              </div>

              <div className="fb-success-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => navigate('/dashboard')}
                >
                  Return to Dashboard
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={resetForm}
                >
                  Submit Another Feedback
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Section 2: Feedback Mode Selection */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem', color: 'var(--ink-strong)' }}>
                  Step 1: Choose Your Submission Mode
                </h2>
                <p className="small muted" style={{ margin: 0 }}>
                  Select how you would like your feedback recorded before composing.
                </p>
              </div>

              <div className="fb-mode-grid" role="radiogroup" aria-label="Feedback submission mode">
                {/* Option A: Identified Feedback */}
                <div
                  role="radio"
                  aria-checked={mode === 'IDENTIFIED'}
                  tabIndex={0}
                  className={`fb-mode-card ${mode === 'IDENTIFIED' ? 'is-selected' : ''}`}
                  onClick={() => setMode('IDENTIFIED')}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setMode('IDENTIFIED');
                    }
                  }}
                >
                  <div className="fb-mode-header">
                    <div className="fb-mode-icon-wrap" aria-hidden="true">
                      <UserIcon size={22} />
                    </div>
                    <div className="fb-mode-indicator">
                      {mode === 'IDENTIFIED' && <CheckIcon size={14} />}
                    </div>
                  </div>
                  <span className="fb-mode-tag">Identified Feedback</span>
                  <h3 className="fb-mode-title">Share with My Name</h3>
                  <p className="fb-mode-desc">
                    Share your thoughts openly. Authorized administrators can see who submitted your feedback.
                  </p>
                </div>

                {/* Option B: Anonymous Feedback */}
                <div
                  role="radio"
                  aria-checked={mode === 'ANONYMOUS'}
                  tabIndex={0}
                  className={`fb-mode-card ${mode === 'ANONYMOUS' ? 'is-selected' : ''}`}
                  onClick={() => setMode('ANONYMOUS')}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setMode('ANONYMOUS');
                    }
                  }}
                >
                  <div className="fb-mode-header">
                    <div className="fb-mode-icon-wrap" aria-hidden="true">
                      <ShieldCheckIcon size={22} />
                    </div>
                    <div className="fb-mode-indicator">
                      {mode === 'ANONYMOUS' && <CheckIcon size={14} />}
                    </div>
                  </div>
                  <span className="fb-mode-tag">Anonymous Feedback</span>
                  <h3 className="fb-mode-title">Speak Freely</h3>
                  <p className="fb-mode-desc">
                    Share your honest thoughts without displaying your identity to administrators.
                  </p>
                </div>
              </div>

              {/* Section 3: Feedback Composer */}
              {mode ? (
                <form onSubmit={handleSubmit} className="fb-composer-card" noValidate>
                  {/* Category Selection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <div className="fb-step-title">
                      <span className="fb-step-num">2</span>
                      <span>Select a Category</span>
                    </div>

                    <div className="fb-category-grid" role="radiogroup" aria-label="Feedback category">
                      {CATEGORIES.map((catKey) => {
                        const Icon = CATEGORY_ICON_MAP[catKey];
                        const isSelected = category === catKey;
                        return (
                          <div
                            key={catKey}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            className={`fb-category-card ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setCategory(catKey)}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                setCategory(catKey);
                              }
                            }}
                          >
                            <div className="fb-category-icon" aria-hidden="true">
                              <Icon size={22} />
                            </div>
                            <span className="fb-category-name">{CATEGORY_LABELS[catKey]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feedback Details */}
                  <div style={{ marginBottom: '2rem' }}>
                    <div className="fb-step-title">
                      <span className="fb-step-num">3</span>
                      <span>Write Your Feedback</span>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <div className="row spread" style={{ marginBottom: '0.4rem' }}>
                        <label htmlFor="fb-subject" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          Subject <span style={{ color: 'var(--accent)' }}>*</span>
                        </label>
                        <span className="small muted">{subject.length} / 120</span>
                      </div>
                      <input
                        id="fb-subject"
                        type="text"
                        maxLength={120}
                        placeholder="Brief summary of your idea, request, or issue..."
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <div className="row spread" style={{ marginBottom: '0.4rem' }}>
                        <label htmlFor="fb-message" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          Detailed Feedback <span style={{ color: 'var(--accent)' }}>*</span>
                        </label>
                        <span className="small muted">{message.length} / 2000</span>
                      </div>
                      <textarea
                        id="fb-message"
                        rows={6}
                        maxLength={2000}
                        placeholder="Provide details, specific observations, or suggestions on how to improve..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </div>

                    {/* Optional 1 to 5 Star Rating */}
                    <div>
                      <label style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block', marginBottom: '0.25rem' }}>
                        Overall Experience Rating <span className="small muted">(Optional)</span>
                      </label>
                      <div className="fb-rating-wrap">
                        <div className="fb-stars-list" role="radiogroup" aria-label="1 to 5 star rating">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const activeVal = hoverRating ?? rating ?? 0;
                            const isFilled = star <= activeVal;
                            return (
                              <button
                                key={star}
                                type="button"
                                role="radio"
                                aria-checked={rating === star}
                                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                                className={`fb-star-btn ${isFilled ? 'is-active' : ''}`}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(null)}
                                onClick={() => setRating(rating === star ? null : star)}
                              >
                                <StarIcon size={24} filled={isFilled} />
                              </button>
                            );
                          })}
                        </div>
                        {(hoverRating || rating) && (
                          <span className="fb-rating-label">
                            {RATING_DESCRIPTIONS[hoverRating ?? rating ?? 0]}
                          </span>
                        )}
                        {rating && !hoverRating && (
                          <button
                            type="button"
                            className="btn btn-ghost small"
                            onClick={() => setRating(null)}
                            style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Privacy Notice Callout */}
                  <div className={`fb-privacy-callout ${mode === 'ANONYMOUS' ? 'is-anonymous' : 'is-identified'}`}>
                    <div className="fb-privacy-callout-icon" aria-hidden="true">
                      {mode === 'ANONYMOUS' ? <ShieldCheckIcon size={20} /> : <UserIcon size={20} />}
                    </div>
                    <div className="fb-privacy-text">
                      <h4>
                        {mode === 'ANONYMOUS' ? 'Anonymous Submission Guard' : 'Identified Submission'}
                      </h4>
                      <p>
                        {mode === 'ANONYMOUS'
                          ? 'This feedback is not linked to your user account. Station administrators will review your comments without any submitter name or profile association.'
                          : `This feedback will be submitted with your name (${profile?.full_name ?? 'Your Profile'}) and station role, allowing administrators to follow up directly if needed.`}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="row end" style={{ gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={resetForm}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary"
                      disabled={submitting || !subject.trim() || message.trim().length < 10}
                    >
                      {submitting ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className="card"
                  style={{
                    padding: '2.5rem',
                    textAlign: 'center',
                    background: 'var(--surface-raised)',
                    border: '1px dashed var(--line-strong)',
                  }}
                >
                  <p className="muted" style={{ margin: 0 }}>
                    Please select <strong>Share with My Name</strong> or <strong>Speak Freely</strong> above to open the composer.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* TAB 2: MY FEEDBACK (IDENTIFIED ONLY) */}
      {activeTab === 'history' && (
        <section className="card">
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.25rem', color: 'var(--ink-strong)' }}>
              My Identified Submissions
            </h2>
            <p className="small muted" style={{ margin: 0 }}>
              Track responses to feedback you shared openly. Anonymous feedback is never associated with your profile and is not shown here.
            </p>
          </div>

          {myFeedback.loading ? (
            <Loading />
          ) : myFeedback.error ? (
            <Banner>{myFeedback.error}</Banner>
          ) : !myFeedback.data || myFeedback.data.length === 0 ? (
            <Empty>
              You have not submitted any identified feedback yet.
              <br />
              <button
                type="button"
                className="btn btn-outline small"
                style={{ marginTop: '1rem' }}
                onClick={() => setActiveTab('submit')}
              >
                Submit Feedback
              </button>
            </Empty>
          ) : (
            <div className="fb-my-list">
              {myFeedback.data.map((item) => {
                const Icon = CATEGORY_ICON_MAP[item.category];
                return (
                  <div key={item.id} className="fb-item-card">
                    <div className="fb-item-top">
                      <div className="fb-item-meta">
                        <span className="badge badge-grey font-mono">{item.reference}</span>
                        <span className="badge badge-blue">
                          {Icon && <Icon size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />}
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        {item.rating && (
                          <span style={{ color: '#f59e0b', display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                            <StarIcon size={13} filled />
                            <span style={{ fontWeight: 700, fontSize: '0.75rem' }}>{item.rating}/5</span>
                          </span>
                        )}
                        <span>&middot;</span>
                        <span>
                          {new Date(item.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div>
                        <span
                          className={`badge ${
                            item.status === 'NEW'
                              ? 'badge-blue'
                              : item.status === 'IN_REVIEW'
                              ? 'badge-amber'
                              : item.status === 'RESOLVED'
                              ? 'badge-green'
                              : 'badge-grey'
                          }`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                    </div>

                    <h3 className="fb-item-subject">{item.subject}</h3>
                    <p className="fb-item-message">{item.message}</p>

                    {item.admin_response && (
                      <div className="fb-admin-response-box">
                        <div className="fb-admin-response-head">
                          <RadioSoundWaveIcon size={14} />
                          <span>Response from VIT Community Radio Team</span>
                        </div>
                        <p className="fb-admin-response-body">{item.admin_response}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}
