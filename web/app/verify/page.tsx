'use client';

import { useEffect, useState } from 'react';
import { Key, FileCheck, ShieldCheck, Download, Upload, CheckCircle2, AlertOctagon } from 'lucide-react';
import { api } from '@/lib/api';
// @ts-ignore JavaScript module shared with the standalone offline verifier.
import { verifyPackage } from '@/lib/proof-verifier';

export default function Verify() {
  const [job, setJob] = useState('J-2231');
  const [key, setKey] = useState('');
  const [pkg, setPkg] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('job');
    if (linked) setJob(linked);
    setKey(localStorage.getItem('hep-pinned-key') || '');
  }, []);

  const check = async (p: any) => {
    setPkg(p);
    try {
      const pinned = key || localStorage.getItem('hep-pinned-key') || '';
      setResult(await verifyPackage(p, pinned, JSON.parse(localStorage.getItem('hep-anchors') || '[]')));
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const download = (value: any, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    a.download = name;
    a.click();
  };

  return (
    <div className="verify-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CUSTOMER-HELD HISTORY</span>
          <h1>Trust you can check.</h1>
          <p className="muted">
            Verify the provider signature, event chain, SLA calculation, and the history you retained. File verification performs no network requests.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>1. Pin your onboarding key</h2>
        <p className="muted" style={{ marginBottom: '16px' }}>
          Compare the fingerprint against your service contract before pinning. A key from a package alone does not establish trust.
        </p>
        <textarea
          placeholder="Base64 public key from onboarding (e.g. MCowBQYDK2VwAyEA...)"
          value={key}
          onChange={e => setKey(e.target.value)}
          rows={3}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
        />
        <div className="toolbar" style={{ marginTop: '12px' }}>
          <button
            className="primary-button"
            onClick={() => {
              localStorage.setItem('hep-pinned-key', key.trim());
              setMessage('Onboarding key pinned to this browser.');
            }}
          >
            <Key size={15} /> Pin key
          </button>
          <button
            className="secondary-button"
            onClick={async () => {
              try {
                const x = await api<any>('/.well-known/rivet-keys.json');
                setKey(x.keys[0].public_key);
                setMessage('Published fingerprint: ' + x.keys[0].fingerprint + '. Compare with your contract before pinning.');
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            Show published key
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>2. Open a signed record</h2>
        <p className="muted" style={{ marginBottom: '16px' }}>
          Fetch directly from the server or inspect an exported JSON service package offline.
        </p>
        <div className="toolbar">
          <input
            value={job}
            onChange={e => setJob(e.target.value)}
            placeholder="Job ID (e.g. J-2231)"
            style={{ width: '180px' }}
          />
          <button
            className="primary-button"
            onClick={async () => {
              try {
                await check(await api(`/jobs/${job}/package`));
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            <FileCheck size={16} /> Load service package
          </button>
          <span style={{ color: 'var(--ink-2)', fontSize: '13px', margin: '0 4px' }}>or upload:</span>
          <input
            type="file"
            accept=".json"
            onChange={async e => {
              if (e.target.files?.[0]) {
                try {
                  await check(JSON.parse(await e.target.files[0].text()));
                } catch (x: any) {
                  setMessage(x.message);
                }
              }
            }}
            style={{ width: 'auto' }}
          />
        </div>
      </section>

      {result && (
        <section className="panel" style={{ borderLeft: result.valid ? '4px solid var(--positive)' : '4px solid var(--critical)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span className={`badge ${result.valid ? 'success' : 'danger'}`}>
              {result.valid ? 'SERVICE RECORD VERIFIED' : 'VERIFICATION FAILED'}
            </span>
          </div>

          <h2>{pkg.body.machine_id} · {pkg.body.job_id}</h2>

          <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {result.valid ? (
              <p style={{ color: 'var(--positive)', fontWeight: 500 }}>
                {result.anchored
                  ? '✓ Matches the history you previously retained.'
                  : '✓ Signature and internal chain valid. No previous customer-held head for this machine.'}
              </p>
            ) : (
              result.errors.map((x: string) => (
                <p key={x} className="error-banner" style={{ margin: '4px 0' }}>
                  {x}
                </p>
              ))
            )}

            {result.sla && (
              <p>
                SLA recomputed: <strong>{result.sla.met ? 'Met' : 'Missed'}</strong> · margin {result.sla.margin_minutes} minutes
              </p>
            )}
            <p>Customer acceptance: <strong>{pkg.body.acceptance}</strong></p>
            <p>Reconciliation: <strong>{pkg.body.reconciliation?.outcome || 'Clean'}</strong></p>
          </div>

          <div style={{ margin: '16px 0' }}>
            <span className="eyebrow">CHAIN HEAD FINGERPRINT</span>
            <pre>{result.head}</pre>
          </div>

          <div className="toolbar" style={{ marginTop: '16px' }}>
            <button
              className="primary-button"
              disabled={!result.valid}
              onClick={() => {
                const a = JSON.parse(localStorage.getItem('hep-anchors') || '[]');
                a.push({ machine_id: pkg.body.machine_id, machine_seq: pkg.body.events.length, machine_hash: pkg.body.head });
                localStorage.setItem('hep-anchors', JSON.stringify(a));
                setMessage('Verified head retained on this customer device.');
              }}
            >
              <ShieldCheck size={16} /> Remember verified head
            </button>
            <button className="secondary-button" onClick={() => download(pkg, `${job}-service-package.json`)}>
              <Download size={15} /> Download package
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>3. Keep your own history</h2>
        <p className="muted" style={{ marginBottom: '16px' }}>
          A fully rewritten and re-signed history can pass internal checks. A customer-held earlier head reveals any divergence.
        </p>
        <div className="toolbar">
          <button className="secondary-button" onClick={() => download(JSON.parse(localStorage.getItem('hep-anchors') || '[]'), 'customer-held-history.json')}>
            <Download size={15} /> Export remembered heads
          </button>
          <span style={{ color: 'var(--ink-2)', fontSize: '13px', margin: '0 4px' }}>or import:</span>
          <input
            type="file"
            accept=".json"
            onChange={async e => {
              if (e.target.files?.[0]) {
                try {
                  const a = JSON.parse(await e.target.files[0].text());
                  if (!Array.isArray(a)) throw Error('History must be an array');
                  localStorage.setItem('hep-anchors', JSON.stringify(a));
                  setMessage('Customer-held history imported.');
                } catch (x: any) {
                  setMessage(x.message);
                }
              }
            }}
            style={{ width: 'auto' }}
          />
        </div>
      </section>

      {message && <p role="status" className="notice">{message}</p>}
    </div>
  );
}
