import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banner } from '@/components/ui';
import { bookingService, type BookingInput } from '@/services/bookingService';
import { programService } from '@/services/programService';
import { RecordingDialog } from './RecordingDialog';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/errors';
import { can } from '@/lib/permissions';
import type { ProfileRow, ScriptApproval, ShowLanguage, StudioBookingRow } from '@/types/database';
import { formatBookingDate, formatSlotTime, withinNoticeWindow } from '@/utils/studio';

/** Sentinel for the free-text escape hatch. Cannot clash with a programme name. */
const OTHER = '__other__';

const LANGUAGES: ShowLanguage[] = ['TAMIL', 'ENGLISH', 'HINDI', 'TELUGU', 'MALAYALAM'];
const LANGUAGE_LABEL: Record<ShowLanguage, string> = {
  TAMIL: 'Tamil',
  ENGLISH: 'English',
  HINDI: 'Hindi',
  TELUGU: 'Telugu',
  MALAYALAM: 'Malayalam',
};

const SCRIPT_OPTIONS: { value: ScriptApproval; label: string }[] = [
  { value: 'YES', label: 'Yes, approved' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'NO', label: 'Not yet' },
];

type Step = 'form' | 'review' | 'done';

/**
 * The booking flow: form, review, confirmation.
 *
 * Nothing here decides whether a booking is legal. The 24-hour notice, the
 * editor checks and the slot lock all live in the database; this only chooses
 * which explanation to show and hands the refusal back in plain words.
 */
