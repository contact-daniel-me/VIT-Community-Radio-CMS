import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, PageHeader, Loading } from '@/components/ui';
import {
  holidayService,
  type HolidayWithCreator,
  type HolidayInput,
} from '@/services/holidayService';
import { errorMessage } from '@/lib/errors';
import { formatBookingDate, isoDate } from '@/utils/studio';
import { formatDate } from '@/utils/datetime';

const REASON_PRESETS = [
  'Public Holiday',
  'Festival',
  'Studio Maintenance',
  'College Holiday',
  'Semester Exams',
];

type HolidayTab = 'upcoming' | 'all' | 'past';

export function HolidaysPage() {
  const profile = useCurrentUser();
  const [tab, setTab] = useState<HolidayTab>('upcoming');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayWithCreator | null>(null);
  const [isRange, setIsRange] = useState(false);
  const [formData, setFormData] = useState<HolidayInput>({
    start_date: isoDate(new Date()),
    end_date: isoDate(new Date()),
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayWithCreator | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Existing bookings warning check
  const [existingBookingsWarning, setExistingBookingsWarning] = useState<{
    count: number;
    sample: { id: string; reference: string | null; booking_date: string; start_time: string }[];
  } | null>(null);
  const [checkingBookings, setCheckingBookings] = useState(false);

  const holidays = useAsync(() => holidayService.getHolidays(), []);

  const today = isoDate(new Date());

  // Check existing bookings when form dates change
  useEffect(() => {
    if (!isFormOpen) {
      setExistingBookingsWarning(null);
      return;
    }

    const start = formData.start_date;
    const end = isRange ? formData.end_date : formData.start_date;

    if (!start || !end || end < start) {
      setExistingBookingsWarning(null);
      return;
    }

    let active = true;
    setCheckingBookings(true);
    holidayService
      .checkExistingBookings(start, end)
      .then((res) => {
        if (active) setExistingBookingsWarning(res);
      })
      .catch(() => {
        if (active) setExistingBookingsWarning(null);
      })
      .finally(() => {
        if (active) setCheckingBookings(false);
      });

    return () => {
      active = false;
    };
  }, [formData.start_date, formData.end_date, isRange, isFormOpen]);

  // Open creation modal
  const openCreate = () => {
    setError(null);
    setNotice(null);
    setEditingHoliday(null);
    setIsRange(false);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomStr = isoDate(tomorrow);
    setFormData({
      start_date: tomStr,
      end_date: tomStr,
      reason: 'Public Holiday',
    });
    setIsFormOpen(true);
  };

  // Open edit modal
  const openEdit = (h: HolidayWithCreator) => {
    setError(null);
    setNotice(null);
    setEditingHoliday(h);
    setIsRange(h.start_date !== h.end_date);
    setFormData({
      start_date: h.start_date,
      end_date: h.end_date,
      reason: h.reason ?? '',
    });
    setIsFormOpen(true);
  };

  // Save creation or edit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const start = formData.start_date;
    const end = isRange ? formData.end_date : formData.start_date;

    if (!start) {
      setError('Please select a start date.');
      return;
    }
    if (end < start) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    setSaving(true);
    try {
      if (editingHoliday) {
        await holidayService.updateHoliday(editingHoliday.id, {
          start_date: start,
          end_date: end,
          reason: formData.reason,
        });
        setNotice('Holiday dates updated successfully.');
      } else {
        await holidayService.createHoliday(
          {
            start_date: start,
            end_date: end,
            reason: formData.reason,
          },
          profile.id,
        );
        setNotice('Studio dates blocked successfully. Bookings on these dates are now disabled.');
      }
      setIsFormOpen(false);
      setEditingHoliday(null);
      await holidays.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  // Delete / Reopen confirmation
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await holidayService.deleteHoliday(deleteTarget.id);
      setNotice(
        `Holiday removed. Studio bookings for ${formatDateDisplay(deleteTarget.start_date, deleteTarget.end_date)} have been reopened.`,
      );
      setDeleteTarget(null);
      await holidays.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  };

  // Filtered lists
  const allHolidays = holidays.data ?? [];

  const counts = useMemo(() => {
    let upcomingCount = 0;
    let pastCount = 0;
    for (const h of allHolidays) {
      if (h.end_date >= today) upcomingCount++;
      else pastCount++;
    }
    return {
      all: allHolidays.length,
      upcoming: upcomingCount,
      past: pastCount,
    };
  }, [allHolidays, today]);

  const filteredHolidays = useMemo(() => {
    let list = allHolidays;
    if (tab === 'upcoming') {
      list = list.filter((h) => h.end_date >= today);
    } else if (tab === 'past') {
      list = list.filter((h) => h.end_date < today);
    }

    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((h) => {
      const reasonMatch = (h.reason || '').toLowerCase().includes(q);
      const startMatch = h.start_date.includes(q);
      const endMatch = h.end_date.includes(q);
      const creatorMatch = (h.creator?.full_name || '').toLowerCase().includes(q);
      return reasonMatch || startMatch || endMatch || creatorMatch;
    });
  }, [allHolidays, tab, today, search]);

  return (
    <>
      <PageHeader
        title="Holiday Management"
        description="Block studio bookings on public holidays, college events, or maintenance periods."
        actions={
          <button type="button" className="primary" onClick={openCreate}>
            Block Dates
          </button>
        }
      />

      <Banner>{error}</Banner>
      {notice && <Banner kind="success">{notice}</Banner>}

      {/* Overview Stats */}
      <div
        className="row wrap"
        style={{ gap: '1rem', marginBottom: '1.25rem' }}
      >
        <div
          className="card"
          style={{ flex: '1 1 200px', padding: '1rem 1.25rem' }}
        >
          <span className="small muted">Upcoming Closures</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)', marginTop: '0.2rem' }}>
            {counts.upcoming}
          </div>
        </div>
        <div
          className="card"
          style={{ flex: '1 1 200px', padding: '1rem 1.25rem' }}
        >
          <span className="small muted">Total Scheduled Closures</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)', marginTop: '0.2rem' }}>
            {counts.all}
          </div>
        </div>
        <div
          className="card"
          style={{ flex: '1 1 200px', padding: '1rem 1.25rem' }}
        >
          <span className="small muted">Past Closures</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
            {counts.past}
          </div>
        </div>
      </div>

      {/* Tabs and Search Navigation */}
      <div className="tabs-nav-wrap">
        <div className="tabs" role="tablist" aria-label="Holiday view filter">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            className={`tab ${tab === 'upcoming' ? 'is-active' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            Upcoming & Active
            <span className="tab-count">{counts.upcoming}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`tab ${tab === 'all' ? 'is-active' : ''}`}
            onClick={() => setTab('all')}
          >
            All Holidays
            <span className="tab-count">{counts.all}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'past'}
            className={`tab ${tab === 'past' ? 'is-active' : ''}`}
            onClick={() => setTab('past')}
          >
            Past Closures
            <span className="tab-count">{counts.past}</span>
          </button>
        </div>
      </div>

      <section className="card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search by reason, date, or creator..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search holidays"
            style={{ minWidth: '280px', flex: '1 1 300px' }}
          />
          {search && (
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          )}
        </div>

        {holidays.loading ? (
          <Loading label="Loading studio holidays..." />
        ) : holidays.error ? (
          <Banner>{holidays.error}</Banner>
        ) : filteredHolidays.length === 0 ? (
          <div className="episode-empty-state">
            <div className="episode-empty-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="episode-empty-title">
              {search
                ? 'No holidays match your search'
                : tab === 'upcoming'
                  ? 'No upcoming studio closures'
                  : 'No holidays recorded'}
            </h3>
            <p className="episode-empty-desc">
              {search
                ? `No blocked dates found matching "${search}". Try checking the spelling or clear search.`
                : tab === 'upcoming'
                  ? 'There are currently no upcoming holidays or maintenance closures blocking studio bookings.'
                  : 'No holidays or closures have been created yet.'}
            </p>
            {!search && (
              <button
                type="button"
                className="primary small"
                onClick={openCreate}
                style={{ marginTop: '0.85rem' }}
              >
                Block Studio Dates
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dates Blocked</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map((h) => {
                  const isActive = h.start_date <= today && h.end_date >= today;
                  const isFuture = h.start_date > today;
                  const daysDiff =
                    Math.round(
                      (new Date(h.end_date).getTime() - new Date(h.start_date).getTime()) /
                        (1000 * 3600 * 24),
                    ) + 1;

                  return (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 600 }}>
                        {formatDateDisplay(h.start_date, h.end_date)}
                      </td>
                      <td>
                        <span className="badge badge-grey small">
                          {daysDiff} {daysDiff === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                      <td>
                        {h.reason ? (
                          <span
                            className={`badge ${getReasonTone(h.reason)}`}
                            style={{ fontSize: '0.78rem' }}
                          >
                            {h.reason}
                          </span>
                        ) : (
                          <span className="muted">Studio closure</span>
                        )}
                      </td>
                      <td>
                        {isActive ? (
                          <span className="badge badge-red">Active Now</span>
                        ) : isFuture ? (
                          <span className="badge badge-blue">Upcoming</span>
                        ) : (
                          <span className="badge badge-grey">Past</span>
                        )}
                      </td>
                      <td className="small">
                        {h.creator?.full_name ?? <span className="muted">Admin</span>}
                      </td>
                      <td className="small muted">{formatDate(h.created_at)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-outline small"
                          onClick={() => openEdit(h)}
                          style={{ marginRight: '0.4rem', padding: '0.2rem 0.55rem' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost small"
                          onClick={() => setDeleteTarget(h)}
                          style={{ color: 'var(--accent)', padding: '0.2rem 0.55rem' }}
                          title="Reopen bookings for these dates"
                        >
                          Reopen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Create or Edit Holiday */}
      {isFormOpen && (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="holiday-dialog-title"
        >
          <div className="dialog-card card" style={{ maxWidth: '520px', width: '100%' }}>
            <header className="dialog-header">
              <div>
                <h2 id="holiday-dialog-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                  {editingHoliday ? 'Edit Studio Holiday' : 'Block Studio Dates'}
                </h2>
                <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
                  Dates blocked will prevent any user from booking studio slots.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
              {/* Single date vs Range selection */}
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Closure Type
                </label>
                <div className="row" style={{ gap: '1.5rem' }}>
                  <label className="radio" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="closureType"
                      checked={!isRange}
                      onChange={() => {
                        setIsRange(false);
                        setFormData({ ...formData, end_date: formData.start_date });
                      }}
                    />
                    Single Date
                  </label>
                  <label className="radio" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="closureType"
                      checked={isRange}
                      onChange={() => setIsRange(true)}
                    />
                    Date Range (Multiple days)
                  </label>
                </div>
              </div>

              {/* Date pickers */}
              <div className="form-grid cols-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="h-start-date" style={{ fontWeight: 600 }}>
                    {isRange ? 'Start Date' : 'Blocked Date'}
                  </label>
                  <input
                    id="h-start-date"
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setFormData({
                        ...formData,
                        start_date: nextStart,
                        end_date: isRange ? (formData.end_date < nextStart ? nextStart : formData.end_date) : nextStart,
                      });
                    }}
                    style={{ width: '100%', marginTop: '0.25rem' }}
                  />
                </div>

                {isRange ? (
                  <div>
                    <label htmlFor="h-end-date" style={{ fontWeight: 600 }}>
                      End Date (Inclusive)
                    </label>
                    <input
                      id="h-end-date"
                      type="date"
                      required
                      min={formData.start_date}
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      style={{ width: '100%', marginTop: '0.25rem' }}
                    />
                  </div>
                ) : (
                  <div>
                    <span className="muted small" style={{ display: 'block', marginTop: '1.8rem' }}>
                      All slots on this day will be marked as Blocked.
                    </span>
                  </div>
                )}
              </div>

              {/* Preset buttons */}
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Reason Presets <span className="hint small muted">(Click to apply)</span>
                </label>
                <div className="row wrap" style={{ gap: '0.4rem' }}>
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn btn-outline small"
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.78rem',
                        background: formData.reason === preset ? 'var(--accent-wash)' : undefined,
                        borderColor: formData.reason === preset ? 'var(--accent)' : undefined,
                        color: formData.reason === preset ? 'var(--accent)' : undefined,
                      }}
                      onClick={() => setFormData({ ...formData, reason: preset })}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom reason input */}
              <div className="field" style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="h-reason" style={{ fontWeight: 600 }}>
                  Reason or Description <span className="hint small muted">(Optional)</span>
                </label>
                <input
                  id="h-reason"
                  type="text"
                  placeholder="e.g. Republic Day, Pongal Festival, Studio Rewiring"
                  maxLength={200}
                  value={formData.reason ?? ''}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </div>

              {/* Existing Bookings Warning */}
              {checkingBookings ? (
                <p className="small muted">Checking for existing bookings on selected dates&hellip;</p>
              ) : existingBookingsWarning && existingBookingsWarning.count > 0 ? (
                <div
                  className="banner banner-info"
                  style={{ marginBottom: '1.25rem', fontSize: '0.86rem', borderLeft: '4px solid var(--warn)' }}
                >
                  <strong>⚠️ Warning:</strong> There are{' '}
                  <strong>{existingBookingsWarning.count} confirmed booking(s)</strong> already
                  scheduled on these dates.
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                    Blocking will prevent new bookings, but existing bookings will NOT be cancelled
                    automatically. Review them in{' '}
                    <a href="/bookings" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                      Studio Bookings
                    </a>{' '}
                    if you need to notify RJs or cancel slots.
                  </p>
                </div>
              ) : null}

              <div className="actions-row spread" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsFormOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={saving}>
                  {saving
                    ? 'Saving...'
                    : editingHoliday
                      ? 'Update Holiday'
                      : isRange
                        ? 'Block Date Range'
                        : 'Block Date'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete / Reopen */}
      {deleteTarget && (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-reopen-title"
        >
          <div className="dialog-card card" style={{ maxWidth: '440px', width: '100%' }}>
            <h2 id="confirm-reopen-title" style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>
              Reopen Studio Bookings?
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', color: 'var(--ink-muted)' }}>
              Are you sure you want to remove the closure for{' '}
              <strong>{formatDateDisplay(deleteTarget.start_date, deleteTarget.end_date)}</strong>?
            </p>
            <p className="small muted" style={{ margin: '0 0 1.25rem' }}>
              Removing this holiday will allow RJs and staff to book slots on this date again
              according to standard booking window rules.
            </p>
            <div className="actions-row spread" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Keep Blocked
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{ background: 'var(--accent)' }}
              >
                {deleting ? 'Reopening...' : 'Remove & Reopen Bookings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatDateDisplay(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatBookingDate(startDate, { short: true });
  }
  return `${formatBookingDate(startDate, { short: true })} – ${formatBookingDate(endDate, { short: true })}`;
}

function getReasonTone(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('maintenance') || r.includes('repair') || r.includes('audio')) {
    return 'badge-orange';
  }
  if (r.includes('festival') || r.includes('pongal') || r.includes('diwali')) {
    return 'badge-pink';
  }
  if (r.includes('exam') || r.includes('academic') || r.includes('college')) {
    return 'badge-blue';
  }
  if (r.includes('public') || r.includes('national')) {
    return 'badge-green';
  }
  return 'badge-grey';
}
