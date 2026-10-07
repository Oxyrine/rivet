'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, Minus, Plus, X, AlertTriangle } from 'lucide-react';
import { getAllCommands } from '@/lib/offline/queue';
import type { ShiftJob } from '@/lib/mock-shifts';
import {
  MAX_MINUTES,
  MAX_NOTES,
  MAX_PART_QUANTITY,
  REPORT_CHECKLIST,
  ReportPayload,
  buildReportPayload,
  isWholeNumber,
  reportErrors,
  reportGaps,
} from '@/lib/report';

type PhotoType = 'before_photo' | 'after_photo';

interface ReportScreenProps {
  job: ShiftJob;
  deviceId: string;
  /** The report already went out or is waiting in the queue, so a second one would replace it. */
  alreadySubmitted: boolean;
  onPhoto: (event: React.ChangeEvent<HTMLInputElement>, type: PhotoType) => Promise<void>;
  onSubmit: (payload: ReportPayload) => Promise<void>;
  onClose: () => void;
}

const sectionTitle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  margin: '18px 0 8px',
};

const stepButton: React.CSSProperties = { width: 34, height: 34, padding: 0, justifyContent: 'center' };

export function ReportScreen({ job, deviceId, alreadySubmitted, onPhoto, onSubmit, onClose }: ReportScreenProps) {
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [photosTaken, setPhotosTaken] = useState<ReadonlySet<string>>(new Set());
  const [parts, setParts] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [minutes, setMinutes] = useState<number>(job.duration_minutes || 60);
  const [notes, setNotes] = useState('');
  const [newPart, setNewPart] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [touchedParts, setTouchedParts] = useState(false);

  const issued = useMemo(() => job.issued_parts || {}, [job.issued_parts]);
  const planned = useMemo(() => job.planned_parts || {}, [job.planned_parts]);

  // What this device already holds for the job: parts scanned and photos taken (queued or sent).
  const readDevice = useCallback(async () => {
    const commands = (await getAllCommands(deviceId)).filter((c) => c.job_id === job.id && c.status !== 'rejected');
    const counts: Record<string, number> = {};
    const photos = new Set<string>();
    for (const c of commands) {
      if (c.type === 'PartScanned') {
        const resource = c.payload?.resource || c.payload?.part_id;
        if (resource) counts[resource] = (counts[resource] || 0) + (Number(c.payload?.quantity) || 1);
      } else if (c.type === 'EvidenceAttached' && (c.payload?.type === 'before_photo' || c.payload?.type === 'after_photo')) {
        photos.add(c.payload.type);
      }
    }
    setScanned(counts);
    setPhotosTaken(photos);
  }, [deviceId, job.id]);

  useEffect(() => {
    readDevice();
    window.addEventListener('rivet:queue-change', readDevice);
    return () => window.removeEventListener('rivet:queue-change', readDevice);
  }, [readDevice]);

  // Start the part counts from what was scanned, else what the store issued, until the technician edits them.
  useEffect(() => {
    if (touchedParts) return;
    const next: Record<string, number> = {};
    for (const part of new Set([...Object.keys(planned), ...Object.keys(issued), ...Object.keys(scanned)])) {
      next[part] = scanned[part] ?? issued[part] ?? 0;
    }
    setParts(next);
  }, [planned, issued, scanned, touchedParts]);

  // A photo taken on this device is a fact, so tick its item; the rest are the technician's claim.
  useEffect(() => {
    setChecked((current) => {
      const next = new Set(current);
      for (const item of REPORT_CHECKLIST) {
        if (item.photo && photosTaken.has(item.photo)) next.add(item.id);
      }
      return next;
    });
  }, [photosTaken]);

  const draft = { parts, checked, minutes, notes };
  const errors = reportErrors(draft);
  const gaps = reportGaps(draft, issued, photosTaken);
  const partNames = Object.keys(parts).sort();

  const setQuantity = (part: string, quantity: number) => {
    setTouchedParts(true);
    setParts((current) => ({ ...current, [part]: Math.max(0, Math.min(MAX_PART_QUANTITY, quantity)) }));
  };

  const addPart = () => {
    const name = newPart.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(name)) {
      setProblem('Part codes use letters, numbers, dashes and underscores, for example HS-40.');
      return;
    }
    setProblem('');
    setTouchedParts(true);
    setParts((current) => (name in current ? current : { ...current, [name]: 0 }));
    setNewPart('');
  };

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (errors.length || sending) return;
    setSending(true);
    setProblem('');
    try {
      await onSubmit(buildReportPayload(draft));
      onClose();
    } catch (err: any) {
      setProblem(err?.message || 'The report could not be saved on this device.');
      setSending(false);
    }
  };

  const filledParts = partNames.filter((part) => parts[part] > 0);

  return (
    <div
      data-testid="report-screen"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
      onClick={onClose}
    >
      <div
        className="panel"
        role="dialog"
        aria-label={`Completion report for ${job.id}`}
        style={{ width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', background: 'var(--panel)', borderRadius: '4px', padding: '22px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={20} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Completion report · {job.id}</h2>
          </div>
          <button type="button" className="quiet-button" onClick={onClose} aria-label="Close report">
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>
          {job.machine_id} · {job.fault.replaceAll('_', ' ')}. The customer checks this report against the store ledger and your photos before accepting.
        </p>

        {alreadySubmitted && (
          <p role="status" data-testid="report-already-submitted" style={{ margin: '14px 0 0', padding: '10px 12px', background: 'var(--panel-alt)', border: '1px solid var(--green)', borderRadius: '3px', fontSize: '13px' }}>
            A report for this job is already queued or sent. Submitting again replaces it.
          </p>
        )}

        {step === 'edit' ? (
          <>
            <h3 style={sectionTitle}>Parts used</h3>
            {partNames.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No parts planned or issued. Add one below if you used any.</p>}
            {partNames.map((part) => (
              <div key={part} data-testid={`report-part-${part}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--line, #ddd)' }}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontFamily: 'var(--mono)' }}>{part}</b>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    planned {planned[part] ?? 0} · store issued {issued[part] ?? 0} · you scanned {scanned[part] ?? 0}
                  </div>
                </div>
                <button type="button" className="secondary-button" style={stepButton} aria-label={`One fewer ${part}`} onClick={() => setQuantity(part, parts[part] - 1)}>
                  <Minus size={14} />
                </button>
                <span data-testid={`report-part-${part}-qty`} style={{ minWidth: 28, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '16px' }}>{parts[part]}</span>
                <button type="button" className="secondary-button" style={stepButton} aria-label={`One more ${part}`} onClick={() => setQuantity(part, parts[part] + 1)}>
                  <Plus size={14} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <input
                value={newPart}
                onChange={(e) => setNewPart(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPart()}
                placeholder="Another part code, e.g. O-RING"
                aria-label="Add a part code"
                style={{ flex: 1 }}
              />
              <button type="button" className="secondary-button" onClick={addPart}>Add part</button>
            </div>

            <h3 style={sectionTitle}>Work done</h3>
            {REPORT_CHECKLIST.map((item) => {
              const photoMissing = item.photo && !photosTaken.has(item.photo);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, opacity: photoMissing ? 0.75 : 1 }}>
                    <input
                      type="checkbox"
                      data-testid={`report-check-${item.id}`}
                      checked={checked.has(item.id)}
                      disabled={!!item.photo && photosTaken.has(item.photo)}
                      onChange={() => toggle(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                  {item.photo && (
                    <>
                      <input
                        id={`report-${item.photo}-input`}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        data-testid={`report-${item.photo}-input`}
                        style={{ display: 'none' }}
                        onChange={(e) => onPhoto(e, item.photo as PhotoType)}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => (document.getElementById(`report-${item.photo}-input`) as HTMLInputElement | null)?.click()}
                      >
                        {photosTaken.has(item.photo) ? <CheckCircle2 size={14} /> : <Camera size={14} />}
                        {photosTaken.has(item.photo) ? ' Retake' : ' Take photo'}
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            <h3 style={sectionTitle}>Time and notes</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              Minutes worked
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MINUTES}
                step={1}
                data-testid="report-minutes"
                value={Number.isNaN(minutes) ? '' : minutes}
                onChange={(e) => setMinutes(e.target.value === '' ? NaN : Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '4px 0 10px' }}>
              The server measures work time from your check-in and check-out. A difference of more than 15 minutes is flagged to the customer.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={MAX_NOTES}
              rows={3}
              placeholder="Notes for the customer (what you found, what you replaced)"
              aria-label="Notes"
              data-testid="report-notes"
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>{notes.length}/{MAX_NOTES}</div>

            {(errors.length > 0 || problem) && (
              <div role="alert" style={{ marginTop: '10px', padding: '10px 12px', background: '#fdecea', color: '#b3261e', fontSize: '13px' }}>
                {[...errors, problem].filter(Boolean).map((text) => <div key={text}>{text}</div>)}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
              <button type="button" className="primary-button" data-testid="report-review-btn" disabled={errors.length > 0} onClick={() => setStep('review')}>
                Review report
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={sectionTitle}>This is what the customer will see</h3>
            <div style={{ fontSize: '13px', lineHeight: 1.6 }} data-testid="report-summary">
              <div><b>Parts:</b> {filledParts.length ? filledParts.map((part) => `${part} × ${parts[part]}`).join(', ') : 'none used'}</div>
              <div><b>Work done:</b> {REPORT_CHECKLIST.filter((item) => checked.has(item.id)).map((item) => item.label).join(', ') || 'nothing ticked'}</div>
              <div><b>Minutes worked:</b> {isWholeNumber(minutes, MAX_MINUTES) ? minutes : '-'}</div>
              <div><b>Notes:</b> {notes.trim() || 'none'}</div>
            </div>

            <h3 style={sectionTitle}>Checked before you submit</h3>
            {gaps.length === 0 ? (
              <p data-testid="report-no-gaps" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--green)' }}>
                <CheckCircle2 size={16} /> Nothing here should hold up acceptance.
              </p>
            ) : (
              gaps.map((gap) => (
                <div key={gap.text} data-testid="report-gap" style={{ display: 'flex', gap: '8px', padding: '8px 10px', margin: '6px 0', fontSize: '13px', background: gap.tone === 'critical' ? '#fdecea' : '#fff4e0', color: gap.tone === 'critical' ? '#8c1d18' : '#7a4b00' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{gap.text}</span>
                </div>
              ))
            )}
            <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
              You can still submit a truthful, incomplete report. It is saved on this device and sent when you are online.
            </p>

            {problem && <div role="alert" style={{ marginTop: '10px', padding: '10px 12px', background: '#fdecea', color: '#b3261e', fontSize: '13px' }}>{problem}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="quiet-button" onClick={() => setStep('edit')} disabled={sending}>Back</button>
              <button type="button" className="primary-button" data-testid="report-submit-btn" disabled={sending || errors.length > 0} onClick={submit}>
                {sending ? 'Saving…' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