export function BookingDialog({
  slot,
  profile,
  onClose,
  onBooked,
}: {
  slot: { date: string; start: string; end: string };
  profile: ProfileRow;
  onClose: () => void;
  onBooked: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StudioBookingRow | null>(null);
  const [uploading, setUploading] = useState(false);

  const insideNotice = withinNoticeWindow(slot.date, slot.start);
  const mayOverride = can.overrideBookingWindow(profile.role);

  const editors = useAsync(
    async () => {
      const [list, load] = await Promise.all([
        bookingService.getEditors(),
        bookingService.getEditorLoad().catch(() => ({}) as Record<string, number>),
      ]);
      // An RJ can never be their own editor; the database refuses it too.
      return { list: list.filter((e) => e.id !== profile.id), load };
    },
    [profile.id],
  );

  // The station's own shows, straight from the Fixed Point Chart line-up.
  const programmes = useAsync(() => programService.getPrograms({ activeOnly: true }), []);

  // Which entry the select is showing: a programme name, or the Other sentinel.
  const [showChoice, setShowChoice] = useState('');

  const [form, setForm] = useState<BookingInput>({
    booking_date: slot.date,
    start_time: slot.start,
    show_name: '',
    language: 'TAMIL',
    script_status: 'PENDING',
    script_approver: '',
    self_edit: true,
    editor_id: null,
    notes: '',
    override_reason: '',
  });

  // Focus the panel when it opens, and close it on Escape.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'done') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  const goReview = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!showChoice) {
      setError('Choose which show you are recording.');
      return;
    }
    if (form.show_name.trim().length < 2) {
      setError(
        showChoice === OTHER
          ? 'Enter the name of the show.'
          : 'Choose which show you are recording.',
      );
      return;
    }
    if (!form.self_edit && !form.editor_id) {
      setError('Choose an editor, or select "I will edit it myself".');
      return;
    }
    if (insideNotice && mayOverride && (form.override_reason ?? '').trim().length < 5) {
      setError('An override booking needs a short reason.');
      return;
    }
    setStep('review');
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const booking = await bookingService.createBooking(
        {
          ...form,
          // Only an admin may send an override; anyone else omits it and the
          // database applies the ordinary 24-hour rule.
          override_reason: insideNotice && mayOverride ? form.override_reason : null,
        },
        profile.id,
        profile.id,
      );
      setCreated(booking);
      setStep('done');
      // Refresh the calendar behind the panel so the slot shows as taken.
      onBooked();
    } catch (cause) {
      setError(errorMessage(cause));
      // A conflict means our view of the week is stale: go back and re-read.
      setStep('form');
      onBooked();
    } finally {
      setBusy(false);
    }
  };

  const selectedEditor = (editors.data?.list ?? []).find((e) => e.id === form.editor_id);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && step !== 'done' && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="dialog-head">
          <div>
            <p className="dialog-eyebrow">
              {step === 'done' ? 'Confirmed' : step === 'review' ? 'Review' : 'Studio booking'}
            </p>
            <h2 id="booking-title" className="dialog-title">
              {formatBookingDate(slot.date)}
            </h2>
            <p className="dialog-slot">
              {formatSlotTime(slot.start)} &ndash; {formatSlotTime(slot.end)}
              <span className="dialog-dot">&middot;</span>30 minutes
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          {step === 'form' && (
            <>
              {insideNotice && !mayOverride && (
                <div className="notice-block">
                  <p className="notice-title">Need a studio slot today?</p>
                  <p>
                    Studio bookings must be made at least 24 hours in advance. Same-day
                    bookings require admin approval &mdash; please contact the VIT Community
                    Radio administrator.
                  </p>
                  <a className="btn btn-outline" href="mailto:radio@vit.ac.in?subject=Same-day%20studio%20request">
                    Contact admin
                  </a>
                </div>
              )}

              <form onSubmit={goReview} className="booking-form">
                <div className="field">
                  <label htmlFor="b-show">Show</label>
                  <select
                    id="b-show"
                    value={showChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setShowChoice(value);
                      // Picking a listed show fills the name; Other clears it so
                      // the RJ types their own.
                      setForm({ ...form, show_name: value === OTHER ? '' : value });
                    }}
                    required
                    autoFocus
                  >
                    <option value="">Choose a show</option>
                    {(programmes.data ?? []).map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value={OTHER}>Other &mdash; not listed</option>
                  </select>
                  {programmes.loading && <p className="small muted">Loading shows&hellip;</p>}
                </div>

                {showChoice === OTHER && (
                  <div className="field">
                    <label htmlFor="b-show-other">
                      Show name <span className="hint">(not on the chart)</span>
                    </label>
                    <input
                      id="b-show-other"
                      value={form.show_name}
                      onChange={(e) => setForm({ ...form, show_name: e.target.value })}
                      maxLength={160}
                      placeholder="e.g. Semester Special"
                      required
                    />
                  </div>
                )}

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="b-lang">Primary language</label>
                    <select
                      id="b-lang"
                      value={form.language}
                      onChange={(e) =>
                        setForm({ ...form, language: e.target.value as ShowLanguage })
                      }
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {LANGUAGE_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="b-script">Script approved by Section Head?</label>
                    <select
                      id="b-script"
                      value={form.script_status}
                      onChange={(e) =>
                        setForm({ ...form, script_status: e.target.value as ScriptApproval })
                      }
                    >
                      {SCRIPT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.script_status === 'YES' && (
                  <div className="field">
                    <label htmlFor="b-approver">Approved by</label>
                    <input
                      id="b-approver"
                      value={form.script_approver ?? ''}
                      onChange={(e) => setForm({ ...form, script_approver: e.target.value })}
                      placeholder="Section head or faculty name"
                      maxLength={120}
                    />
                  </div>
                )}

                <fieldset className="field editor-choice">
                  <legend>Editing</legend>
                  <label className="radio">
                    <input
                      type="radio"
                      name="edit"
                      checked={form.self_edit}
                      onChange={() => setForm({ ...form, self_edit: true, editor_id: null })}
                    />
                    <span>I will edit the audio myself</span>
                  </label>
                  <label className="radio">
                    <input
                      type="radio"
                      name="edit"
                      checked={!form.self_edit}
                      onChange={() => setForm({ ...form, self_edit: false })}
                    />
                    <span>I need an editor</span>
                  </label>

                  {!form.self_edit && (
                    <div className="editor-list">
                      {editors.loading ? (
                        <p className="muted small">Loading editors&hellip;</p>
                      ) : (editors.data?.list ?? []).length === 0 ? (
                        <p className="muted small">
                          No editors are available yet. Choose &ldquo;I will edit it
                          myself&rdquo;, or ask an administrator to assign one later.
                        </p>
                      ) : (
                        (editors.data?.list ?? []).map((editor) => (
                          <label
                            key={editor.id}
                            className={`editor-option ${
                              form.editor_id === editor.id ? 'is-picked' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="editor"
                              checked={form.editor_id === editor.id}
                              onChange={() => setForm({ ...form, editor_id: editor.id })}
                            />
                            <span className="editor-name">{editor.full_name}</span>
                            <span className="editor-load">
                              {editors.data?.load[editor.id] ?? 0} assigned
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </fieldset>

                <div className="field">
                  <label htmlFor="b-notes">
                    Notes <span className="hint">(optional, station only)</span>
                  </label>
                  <textarea
                    id="b-notes"
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    maxLength={1000}
                  />
                </div>

                {insideNotice && mayOverride && (
                  <div className="field override-field">
                    <label htmlFor="b-override">
                      Override reason <span className="hint">(required inside 24 hours)</span>
                    </label>
                    <input
                      id="b-override"
                      value={form.override_reason ?? ''}
                      onChange={(e) => setForm({ ...form, override_reason: e.target.value })}
                      placeholder="e.g. Guest is only on campus today"
                      maxLength={500}
                    />
                    <p className="small muted">
                      This slot is inside the 24-hour window. Booking it is recorded as an
                      administrator override.
                    </p>
                  </div>
                )}

                <div className="dialog-actions">
                  <button
                    type="submit"
                    className="btn btn-solid"
                    disabled={insideNotice && !mayOverride}
                  >
                    Review booking
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={onClose}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'review' && (
            <>
              <dl className="review">
                <Row label="Show" value={form.show_name} />
                <Row label="Language" value={LANGUAGE_LABEL[form.language]} />
                <Row label="Date" value={formatBookingDate(slot.date)} />
                <Row
                  label="Time"
                  value={`${formatSlotTime(slot.start)} – ${formatSlotTime(slot.end)} (30 min)`}
                />
                <Row
                  label="Script"
                  value={
                    SCRIPT_OPTIONS.find((o) => o.value === form.script_status)?.label ?? '--'
                  }
                />
                <Row
                  label="Editor"
                  value={form.self_edit ? 'Editing it myself' : (selectedEditor?.full_name ?? '--')}
                />
                <Row
                  label="Booking type"
                  value={insideNotice && mayOverride ? 'Admin override' : 'Normal booking'}
                />
              </dl>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => void confirm()}
                  disabled={busy}
                >
                  {busy ? 'Booking the studio…' : 'Confirm studio booking'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep('form')}
                  disabled={busy}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {step === 'done' && created && (
            <div className="confirmed">
              <div className="confirmed-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 12.5l5.2 5.2L20 7"
                  />
                </svg>
              </div>
              <h3 className="confirmed-title">Studio booked</h3>
              {/* The reference is whatever the database allocated — it is never
                  constructed in the browser. */}
              <p className="confirmed-ref">{created.reference}</p>

              <dl className="review">
                <Row label="Show" value={created.show_name} />
                <Row label="Date" value={formatBookingDate(created.booking_date)} />
                <Row
                  label="Time"
                  value={`${formatSlotTime(created.start_time.slice(0, 5))} – ${formatSlotTime(
                    created.end_time.slice(0, 5),
                  )}`}
                />
                <Row
                  label="Editor"
                  value={created.self_edit ? 'Editing it myself' : (selectedEditor?.full_name ?? 'To be assigned')}
                />
              </dl>

              <p className="small muted">
                Recorded already? You can attach the audio now, or come back to it from
                My bookings.
              </p>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => setUploading(true)}
                >
                  Upload audio
                </button>
                <Link to="/bookings" className="btn btn-outline">
                  My bookings
                </Link>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Back to calendar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {uploading && created && (
        <RecordingDialog
          booking={created}
          profile={profile}
          onClose={() => setUploading(false)}
          onUploaded={onBooked}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
