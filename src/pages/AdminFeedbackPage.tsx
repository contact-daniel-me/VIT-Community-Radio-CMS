import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { PageHeader, Banner, Loading, Empty } from '@/components/ui';
import { feedbackService, type FeedbackStats } from '@/services/feedbackService';
import {
  UserIcon,
  ShieldCheckIcon,
  StarIcon,
  SearchIcon,
  XIcon,
  BarChartIcon,
  CheckCircleIcon,
  ClockIcon,
  ArchiveIcon,
  LightbulbIcon,
  AlertCircleIcon,
  TrashIcon,
  CATEGORY_ICON_MAP,
  CATEGORY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/components/feedback/FeedbackIcons';
import type {
  FeedbackCategory,
  FeedbackStatus,
  FeedbackWithUser,
} from '@/types/database';

type TabKey = 'ALL' | 'IDENTIFIED' | 'ANONYMOUS' | 'NEW' | 'IN_REVIEW' | 'RESOLVED' | 'ARCHIVED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'All Feedback' },
  { key: 'IDENTIFIED', label: 'Identified' },
  { key: 'ANONYMOUS', label: 'Anonymous' },
  { key: 'NEW', label: 'New' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'ARCHIVED', label: 'Archived' },
];

const CATEGORIES: { key: 'ALL' | FeedbackCategory; label: string }[] = [
  { key: 'ALL', label: 'All Categories' },
  { key: 'IDEA', label: 'Ideas & Suggestions' },
  { key: 'BUG', label: 'Bug Reports' },
  { key: 'STUDIO', label: 'Studio Experience' },
  { key: 'BOOKING', label: 'Booking Experience' },
  { key: 'TECHNICAL', label: 'Technical Issues' },
  { key: 'APPRECIATION', label: 'Appreciation' },
  { key: 'OTHER', label: 'Other' },
];

