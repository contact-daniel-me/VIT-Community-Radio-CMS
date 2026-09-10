import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, ConfirmButton, Empty, Loading, PageHeader } from '@/components/ui';
import { bookingService, type BookingWithPeople } from '@/services/bookingService';
import { RecordingDialog } from '@/components/studio/RecordingDialog';
import { errorMessage } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/utils/datetime';
import { formatBookingDate, formatSlotTime, slotStartsAt } from '@/utils/studio';
import type { BookingStatus } from '@/types/database';

type Tab = 'upcoming' | 'past' | 'cancelled';

const STATUS_TONE: Record<BookingStatus, string> = {
  CONFIRMED: 'badge-green',
  CANCELLED: 'badge-grey',
  COMPLETED: 'badge-blue',
  NO_SHOW: 'badge-amber',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No show',
};

export function MyBookingsPage() {
  const profile = useCurrentUser();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<BookingWithPeople | null>(null);

  // Admins and producers oversee the whole studio; everyone else sees their own.
  const oversees = can.manageProgram(profile.role);
  const bookings = useAsync(
    () => (oversees ? bookingService.getAllBookings() : bookingService.getMyBookings(profile.id)),
    [profile.id, oversees],
  );

  const groups = useMemo(() => {
    const all = bookings.data ?? [];
    const now = Date.now();
    const started = (b: BookingWithPeople) =>
      slotStartsAt(b.booking_date, b.start_time.slice(0, 5)).getTime() <= now;

    return {
      upcoming: all
        .filter((b) => b.status === 'CONFIRMED' && !started(b))
        .sort((a, b) => a.booking_date.localeCompare(b.booking_date)),
      past: all.filter((b) => b.status !== 'CANCELLED' && started(b)),
      cancelled: all.filter((b) => b.status === 'CANCELLED'),
    };
  }, [bookings.data]);

  const cancel = async (booking: BookingWithPeople) => {
    setBusyId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await bookingService.cancelBooking(booking.id);
      setNotice(`${booking.reference} cancelled. The slot is free for someone else.`);
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
        {(['upcoming', 'past', 'cancelled'] as Tab[]).map((key) => (
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
            ) : tab === 'past' ? (
              'No past sessions yet.'
            ) : (
              'No cancelled bookings.'
            )}
          </Empty>
        </section>
      ) : (
        <div className="booking-list">
          {list.map((booking) => {
            const open = openId === booking.id;
            const startsAt = slotStartsAt(booking.booking_date, booking.start_time.slice(0, 5));
            // Available as soon as the booking exists: an RJ may have recorded
            // before the slot, and waiting for the clock only gets in the way.
            const canUpload = booking.status !== 'CANCELLED';
            const cancellable =
              booking.status === 'CONFIRMED' &&
              (startsAt.getTime() > Date.now() || oversees) &&
              (booking.rj_id === profile.id || oversees);

            return (
              <article key={booking.id} className="booking-card">
                <div className="booking-main">
                  <div className="booking-when">
                    <span className="booking-date">
                      {formatBookingDate(booking.booking_date, { short: true })}
                    </span>
                    <span className="booking-time">
                      {formatSlotTime(booking.start_time.slice(0, 5))} &ndash;{' '}
                      {formatSlotTime(booking.end_time.slice(0, 5))}
                    </span>
                  </div>

                  <div className="booking-what">
                    <h3 className="booking-show">{booking.show_name}</h3>
                    <p className="booking-meta">
                      <span className="booking-ref">{booking.reference}</span>
                      <span className="dot">&middot;</span>
                      {booking.language.charAt(0) + booking.language.slice(1).toLowerCase()}
                      {oversees && booking.rj && (
                        <>
                          <span className="dot">&middot;</span>
                          {booking.rj.full_name}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="booking-side">
                    <span className={`badge ${STATUS_TONE[booking.status]}`}>
                      {STATUS_LABEL[booking.status]}
                    </span>
                    {booking.origin === 'ADMIN_OVERRIDE' && (
                      <span className="badge badge-amber">Override</span>
                    )}
                    {/* The upload is the whole point of the page once a session
                        has happened, so it sits on the card rather than behind
                        the Details toggle. */}
                    {canUpload && booking.rj_id === profile.id && (
                      booking.episode_id ? (
                        <Link
                          to={`/episodes/${booking.episode_id}`}
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
                      onClick={() => setOpenId(open ? null : booking.id)}
                    >
                      {open ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="booking-detail">
                    <dl className="review">
                      <Detail label="Reference" value={booking.reference} />
                      <Detail label="Date" value={formatBookingDate(booking.booking_date)} />
                      <Detail
                        label="Time"
                        value={`${formatSlotTime(booking.start_time.slice(0, 5))} – ${formatSlotTime(
                          booking.end_time.slice(0, 5),
                        )} (30 min)`}
                      />
                      <Detail label="Status" value={STATUS_LABEL[booking.status]} />
                      <Detail
                        label="Editor"
                        value={
                          booking.self_edit
                            ? 'Editing it themselves'
                            : (booking.editor?.full_name ?? 'Not assigned yet')
                        }
                      />
                      <Detail
                        label="Script"
                        value={
                          booking.script_status === 'YES'
                            ? `Approved${booking.script_approver ? ` by ${booking.script_approver}` : ''}`
                            : booking.script_status === 'PENDING'
                              ? 'Pending approval'
                              : 'Not approved'
                        }
                      />
                      {booking.notes && <Detail label="Notes" value={booking.notes} />}
                      {booking.override_reason && (
                        <Detail label="Override reason" value={booking.override_reason} />
                      )}
                      <Detail label="Created" value={formatDateTime(booking.created_at)} />
                    </dl>

                    {cancellable ? (
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
                    ) : booking.status === 'CONFIRMED' ? (
                      <p className="small muted">
                        This slot has already started, so it can no longer be cancelled here.
                        Contact an administrator if something needs changing.
                      </p>
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
