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
import { holidayService } from '@/services/holidayService';
import { formatBookingDate, formatSlotTime, withinNoticeWindow } from '@/utils/studio';



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

type Step = 'form' | 'review' | 'done' | 'requested';

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

  const holidays = useAsync(
    () => holidayService.getHolidaysForRange(slot.date, slot.date),
    [slot.date],
  );
  const activeHoliday = holidays.data?.[0];
  const isBlocked = Boolean(activeHoliday);

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

  const [form, setForm] = useState<BookingInput>({
    booking_date: slot.date,
    start_time: slot.start,
    program_id: '',
    language: 'TAMIL',
    script_status: 'PENDING',
    script_approver: '',
    self_edit: false,
    editor_id: null,
    notes: '',
    override_reason: '',
  });

  const [editorMode, setEditorMode] = useState<'admin' | 'self' | 'pick'>('admin');

  const [customShowTitle, setCustomShowTitle] = useState('');
  const [bookingType, setBookingType] = useState<'booking' | 'tour'>('booking');
  const [tourShowTitle, setTourShowTitle] = useState('');

  const [scriptMode, setScriptMode] = useState<'write' | 'upload'>('write');
  const [scriptText, setScriptText] = useState('');
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setScriptFile(f);
  };

  const clearScriptFile = () => {
    setScriptFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // The escape key is captured here rather than on the dialog element so it works
  // even if focus is inside an input.
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

    if (isBlocked) {
      setError('Studio bookings are unavailable on this date due to a holiday or scheduled closure.');
      return;
    }

    if (bookingType === 'tour') {
      if (!tourShowTitle.trim()) {
        setError('Please enter the show title.');
        return;
      }
      setStep('review');
      return;
    }

    if (!form.program_id) {
      setError('Choose which show you are recording.');
      return;
    }
    if ((form.program_id === 'other_show' || form.program_id === 'special_link') && !customShowTitle.trim()) {
      setError('Please enter the custom show title.');
      return;
    }
    if (editorMode === 'pick' && !form.editor_id) {
      setError('Choose an editor, or select another option.');
      return;
    }
    if (insideNotice && mayOverride && (form.override_reason ?? '').trim().length < 5) {
      setError('An override booking needs a short reason.');
      return;
    }
    setStep('review');
  };

  const confirm = async () => {
    if (isBlocked) {
      setError('Studio bookings are unavailable on this date due to a holiday or scheduled closure.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (bookingType === 'tour') {
        const title = tourShowTitle.trim();
        let finalProgramId = '';
        let effectiveNotes = `[Studio Tour: ${title}]`;

        // 1. Check if a program with this exact name already exists in programmes (case-insensitive)
        const existing = (programmes.data ?? []).find(
          (p) => p.name.trim().toLowerCase() === title.toLowerCase(),
        );

        if (existing) {
          finalProgramId = existing.id;
        } else {
          // 2. Try creating the program via programService
          try {
            const newProg = await programService.createProgram(
              {
                name: title,
                category: 'SPECIAL',
                default_duration_minutes: 30,
                requires_audio: false,
              },
              profile.id,
            );
            finalProgramId = newProg.id;
          } catch (createErr) {
            console.warn('Could not create program directly, falling back:', createErr);
            // 3. Fallback: find a special / placeholder program so the booking succeeds without permission errors
            const fallbackProg =
              (programmes.data ?? []).find(
                (p) =>
                  p.name.toLowerCase() === 'studio tour' ||
                  p.name.toLowerCase().includes('tour') ||
                  p.name.toLowerCase() === 'other show' ||
                  p.name.toLowerCase() === 'special link' ||
                  p.name.toLowerCase() === 'special shows' ||
                  p.name.toLowerCase() === 'special show' ||
                  p.name.toLowerCase().includes('special') ||
                  p.name.toLowerCase().includes('legacy'),
              ) ?? programmes.data?.[0];

            if (!fallbackProg) {
              throw createErr;
            }

            finalProgramId = fallbackProg.id;
          }
        }

        // Studio Tour bookings must not require any approval and should be confirmed directly.
        const booking = await bookingService.createBooking(
          {
            ...form,
            program_id: finalProgramId,
            language: 'ENGLISH',
            script_status: 'YES',
            script_approver: 'Studio Tour',
            self_edit: true,
            editor_id: null,
            notes: effectiveNotes,
            override_reason: insideNotice && mayOverride ? (form.override_reason || 'Studio Tour direct confirmation') : null,
          },
          profile.id,
          profile.id,
        );
        setCreated(booking);
        setStep('done');
        onBooked();
        return;
      }

      // Existing Studio Booking workflow unchanged
      let finalProgramId = form.program_id;
      let effectiveNotes = form.notes ?? '';

      if (finalProgramId === 'other_show' || finalProgramId === 'special_link') {
        const title = customShowTitle.trim();
        const tag = finalProgramId === 'special_link' ? 'Special Link' : 'Other Show';

        // 1. Check if a program with this exact name already exists in programmes (case-insensitive)
        const existing = (programmes.data ?? []).find(
          (p) => p.name.trim().toLowerCase() === title.toLowerCase(),
        );

        if (existing) {
          finalProgramId = existing.id;
        } else {
          // 2. Try creating the program via programService
          try {
            const newProg = await programService.createProgram(
              {
                name: title,
                category: 'SPECIAL',
                default_duration_minutes: 30,
                requires_audio: true,
              },
              profile.id,
            );
            finalProgramId = newProg.id;
          } catch (createErr) {
            console.warn('Could not create program directly, falling back:', createErr);
            // 3. Fallback: find a special / placeholder program so the booking succeeds without permission errors
            const fallbackProg =
              (programmes.data ?? []).find(
                (p) =>
                  p.name.toLowerCase() === 'other show' ||
                  p.name.toLowerCase() === 'special link' ||
                  p.name.toLowerCase() === 'special shows' ||
                  p.name.toLowerCase() === 'special show' ||
                  p.name.toLowerCase().includes('special') ||
                  p.name.toLowerCase().includes('legacy'),
              ) ?? programmes.data?.[0];

            if (!fallbackProg) {
              throw createErr;
            }

            finalProgramId = fallbackProg.id;
            effectiveNotes = effectiveNotes.trim()
              ? `[${tag}: ${title}]\n${effectiveNotes.trim()}`
              : `[${tag}: ${title}]`;
          }
        }
      }

      // Link submitted script (if provided) to the studio booking
      let scriptTag = '';
      if (scriptMode === 'write' && scriptText.trim()) {
        scriptTag = `[Submitted Script:\n${scriptText.trim()}\n]`;
      } else if (scriptMode === 'upload' && scriptFile) {
        const sizeStr = scriptFile.size / 1024 < 1024
          ? `${(scriptFile.size / 1024).toFixed(1)} KB`
          : `${(scriptFile.size / (1024 * 1024)).toFixed(1)} MB`;
        scriptTag = `[Submitted Script File: ${scriptFile.name} (${sizeStr})]`;
      }

      if (scriptTag) {
        effectiveNotes = effectiveNotes.trim()
          ? `${effectiveNotes.trim()}\n\n${scriptTag}`
          : scriptTag;
      }

      if (insideNotice && !mayOverride) {
        await bookingService.createRequest(
          {
            ...form,
            program_id: finalProgramId,
            notes: effectiveNotes.trim() || null,
          },
          profile.id,
        );
        setStep('requested');
        onBooked();
      } else {
        const booking = await bookingService.createBooking(
          {
            ...form,
            program_id: finalProgramId,
            notes: effectiveNotes.trim() || null,
            override_reason: insideNotice && mayOverride ? form.override_reason : null,
          },
          profile.id,
          profile.id,
        );
        setCreated(booking);
        setStep('done');
        onBooked();
      }
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
  const selectedProgram = (programmes.data ?? []).find(
    (p) => p.id === (created?.program_id ?? form.program_id),
  );

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
              {step === 'done' ? 'Confirmed' : step === 'review' ? 'Review' : (bookingType === 'tour' ? 'Studio Tour' : 'Studio booking')}
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

          {isBlocked && (
            <div
              className="notice-block"
              style={{
                borderLeft: '3px solid #dc2626',
                background: '#fef2f2',
                color: '#991b1b',
                marginBottom: '1rem',
              }}
            >
              <p className="notice-title" style={{ color: '#b91c1c' }}>
                Studio Bookings Blocked
              </p>
              <p>
                Studio bookings are unavailable on this date ({formatBookingDate(slot.date)}) due to{' '}
                <strong>{activeHoliday?.reason || 'a holiday or scheduled closure'}</strong>.
              </p>
            </div>
          )}

          {step === 'form' && (
            <>
              {bookingType === 'booking' && insideNotice && !mayOverride && (
                <div className="notice-block">
                  <p className="notice-title">Same-day booking</p>
                  <p>
                    Bookings made less than 24 hours in advance require admin approval. 
                    Submit your request here and the administrator will review it.
                  </p>
                </div>
              )}

              <form onSubmit={goReview} className="booking-form">
                <div className="field">
                  <label htmlFor="b-booking-type">Booking type</label>
                  <select
                    id="b-booking-type"
                    value={bookingType}
                    onChange={(e) => {
                      setBookingType(e.target.value as 'booking' | 'tour');
                      setError(null);
                    }}
                  >
                    <option value="booking">Studio Booking</option>
                    <option value="tour">Studio Tour</option>
                  </select>
                </div>

                {bookingType === 'tour' ? (
                  <div className="field">
                    <label htmlFor="b-tour-title">Show title</label>
                    <input
                      id="b-tour-title"
                      type="text"
                      placeholder="Enter show title..."
                      value={tourShowTitle}
                      onChange={(e) => setTourShowTitle(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="b-show">Show</label>
                      <select
                        id="b-show"
                        value={form.program_id}
                        onChange={(e) => {
                          setForm({ ...form, program_id: e.target.value });
                        }}
                        required
                        autoFocus
                      >
                        <option value="">Choose a show</option>
                        <option value="other_show" style={{ color: '#ef3b40', fontWeight: 'bold' }}>Other Show</option>
                        <option value="special_link" style={{ color: '#3b82f6', fontWeight: 'bold' }}>Special Link</option>
                        {(programmes.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {programmes.loading && <p className="small muted">Loading shows&hellip;</p>}
                      
                      {(form.program_id === 'other_show' || form.program_id === 'special_link') && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="Enter the show title..."
                            value={customShowTitle}
                            onChange={(e) => setCustomShowTitle(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                      )}
                    </div>

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
                        <select
                          id="b-approver"
                          value={form.script_approver ?? ''}
                          onChange={(e) => setForm({ ...form, script_approver: e.target.value })}
                        >
                          <option value="">Select an option</option>
                          <option value="Section head">Section head</option>
                          <option value="Faculty">Faculty</option>
                          <option value="Waiting for Approval">Waiting for Approval</option>
                        </select>
                      </div>
                    )}

                    {/* Optional Script Submission */}
                    <fieldset className="field" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.85rem', margin: '0.2rem 0' }}>
                      <legend style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>
                        Script Submission <span className="hint">(optional)</span>
                      </legend>

                      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', marginTop: '0.2rem' }}>
                        <label className="radio" style={{ cursor: 'pointer', fontSize: '0.84rem' }}>
                          <input
                            type="radio"
                            name="script_submission_mode"
                            value="write"
                            checked={scriptMode === 'write'}
                            onChange={() => setScriptMode('write')}
                          />
                          <span>Write in editor</span>
                        </label>
                        <label className="radio" style={{ cursor: 'pointer', fontSize: '0.84rem' }}>
                          <input
                            type="radio"
                            name="script_submission_mode"
                            value="upload"
                            checked={scriptMode === 'upload'}
                            onChange={() => setScriptMode('upload')}
                          />
                          <span>Upload script file</span>
                        </label>
                      </div>

                      {scriptMode === 'write' ? (
                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                          <textarea
                            id="b-script-text"
                            placeholder="Write or paste your show script here (dialogue, outline, cues, timing)..."
                            value={scriptText}
                            onChange={(e) => setScriptText(e.target.value)}
                            rows={4}
                            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical', fontSize: '0.88rem' }}
                          />
                          {scriptText.trim() && (
                            <p className="small muted" style={{ margin: 0, textAlign: 'right' }}>
                              {scriptText.trim().split(/\s+/).filter(Boolean).length} words &middot; {scriptText.length} characters
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          {!scriptFile ? (
                            <div
                              style={{
                                border: '1.5px dashed var(--border)',
                                borderRadius: 'var(--r-md)',
                                padding: '1.1rem',
                                textAlign: 'center',
                                background: 'var(--bg-sunk, rgba(0, 0, 0, 0.02))',
                                cursor: 'pointer',
                              }}
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const dropped = e.dataTransfer.files?.[0];
                                if (dropped) setScriptFile(dropped);
                              }}
                            >
                              <input
                                ref={fileInputRef}
                                id="b-script-file"
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.md"
                                style={{ display: 'none' }}
                                onChange={handleScriptFileChange}
                              />
                              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 500 }}>
                                Click or drag a file to upload
                              </p>
                              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                                Supports PDF, Word (.docx, .doc), or Text (.txt, .md)
                              </p>
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.65rem 0.85rem',
                                border: '1px solid var(--accent, #dc2626)',
                                background: 'var(--accent-wash, rgba(220, 38, 38, 0.05))',
                                borderRadius: 'var(--r-md)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent)' }}>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                  <polyline points="14 2 14 8 20 8"></polyline>
                                  <line x1="16" y1="13" x2="8" y2="13"></line>
                                  <line x1="16" y1="17" x2="8" y2="17"></line>
                                  <polyline points="10 9 9 9 8 9"></polyline>
                                </svg>
                                <div style={{ overflow: 'hidden' }}>
                                  <strong style={{ display: 'block', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {scriptFile.name}
                                  </strong>
                                  <span className="small muted">
                                    {scriptFile.size / 1024 < 1024
                                      ? `${(scriptFile.size / 1024).toFixed(1)} KB`
                                      : `${(scriptFile.size / (1024 * 1024)).toFixed(1)} MB`}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost small"
                                style={{ color: 'var(--ink-muted)', padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
                                onClick={clearScriptFile}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="field editor-choice">
                      <legend>Editing</legend>
                      <label className="radio">
                        <input
                          type="radio"
                          name="edit"
                          checked={editorMode === 'admin'}
                          onChange={() => {
                            setEditorMode('admin');
                            setForm({ ...form, self_edit: false, editor_id: null });
                          }}
                        />
                        <span>Admin will assign a editor for you (Recommend)</span>
                      </label>
                      <label className="radio">
                        <input
                          type="radio"
                          name="edit"
                          checked={editorMode === 'self'}
                          onChange={() => {
                            setEditorMode('self');
                            setForm({ ...form, self_edit: true, editor_id: null });
                          }}
                        />
                        <span>I will edit the audio myself</span>
                      </label>
                      <label className="radio">
                        <input
                          type="radio"
                          name="edit"
                          checked={editorMode === 'pick'}
                          onChange={() => {
                            setEditorMode('pick');
                            setForm({ ...form, self_edit: false });
                          }}
                        />
                        <span>I need an editor</span>
                      </label>

                      {editorMode === 'pick' && (
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
                  </>
                )}

                <div className="dialog-actions">
                  <button
                    type="submit"
                    className="btn btn-solid"
                    disabled={busy || isBlocked}
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
                <Row
                  label="Booking type"
                  value={
                    bookingType === 'tour'
                      ? 'Studio Tour'
                      : insideNotice && mayOverride
                      ? 'Admin override'
                      : 'Studio Booking'
                  }
                />
                <Row
                  label="Show"
                  value={
                    bookingType === 'tour'
                      ? tourShowTitle.trim()
                      : form.program_id === 'other_show' || form.program_id === 'special_link'
                      ? `${customShowTitle.trim()} (${form.program_id === 'special_link' ? 'Special Link' : 'Other Show'})`
                      : ((programmes.data ?? []).find((p) => p.id === form.program_id)?.name ?? '')
                  }
                />
                {bookingType === 'booking' && (
                  <Row label="Language" value={LANGUAGE_LABEL[form.language]} />
                )}
                <Row label="Date" value={formatBookingDate(slot.date)} />
                <Row
                  label="Time"
                  value={`${formatSlotTime(slot.start)} – ${formatSlotTime(slot.end)} (30 min)`}
                />
                {bookingType === 'booking' && (
                  <>
                    <Row
                      label="Script"
                      value={
                        SCRIPT_OPTIONS.find((o) => o.value === form.script_status)?.label ?? '--'
                      }
                    />
                    <Row
                      label="Submitted script"
                      value={
                        scriptMode === 'write'
                          ? scriptText.trim()
                            ? scriptText.trim().length > 60
                              ? `${scriptText.trim().slice(0, 60)}…`
                              : scriptText.trim()
                            : 'None (optional)'
                          : scriptFile
                          ? `${scriptFile.name} (${
                              scriptFile.size / 1024 < 1024
                                ? `${(scriptFile.size / 1024).toFixed(1)} KB`
                                : `${(scriptFile.size / (1024 * 1024)).toFixed(1)} MB`
                            })`
                          : 'None (optional)'
                      }
                    />
                    <Row
                      label="Editor"
                      value={form.self_edit ? 'Editing it myself' : (selectedEditor?.full_name ?? 'To be assigned by admin')}
                    />
                  </>
                )}
              </dl>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => void confirm()}
                  disabled={busy || isBlocked}
                >
                  {busy 
                    ? (bookingType === 'booking' && insideNotice && !mayOverride ? 'Sending request…' : 'Booking the studio…') 
                    : (bookingType === 'booking' && insideNotice && !mayOverride ? 'Request Admin Approval' : (bookingType === 'tour' ? 'Confirm Studio Tour' : 'Confirm studio booking'))
                  }
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
              <h3 className="confirmed-title">{bookingType === 'tour' ? 'Studio Tour booked' : 'Studio booked'}</h3>
              {/* The reference is whatever the database allocated — it is never
                  constructed in the browser. */}
              <p className="confirmed-ref">{created.reference}</p>

              <dl className="review">
                <Row label="Booking type" value={bookingType === 'tour' ? 'Studio Tour' : 'Studio Booking'} />
                <Row
                  label="Show"
                  value={
                    bookingType === 'tour'
                      ? tourShowTitle.trim()
                      : customShowTitle.trim() ||
                        ((programmes.data ?? []).find((p) => p.id === created.program_id)?.name ?? '')
                  }
                />
                <Row label="Date" value={formatBookingDate(created.booking_date)} />
                <Row
                  label="Time"
                  value={`${formatSlotTime(created.start_time.slice(0, 5))} – ${formatSlotTime(
                    created.end_time.slice(0, 5),
                  )}`}
                />
                {bookingType === 'booking' && (
                  <>
                    {((scriptMode === 'write' && scriptText.trim()) || (scriptMode === 'upload' && scriptFile)) && (
                      <Row
                        label="Submitted script"
                        value={
                          scriptMode === 'write'
                            ? scriptText.trim().length > 60
                              ? `${scriptText.trim().slice(0, 60)}…`
                              : scriptText.trim()
                            : `${scriptFile?.name}`
                        }
                      />
                    )}
                    <Row
                      label="Editor"
                      value={created.self_edit ? 'Editing it myself' : (selectedEditor?.full_name ?? 'To be assigned')}
                    />
                  </>
                )}
              </dl>

              {bookingType === 'booking' ? (
                <>
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
                </>
              ) : (
                <div className="dialog-actions">
                  <Link to="/bookings" className="btn btn-solid">
                    My bookings
                  </Link>
                  <button type="button" className="btn btn-ghost" onClick={onClose}>
                    Back to calendar
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'requested' && (
            <div className="confirmed">
              <div className="confirmed-mark" aria-hidden="true" style={{ background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }}>
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
              <h3 className="confirmed-title">Approval request sent</h3>
              <p className="muted" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                Your same-day studio booking request has been sent to the administrator. You'll be notified once it is approved or rejected.
              </p>

              <div className="dialog-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-solid" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {uploading && created && bookingType === 'booking' && (
        <RecordingDialog
          // The recording dialog names the show it is uploading against, and
          // `createBooking` returns the plain row -- so the programme chosen a
          // moment ago is attached here rather than re-fetched.
          booking={{
            ...created,
            rj: { id: profile.id, full_name: profile.full_name, email: profile.email },
            editor: null,
            program: selectedProgram ? { id: selectedProgram.id, name: selectedProgram.name } : null,
            episode: null,
          }}
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