export function AdminFeedbackPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FeedbackCategory>('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'rating-high' | 'rating-low'>('newest');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedItem, setSelectedItem] = useState<FeedbackWithUser | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Drawer Form State
  const [adminResponseDraft, setAdminResponseDraft] = useState('');
  const [adminNotesDraft, setAdminNotesDraft] = useState('');
  const [savingAction, setSavingAction] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load All Feedback
  const feedbackData = useAsync(async () => {
    const [all, stats] = await Promise.all([
      feedbackService.getAllFeedback({ sort: sortOrder }),
      feedbackService.getFeedbackStats(),
    ]);
    return { all, stats };
  }, [sortOrder]);

  const allItems = feedbackData.data?.all ?? [];
  const stats: FeedbackStats = feedbackData.data?.stats ?? {
    total: 0,
    needsReview: 0,
    ideas: 0,
    issues: 0,
    resolved: 0,
    identified: 0,
    anonymous: 0,
    averageRating: null,
    categoryDistribution: {
      IDEA: 0,
      BUG: 0,
      STUDIO: 0,
      BOOKING: 0,
      TECHNICAL: 0,
      APPRECIATION: 0,
      OTHER: 0,
    },
    statusDistribution: {
      NEW: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      ARCHIVED: 0,
    },
    recentTrend: [],
  };

  // Compute tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      ALL: allItems.length,
      IDENTIFIED: 0,
      ANONYMOUS: 0,
      NEW: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      ARCHIVED: 0,
    };
    for (const item of allItems) {
      if (item.feedback_type === 'IDENTIFIED') counts.IDENTIFIED++;
      if (item.feedback_type === 'ANONYMOUS') counts.ANONYMOUS++;
      if (item.status === 'NEW') counts.NEW++;
      if (item.status === 'IN_REVIEW') counts.IN_REVIEW++;
      if (item.status === 'RESOLVED') counts.RESOLVED++;
      if (item.status === 'ARCHIVED') counts.ARCHIVED++;
    }
    return counts;
  }, [allItems]);

  // Filtered List
  const filteredList = useMemo(() => {
    let list = allItems;

    // Tab filter
    if (activeTab === 'IDENTIFIED') list = list.filter((r) => r.feedback_type === 'IDENTIFIED');
    else if (activeTab === 'ANONYMOUS') list = list.filter((r) => r.feedback_type === 'ANONYMOUS');
    else if (activeTab === 'NEW') list = list.filter((r) => r.status === 'NEW');
    else if (activeTab === 'IN_REVIEW') list = list.filter((r) => r.status === 'IN_REVIEW');
    else if (activeTab === 'RESOLVED') list = list.filter((r) => r.status === 'RESOLVED');
    else if (activeTab === 'ARCHIVED') list = list.filter((r) => r.status === 'ARCHIVED');

    // Category filter
    if (categoryFilter !== 'ALL') {
      list = list.filter((r) => r.category === categoryFilter);
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        return (
          r.reference.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.message.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.submitter?.full_name?.toLowerCase().includes(q) ?? false) ||
          (r.submitter?.email?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    return list;
  }, [allItems, activeTab, categoryFilter, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page, pageSize]);

  // Open drawer
  const handleOpenDetails = (item: FeedbackWithUser) => {
    setSelectedItem(item);
    setAdminResponseDraft(item.admin_response ?? '');
    setAdminNotesDraft(item.admin_notes ?? '');
    setError(null);
    setNotice(null);
  };

  // Close drawer
  const handleCloseDetails = () => {
    setSelectedItem(null);
    setAdminResponseDraft('');
    setAdminNotesDraft('');
  };

  // Update Status
  const handleUpdateStatus = async (status: FeedbackStatus) => {
    if (!selectedItem) return;
    setSavingAction(true);
    setError(null);
    try {
      const updated = await feedbackService.updateStatus(selectedItem.id, status, adminResponseDraft);
      setNotice(`Feedback status changed to ${STATUS_LABELS[status]}.`);
      setSelectedItem((prev) => (prev ? { ...prev, ...updated } : null));
      await feedbackData.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setSavingAction(false);
    }
  };

  // Save Response
  const handleSaveResponse = async () => {
    if (!selectedItem) return;
    setSavingAction(true);
    setError(null);
    try {
      const updated = await feedbackService.updateStatus(
        selectedItem.id,
        selectedItem.status,
        adminResponseDraft,
      );
      setNotice('Public station response saved.');
      setSelectedItem((prev) => (prev ? { ...prev, ...updated } : null));
      await feedbackData.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save response.');
    } finally {
      setSavingAction(false);
    }
  };

  // Save Notes
  const handleSaveNotes = async () => {
    if (!selectedItem) return;
    setSavingAction(true);
    setError(null);
    try {
      await feedbackService.updateAdminNotes(selectedItem.id, adminNotesDraft);
      setNotice('Internal admin notes updated.');
      setSelectedItem((prev) => (prev ? { ...prev, admin_notes: adminNotesDraft.trim() || null } : null));
      await feedbackData.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save notes.');
    } finally {
      setSavingAction(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    setSavingAction(true);
    setError(null);
    try {
      await feedbackService.deleteFeedback(id);
      setNotice('Feedback entry permanently removed.');
      setConfirmDeleteId(null);
      handleCloseDetails();
      await feedbackData.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete feedback.');
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Feedback & Ideas Management"
        description="Review suggestions, bug reports, and experience ratings submitted by the radio community."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link to="/feedback" className="btn btn-outline small">
              Submit Feedback
            </Link>
            <button
              type="button"
              className="btn btn-outline small"
              onClick={() => setShowAnalytics((prev) => !prev)}
            >
              <BarChartIcon size={15} style={{ marginRight: '6px' }} />
              {showAnalytics ? 'Hide Analytics' : 'Feedback Analytics'}
            </button>
          </div>
        }
      />

      <Banner>{error}</Banner>
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* Overview Cards (Section 6) */}
      <div className="fb-stats-grid">
        <div className="fb-stat-card">
          <div className="fb-stat-top">
            <span>Total Submissions</span>
            <MessageSquareSmallIcon size={16} />
          </div>
          <div className="fb-stat-val">{stats.total}</div>
        </div>

        <div className="fb-stat-card">
          <div className="fb-stat-top">
            <span>Needs Review</span>
            <ClockIcon size={16} />
          </div>
          <div className="fb-stat-val" style={{ color: 'var(--accent)' }}>
            {stats.needsReview}
          </div>
        </div>

        <div className="fb-stat-card">
          <div className="fb-stat-top">
            <span>Ideas & Suggestions</span>
            <LightbulbIcon size={16} />
          </div>
          <div className="fb-stat-val">{stats.ideas}</div>
        </div>

        <div className="fb-stat-card">
          <div className="fb-stat-top">
            <span>Reported Issues</span>
            <AlertCircleIcon size={16} />
          </div>
          <div className="fb-stat-val">{stats.issues}</div>
        </div>

        <div className="fb-stat-card">
          <div className="fb-stat-top">
            <span>Resolved</span>
            <CheckCircleIcon size={16} />
          </div>
          <div className="fb-stat-val" style={{ color: 'var(--ok, #10b981)' }}>
            {stats.resolved}
          </div>
        </div>
      </div>

      {/* Analytics Section (Section 8) */}
      {showAnalytics && (
        <div className="fb-analytics-wrap" role="region" aria-label="Feedback Analytics">
          {/* Submissions by Category */}
          <div className="fb-analytics-card">
            <h3 className="fb-analytics-title">
              <BarChartIcon size={18} />
              <span>Category Distribution</span>
            </h3>
            <div className="fb-dist-list">
              {(Object.keys(stats.categoryDistribution) as FeedbackCategory[]).map((catKey) => {
                const count = stats.categoryDistribution[catKey] ?? 0;
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={catKey} className="fb-dist-item">
                    <div className="fb-dist-header">
                      <span>{CATEGORY_LABELS[catKey]}</span>
                      <span className="font-mono">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="fb-dist-bar-track">
                      <div className="fb-dist-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submission Types & Rating */}
          <div className="fb-analytics-card">
            <h3 className="fb-analytics-title">
              <ShieldCheckIcon size={18} />
              <span>Identity & Sentiment Breakdown</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <div className="row spread small muted" style={{ marginBottom: '0.4rem' }}>
                  <span>Identified vs Anonymous</span>
                  <span>
                    {stats.identified} Identified &middot; {stats.anonymous} Anonymous
                  </span>
                </div>
                <div style={{ height: '14px', display: 'flex', borderRadius: '7px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${stats.total > 0 ? (stats.identified / stats.total) * 100 : 50}%`,
                      background: '#10b981',
                    }}
                    title={`Identified: ${stats.identified}`}
                  />
                  <div
                    style={{
                      width: `${stats.total > 0 ? (stats.anonymous / stats.total) * 100 : 50}%`,
                      background: '#3b82f6',
                    }}
                    title={`Anonymous: ${stats.anonymous}`}
                  />
                </div>
                <div className="row spread small" style={{ marginTop: '0.35rem' }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Identified Submissions</span>
                  <span style={{ color: '#3b82f6', fontWeight: 600 }}>Anonymous Submissions</span>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--surface-raised)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                }}
              >
                <span className="small muted">Average Community Experience Rating</span>
                <div className="row align-center" style={{ gap: '0.75rem', marginTop: '0.35rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--ink-strong)' }}>
                    {stats.averageRating !== null ? stats.averageRating.toFixed(1) : '—'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', gap: '2px', color: '#f59e0b' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          size={16}
                          filled={star <= Math.round(stats.averageRating ?? 0)}
                        />
                      ))}
                    </div>
                    <span className="small muted">out of 5 stars</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs (Matching Bookings & Users Style) */}
      <div
        className="row spread align-center wrap"
        style={{ gap: '1rem', marginBottom: '1rem' }}
      >
        <div className="tabs" role="tablist" aria-label="Filter feedback by category or status">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                className={`tab ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
              >
                {tab.label}
                <span className="tab-count">{tabCounts[tab.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and Secondary Filter Bar */}
      <div
        className="row wrap align-center"
        style={{ gap: '0.75rem', marginBottom: '1.25rem' }}
      >
        <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="Search reference, subject, message, or user..."
              aria-label="Search feedback"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ width: '100%', paddingLeft: '2rem' }}
            />
            <span
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-muted)',
                pointerEvents: 'none',
              }}
            >
              <SearchIcon size={14} />
            </span>
          </div>
        </div>

        <div style={{ width: '180px' }}>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as 'ALL' | FeedbackCategory);
              setPage(1);
            }}
            aria-label="Filter by category"
            style={{ width: '100%' }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: '160px' }}>
          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as any);
              setPage(1);
            }}
            aria-label="Sort entries"
            style={{ width: '100%' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="rating-high">Highest Rating</option>
            <option value="rating-low">Lowest Rating</option>
          </select>
        </div>

        {search && (
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setSearch('')}
          >
            Clear Search
          </button>
        )}
      </div>

      {/* Main Table */}
      <section className="card">
        {feedbackData.loading ? (
          <Loading />
        ) : feedbackData.error ? (
          <Banner>{feedbackData.error}</Banner>
        ) : paginatedList.length === 0 ? (
          <Empty>
            {search.trim() || categoryFilter !== 'ALL' || activeTab !== 'ALL'
              ? 'No feedback submissions match the current filters.'
              : 'No feedback submissions recorded yet.'}
          </Empty>
        ) : (
          <div className="table-responsive">
            <table className="table" aria-label="Feedback Submissions Table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Reference</th>
                  <th>Subject</th>
                  <th style={{ width: '150px' }}>Category</th>
                  <th style={{ width: '130px' }}>Type</th>
                  <th style={{ width: '170px' }}>Submitted By</th>
                  <th style={{ width: '90px' }}>Rating</th>
                  <th style={{ width: '120px' }}>Date</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.map((item) => {
                  const CatIcon = CATEGORY_ICON_MAP[item.category];
                  const isAnon = item.feedback_type === 'ANONYMOUS';
                  return (
                    <tr key={item.id}>
                      <td className="font-mono small" style={{ fontWeight: 600 }}>
                        {item.reference}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--ink-strong)' }}>
                          {item.subject}
                        </span>
                        <div
                          className="small muted"
                          style={{
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.message}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-grey small" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {CatIcon && <CatIcon size={12} />}
                          <span>{CATEGORY_LABELS[item.category]}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isAnon ? 'badge-blue' : 'badge-green'} small`}>
                          {isAnon ? 'Anonymous' : 'Identified'}
                        </span>
                      </td>
                      <td>
                        {isAnon ? (
                          <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontStyle: 'italic' }}>
                            <ShieldCheckIcon size={13} />
                            <span>Anonymous</span>
                          </span>
                        ) : (
                          <div>
                            <div className="small font-medium">
                              {item.submitter?.full_name ?? 'User Profile'}
                            </div>
                            <div className="small muted" style={{ fontSize: '0.75rem' }}>
                              {item.submitter?.role ?? 'Member'}
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {item.rating ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontWeight: 700, fontSize: '0.8rem' }}>
                            <StarIcon size={13} filled />
                            <span>{item.rating}</span>
                          </span>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                      <td className="small muted">
                        {new Date(item.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            item.status === 'NEW'
                              ? 'badge-blue'
                              : item.status === 'IN_REVIEW'
                              ? 'badge-amber'
                              : item.status === 'RESOLVED'
                              ? 'badge-green'
                              : 'badge-grey'
                          } small`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-outline small"
                          onClick={() => handleOpenDetails(item)}
                          style={{ padding: '0.2rem 0.55rem' }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filteredList.length > pageSize && (
          <div
            className="row spread align-center"
            style={{
              padding: '1rem',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span className="small muted">
              Showing {(page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, filteredList.length)} of {filteredList.length} items
            </span>
            <div className="row" style={{ gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline small"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="small muted" style={{ padding: '0.35rem 0.6rem' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline small"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 7: Feedback Details Side Drawer */}
      {selectedItem && (
        <div className="fb-drawer-backdrop" onClick={handleCloseDetails}>
          <div className="fb-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Feedback Details">
            <div className="fb-drawer-header">
              <div>
                <span className="font-mono small muted">{selectedItem.reference}</span>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0.2rem 0 0', color: 'var(--ink-strong)' }}>
                  Feedback Review
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={handleCloseDetails}
                aria-label="Close details"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="fb-drawer-body">
              {/* Quick Status Bar & Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  background: 'var(--surface-raised)',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <span className="small muted" style={{ display: 'block', fontSize: '0.74rem' }}>
                    Current Status
                  </span>
                  <span
                    className={`badge ${
                      selectedItem.status === 'NEW'
                        ? 'badge-blue'
                        : selectedItem.status === 'IN_REVIEW'
                        ? 'badge-amber'
                        : selectedItem.status === 'RESOLVED'
                        ? 'badge-green'
                        : 'badge-grey'
                    }`}
                  >
                    {STATUS_LABELS[selectedItem.status]}
                  </span>
                </div>

                <div className="fb-drawer-actions">
                  {selectedItem.status !== 'IN_REVIEW' && (
                    <button
                      type="button"
                      className="btn btn-outline small"
                      disabled={savingAction}
                      onClick={() => handleUpdateStatus('IN_REVIEW')}
                    >
                      Mark In Review
                    </button>
                  )}
                  {selectedItem.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={savingAction}
                      onClick={() => handleUpdateStatus('RESOLVED')}
                    >
                      Mark Resolved
                    </button>
                  )}
                  {selectedItem.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      className="btn btn-ghost small"
                      disabled={savingAction}
                      onClick={() => handleUpdateStatus('ARCHIVED')}
                    >
                      <ArchiveIcon size={14} style={{ marginRight: '4px' }} />
                      Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Submitter Info Card (Section 7) */}
              <div className={`fb-submitter-box ${selectedItem.feedback_type === 'ANONYMOUS' ? 'is-anon' : ''}`}>
                <div className="row spread align-center" style={{ marginBottom: '0.5rem' }}>
                  <span className="small muted" style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                    {selectedItem.feedback_type === 'ANONYMOUS' ? 'Anonymity Protected' : 'Submitter Profile'}
                  </span>
                  <span className={`badge ${selectedItem.feedback_type === 'ANONYMOUS' ? 'badge-blue' : 'badge-green'} small`}>
                    {TYPE_LABELS[selectedItem.feedback_type]}
                  </span>
                </div>

                {selectedItem.feedback_type === 'ANONYMOUS' ? (
                  <div className="row align-center" style={{ gap: '0.75rem', color: '#3b82f6' }}>
                    <ShieldCheckIcon size={24} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Anonymous Submitter</div>
                      <p className="small muted" style={{ margin: 0 }}>
                        User identity was omitted at submission time. No user profile was stored.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="row align-center" style={{ gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: 'var(--accent-wash)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                      }}
                    >
                      <UserIcon size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--ink-strong)' }}>
                        {selectedItem.submitter?.full_name ?? 'User Profile'}
                      </div>
                      <div className="small muted">
                        {selectedItem.submitter?.email ?? 'Unknown Email'} &middot; {selectedItem.submitter?.role ?? 'Member'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Feedback Content */}
              <div>
                <div className="row spread" style={{ marginBottom: '0.4rem' }}>
                  <span className="badge badge-grey small">
                    {CATEGORY_LABELS[selectedItem.category]}
                  </span>
                  {selectedItem.rating && (
                    <span style={{ color: '#f59e0b', display: 'flex', gap: '3px', alignItems: 'center' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <StarIcon key={s} size={14} filled={s <= (selectedItem.rating ?? 0)} />
                      ))}
                      <span className="small muted" style={{ marginLeft: '4px' }}>
                        ({selectedItem.rating}/5)
                      </span>
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--ink-strong)' }}>
                  {selectedItem.subject}
                </h3>
                <div
                  style={{
                    background: 'var(--surface-raised)',
                    padding: '1.25rem',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    fontSize: '0.92rem',
                    color: 'var(--ink)',
                  }}
                >
                  {selectedItem.message}
                </div>
                <div className="small muted" style={{ marginTop: '0.5rem' }}>
                  Submitted on{' '}
                  {new Date(selectedItem.created_at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              </div>

              {/* Public Station Response */}
              <div>
                <label htmlFor="drawer-response" style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.35rem' }}>
                  Public Station Response
                </label>
                <p className="small muted" style={{ margin: '0 0 0.5rem' }}>
                  Visible to identified submitters on their "My Submissions" page.
                </p>
                <textarea
                  id="drawer-response"
                  rows={3}
                  placeholder="Provide an official update, thank-you, or next steps from the station..."
                  value={adminResponseDraft}
                  onChange={(e) => setAdminResponseDraft(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="btn btn-outline small"
                  disabled={savingAction}
                  onClick={handleSaveResponse}
                  style={{ marginTop: '0.5rem' }}
                >
                  Save Station Response
                </button>
              </div>

              {/* Internal Administrator Notes */}
              <div>
                <label htmlFor="drawer-notes" style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.35rem' }}>
                  Internal Administrator Notes (Private)
                </label>
                <p className="small muted" style={{ margin: '0 0 0.5rem' }}>
                  Restricted to administrators. Never displayed to regular users.
                </p>
                <textarea
                  id="drawer-notes"
                  rows={3}
                  placeholder="Record internal investigations, staff assignments, or triage notes..."
                  value={adminNotesDraft}
                  onChange={(e) => setAdminNotesDraft(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="btn btn-outline small"
                  disabled={savingAction}
                  onClick={handleSaveNotes}
                  style={{ marginTop: '0.5rem' }}
                >
                  Save Internal Note
                </button>
              </div>

              {/* Danger Zone: Delete */}
              <div style={{ marginTop: '1rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)' }}>
                {confirmDeleteId === selectedItem.id ? (
                  <div
                    style={{
                      background: 'var(--accent-wash)',
                      border: '1px solid var(--accent-line)',
                      padding: '1rem',
                      borderRadius: '8px',
                    }}
                  >
                    <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent)' }}>
                      Are you sure you want to permanently delete this feedback? This action cannot be undone.
                    </p>
                    <div className="row" style={{ gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn small"
                        style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
                        disabled={savingAction}
                        onClick={() => handleDelete(selectedItem.id)}
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline small"
                        disabled={savingAction}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    style={{ color: 'var(--accent)' }}
                    onClick={() => setConfirmDeleteId(selectedItem.id)}
                  >
                    <TrashIcon size={14} style={{ marginRight: '4px' }} />
                    Permanently Delete Feedback
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageSquareSmallIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
