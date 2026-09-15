import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, ConfirmButton, Empty, Loading, PageHeader, UnifiedStatusBadge, getUnifiedStatusClass } from '@/components/ui';
import { bookingService, type BookingWithPeople } from '@/services/bookingService';
import { RecordingDialog } from '@/components/studio/RecordingDialog';
import { errorMessage } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/utils/datetime';
import { formatBookingDate, formatSlotTime, slotStartsAt } from '@/utils/studio';
import type { StudioBookingRequestRow } from '@/types/database';

type Tab = 'upcoming' | 'past' | 'cancelled' | 'requests';



export function MyBookingsPage() {
  const profile = useCurrentUser();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<BookingWithPeople | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Admins and producers oversee the whole studio; everyone else sees their own.
  const oversees = can.manageProgram(profile.role);
  const bookings = useAsync(
    () => (oversees ? bookingService.getAllBookings() : bookingService.getMyBookings(profile.id)),
    [profile.id, oversees],
  );

  const requests = useAsync(
    () => (oversees ? bookingService.getPendingRequests() : bookingService.getUserRequests(profile.id)),
    [profile.id, oversees],
  );

  const groups = useMemo(() => {
    const all = bookings.data ?? [];
    const allReqs = requests.data ?? [];
    const now = Date.now();
    const started = (b: BookingWithPeople) =>
      slotStartsAt(b.booking_date, b.start_time.slice(0, 5)).getTime() <= now;

    return {
      upcoming: all
        .filter((b) => b.status === 'CONFIRMED' && !started(b))
        .sort((a, b) => a.booking_date.localeCompare(b.booking_date)),
      past: all.filter((b) => b.status !== 'CANCELLED' && started(b)),
      cancelled: all.filter((b) => b.status === 'CANCELLED'),
      requests: allReqs.filter((r) => r.status === 'PENDING' || r.status === 'REJECTED'),
    };
  }, [bookings.data, requests.data]);

  const cancel = async (booking: BookingWithPeople) => {
    setBusyId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.cancelBooking(booking.id, cancelReason);
      setNotice(`${booking.reference} cancelled. The slot is free for someone else.`);
      setCancelReason('');
      await bookings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const cancelRequest = async (request: StudioBookingRequestRow) => {
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.cancelRequest(request.id, profile.id);
      setNotice(`Request cancelled.`);
      await requests.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const approveRequest = async (request: StudioBookingRequestRow) => {
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.approveRequest(request.id, profile.id);
      setNotice(`Request approved and booking confirmed.`);
      await requests.reload();
      await bookings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = async (request: StudioBookingRequestRow) => {
    if (!cancelReason) {
      setError('Please provide a reason for rejecting the request.');
      return;
    }
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.rejectRequest(request.id, profile.id, cancelReason);
      setNotice(`Request rejected.`);
      setCancelReason('');
      await requests.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const reapprove = async (booking: BookingWithPeople) => {
    setBusyId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.reapproveBooking(booking.id);
      setNotice(`${booking.reference} reapproved successfully.`);
      await bookings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDelete = async (booking: BookingWithPeople) => {
    setBusyId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.permanentlyDeleteBooking(booking.id);
      setNotice(`${booking.reference} has been permanently deleted.`);
      await bookings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const list = groups[tab];

  return (
    <>
      <PageHeader
        title={oversees ? 'Studio bookings' : 'My bookings'}
        description={
          oversees
            ? 'Every studio reservation, newest first.'
            : 'Your studio reservations and their references.'
        }
        actions={
          <Link to="/studio" className="btn btn-solid small">
            Book the studio
          </Link>
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      <div className="tabs" role="tablist" aria-label="Booking groups">
        {(['upcoming', 'requests', 'past', 'cancelled'] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key[0].toUpperCase() + key.slice(1)}
            <span className="tab-count">{groups[key].length}</span>
          </button>
        ))}
      </div>

      {bookings.loading ? (
        <Loading label="Loading bookings…" />
      ) : bookings.error ? (
        <Banner>{bookings.error}</Banner>
      ) : list.length === 0 ? (
        <section className="card">
          <Empty>
            {tab === 'upcoming' ? (
              <>
                Nothing booked yet. <Link to="/studio">Pick a studio slot</Link> to get started.
              </>
            ) : tab === 'requests' ? (
              'No pending or rejected requests.'
            ) : tab === 'past' ? (
              'No past sessions yet.'
            ) : (
              'No cancelled bookings.'
            )}
          </Empty>
        </section>
      ) : (
        <div className="booking-list">
          {list.map((item: any) => {
            const isRequest = item.status === 'PENDING' || item.status === 'REJECTED';
            const booking = item as BookingWithPeople;
            const request = item as (StudioBookingRequestRow & { program?: { name: string }, user?: { full_name: string } });
            
            const open = openId === item.id;
            const startsAt = slotStartsAt(item.booking_date, item.start_time.slice(0, 5));
            const canUpload = !isRequest && booking.status !== 'CANCELLED';
            const cancellable =
              !isRequest &&
              booking.status === 'CONFIRMED' &&
              (startsAt.getTime() > Date.now() || oversees) &&
              (booking.rj_id === profile.id || oversees);

            return (
              <article key={item.id} className={`booking-card ${isRequest ? '' : getUnifiedStatusClass({ booking, episode: booking.episode })}`}>
                <div className="booking-main">
                  <div className="booking-when">
                    <span className="booking-date">
                      {formatBookingDate(item.booking_date, { short: true })}
                    </span>
                    <span className="booking-time">
                      {formatSlotTime(item.start_time.slice(0, 5))} &ndash;{' '}
                      {formatSlotTime(item.end_time.slice(0, 5))}
                    </span>
                  </div>

                  <div className="booking-what">
                    <h3 className="booking-show">{isRequest ? (request.program?.name ?? 'Unknown Show') : (booking.program?.name ?? 'Unknown Show')}</h3>
                    <p className="booking-meta">
                      {!isRequest && <span className="booking-ref">{booking.reference}</span>}
                      {!isRequest && <span className="dot">&middot;</span>}
                      {item.language.charAt(0) + item.language.slice(1).toLowerCase()}
                      {oversees && (isRequest ? request.user : booking.rj) && (
                        <>
                          <span className="dot">&middot;</span>
                          {isRequest ? request.user?.full_name : booking.rj?.full_name}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="booking-side">
                    {isRequest ? (
                      <span className={`badge ${request.status === 'PENDING' ? 'badge-amber' : 'badge-red'}`}>
                        {request.status === 'PENDING' ? 'Pending Approval' : 'Rejected'}
                      </span>
                    ) : (
                      <UnifiedStatusBadge booking={booking} episode={booking.episode} />
                    )}
                    {!isRequest && booking.origin === 'ADMIN_OVERRIDE' && (
                      <span className="badge badge-amber">Override</span>
                    )}
                    {canUpload && (booking.rj_id === profile.id || can.adminForceUploadAudio(profile.role)) && (
                      booking.episode_id ? (
                        <Link
                          to={`/admin/episodes/${booking.episode_id}`}
                          className="btn btn-outline small"
                        >
                          Open recording
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-solid small"
                          onClick={() => setUploadFor(booking)}
                        >
                          Upload audio
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost small"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : item.id)}
                    >
                      {open ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="booking-detail">
                    <dl className="review">
                      {!isRequest && <Detail label="Reference" value={booking.reference} />}
                      <Detail label="Date" value={formatBookingDate(item.booking_date)} />
                      <Detail
                        label="Time"
                        value={`${formatSlotTime(item.start_time.slice(0, 5))} – ${formatSlotTime(
                          item.end_time.slice(0, 5),
                        )} (30 min)`}
                      />
                      <div className="review-row">
                        <dt>Status</dt>
                        <dd>
                          {isRequest ? (
                            <span className={`badge ${request.status === 'PENDING' ? 'badge-amber' : 'badge-red'}`}>
                              {request.status === 'PENDING' ? 'Pending Approval' : 'Rejected'}
                            </span>
                          ) : (
                            <UnifiedStatusBadge booking={booking} episode={booking.episode} />
                          )}
                        </dd>
                      </div>
                      <Detail
                        label="Editor"
                        value={
                          item.self_edit
                            ? 'Editing it themselves'
                            : (!isRequest && booking.editor?.full_name ? booking.editor.full_name : 'Not assigned yet')
                        }
                      />
                      <Detail
                        label="Script"
                        value={
                          item.script_status === 'YES'
                            ? `Approved${item.script_approver ? ` by ${item.script_approver}` : ''}`
                            : item.script_status === 'PENDING'
                              ? 'Pending approval'
                              : 'Not approved'
                        }
                      />
                      {item.notes && <Detail label="Notes" value={item.notes} />}
                      {!isRequest && booking.override_reason && (
                        <Detail label="Override reason" value={booking.override_reason} />
                      )}
                      {isRequest && request.rejection_reason && (
                        <Detail label="Reason" value={request.rejection_reason} />
                      )}
                      <Detail label="Created" value={formatDateTime(item.created_at)} />
                    </dl>

                    {isRequest && request.status === 'PENDING' ? (
                      oversees ? (
                        <div className="stack" style={{ gap: '0.8rem', marginTop: '1.2rem' }}>
                          <div>
                            <label htmlFor={`reject-reason-${request.id}`} className="visually-hidden">Rejection reason (required for rejection)</label>
                            <input 
                              id={`reject-reason-${request.id}`}
                              type="text" 
                              className="text-input" 
                              placeholder="Reason for rejection (required to reject)" 
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              style={{ width: '100%', padding: '0.62rem 0.7rem', borderRadius: 'var(--r-md)', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                            />
                          </div>
                          <div className="dialog-actions">
                            <ConfirmButton
                              className="small danger"
                              confirmLabel="Reject request?"
                              disabled={busyId === request.id}
                              onConfirm={() => void rejectRequest(request)}
                            >
                              {busyId === request.id ? 'Rejecting…' : 'Reject'}
                            </ConfirmButton>
                            <button 
                              type="button" 
                              className="btn btn-solid small" 
                              disabled={busyId === request.id}
                              onClick={() => void approveRequest(request)}
                            >
                              {busyId === request.id ? 'Approving…' : 'Approve'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="dialog-actions" style={{ marginTop: '1.2rem' }}>
                          <ConfirmButton
                            className="small danger"
                            confirmLabel="Cancel request?"
                            disabled={busyId === request.id}
                            onConfirm={() => void cancelRequest(request)}
                          >
                            {busyId === request.id ? 'Cancelling…' : 'Cancel request'}
                          </ConfirmButton>
                        </div>
                      )
                    ) : cancellable ? (
                      <div className="stack" style={{ gap: '0.8rem', marginTop: '1.2rem' }}>
                        <div>
                          <label htmlFor={`cancel-reason-${booking.id}`} className="visually-hidden">Cancellation reason (optional)</label>
                          <input 
                            id={`cancel-reason-${booking.id}`}
                            type="text" 
                            className="text-input" 
                            placeholder="Optional: reason for cancellation" 
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            style={{ width: '100%', padding: '0.62rem 0.7rem', borderRadius: 'var(--r-md)', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div className="dialog-actions">
                          <ConfirmButton
                            className="small danger"
                            confirmLabel="Cancel this booking?"
                            disabled={busyId === booking.id}
                            onConfirm={() => void cancel(booking)}
                          >
                            {busyId === booking.id ? 'Cancelling…' : 'Cancel booking'}
                          </ConfirmButton>
                        </div>
                      </div>
                    ) : !isRequest && booking.status === 'CONFIRMED' ? (
                      <p className="small muted">
                        This booking has already started and can no longer be cancelled from here.
                      </p>
                    ) : !isRequest && booking.status === 'CANCELLED' && oversees ? (
                      <div className="dialog-actions" style={{ marginTop: '1.2rem', gap: '0.5rem' }}>
                        <ConfirmButton
                          className="small"
                          confirmLabel="Reapprove this booking?"
                          disabled={busyId === booking.id}
                          onConfirm={() => void reapprove(booking)}
                        >
                          {busyId === booking.id ? 'Reapproving…' : 'Reapprove booking'}
                        </ConfirmButton>
                        <ConfirmButton
                          className="small danger"
                          confirmLabel="Delete permanently?"
                          disabled={busyId === booking.id}
                          onConfirm={() => void permanentlyDelete(booking)}
                        >
                          {busyId === booking.id ? 'Deleting…' : 'Delete permanently'}
                        </ConfirmButton>
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {uploadFor && (
        <RecordingDialog
          booking={uploadFor}
          profile={profile}
          onClose={() => setUploadFor(null)}
          onUploaded={() => void bookings.reload()}
        />
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
