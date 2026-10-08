'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, useSession } from '@/lib/api';
import { Activity, Receipt, Anchor, Power, CheckCircle2, Clock } from 'lucide-react';

export interface InvoiceLine {
  type: string;
  item: string;
  quantity?: number;
  duration_minutes?: number;
  unit_cost_paise?: number;
  rate_per_minute_paise?: number;
  line_total_paise: number;
  description: string;
}

export interface DraftInvoice {
  id: string;
  job_id: string;
  machine_id: string;
  site_id: string;
  technician_id?: string;
  parts_total_paise: number;
  labour_total_paise: number;
  total_paise: number;
  currency: string;
  status: string;
  lines: InvoiceLine[];
  created_at: string;
}

export function AdapterPanel() {
  const [adapters, setAdapters] = useState<Record<string, { enabled: boolean }>>({
    telemetry: { enabled: true },
    billing: { enabled: false },
  });
  const [invoices, setInvoices] = useState<DraftInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>('');
  // The invoice feed reads the adapter's local SQLite file, so a deployed site has none.
  const localFeed = useRef(true);
  const { session } = useSession();

  const loadAdapters = useCallback(async () => {
    try {
      const res = await api<Record<string, { enabled: boolean }>>('/adapters');
      if (res) {
        setAdapters((prev) => ({ ...prev, ...res }));
      }
    } catch {
      // ignore
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    if (!localFeed.current) return;
    try {
      const data = await api<{ invoices?: DraftInvoice[]; disabled?: boolean }>('/adapters/billing/invoices');
      if (data?.disabled) {
        localFeed.current = false;
      }
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
      }
    } catch (err: any) {
      if (err?.status === 404) localFeed.current = false;
    }
  }, []);

  useEffect(() => {
    if (!session) return; // signed out: nothing to read, and every poll would be a 401
    loadAdapters();
    loadInvoices();
    const interval = setInterval(() => {
      loadAdapters();
      loadInvoices();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadAdapters, loadInvoices, session]);

  const toggleBilling = async () => {
    setLoading(true);
    setNotice('');
    try {
      // 1. Enable billing adapter on server
      await api('/adapters/billing/enable', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      // 2. Trigger adapter sync / poll pass
      if (localFeed.current) await api('/adapters/billing/invoices', { method: 'POST' }).catch(() => undefined);

      // 3. Reload state
      await loadAdapters();
      await loadInvoices();
      setNotice('Billing adapter enabled. Customer accepted events polling active.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err: any) {
      alert(`Enable error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isBillingEnabled = adapters.billing?.enabled;

  return (
    <section className="panel" data-testid="adapter-list-panel" style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <span className="eyebrow" style={{ marginBottom: '2px' }}>INTEGRATION PIPELINES &middot; ADAPTER REGISTRY</span>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Adapter Subscriptions</h2>
        </div>
        <span className="badge" style={{ fontFamily: 'var(--mono)' }}>3 ADAPTERS</span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px' }}>
        Isolated adapter processes subscribe to ledger event feeds without coupling the core ledger.
      </p>

      {notice && (
        <div data-testid="billing-enable-notice" style={{ padding: '8px 12px', background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#2e7d32', borderRadius: '3px', fontSize: '12px', marginBottom: '12px' }}>
          &check; {notice}
        </div>
      )}

      {/* Adapter Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {/* Telemetry Adapter */}
        <div
          data-testid="adapter-card-telemetry"
          style={{
            padding: '14px',
            background: 'var(--panel-alt)',
            borderLeft: '4px solid var(--green)',
            borderRadius: '2px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
              <Activity size={16} color="var(--green)" />
              <span>telemetry</span>
            </div>
            <span className="badge green" data-testid="status-telemetry">LIVE</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 6px' }}>
            Streaming sensor feeds & pressure in-band verification
          </p>
          <small style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            Process: background &middot; status: polling
          </small>
        </div>

        {/* Billing Adapter */}
        <div
          data-testid="adapter-card-billing"
          style={{
            padding: '14px',
            background: 'var(--panel-alt)',
            borderLeft: isBillingEnabled ? '4px solid var(--green)' : '4px solid var(--accent)',
            borderRadius: '2px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
              <Receipt size={16} color={isBillingEnabled ? 'var(--green)' : 'var(--accent)'} />
              <span>billing</span>
            </div>
            <span
              className={`badge ${isBillingEnabled ? 'green' : 'amber'}`}
              data-testid="status-billing"
            >
              {isBillingEnabled ? 'LIVE' : 'OFF'}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 8px' }}>
            Drafts customer invoices from accepted completion events
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
              SQLite: adapters/billing/billing.db
            </small>
            {!isBillingEnabled ? (
              <button
                type="button"
                data-testid="btn-toggle-billing"
                className="primary-button"
                style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                disabled={loading}
                onClick={toggleBilling}
              >
                <Power size={12} /> Enable
              </button>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <CheckCircle2 size={12} /> Active
              </span>
            )}
          </div>
        </div>

        {/* Anchoring Adapter */}
        <div
          data-testid="adapter-card-anchoring"
          style={{
            padding: '14px',
            background: 'var(--panel-alt)',
            borderLeft: '4px solid var(--border)',
            borderRadius: '2px',
            opacity: 0.8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
              <Anchor size={16} color="var(--muted)" />
              <span>anchoring</span>
            </div>
            <span className="badge" data-testid="status-anchoring">PLANNED</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 6px' }}>
            Tamper-evident external hash publication & notarization
          </p>
          <small style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            Tier 2 roadmap &middot; not configured
          </small>
        </div>
      </div>

      {/* Invoices Drafted by Billing Adapter */}
      <div>
        <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '10px' }}>
          Drafted Invoices ({invoices.length})
        </h3>

        {!isBillingEnabled && invoices.length === 0 ? (
          <p data-testid="billing-disabled-msg" style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0' }}>
            Billing adapter is switched off. Enable the billing adapter to subscribe to completion events and draft invoices.
          </p>
        ) : invoices.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0' }}>
            No customer-accepted jobs processed yet. When a job is accepted or deemed accepted, draft invoices appear here.
          </p>
        ) : (
          <div data-testid="billing-invoices-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                data-testid={`invoice-${inv.job_id}`}
                style={{
                  padding: '12px 16px',
                  background: 'var(--panel-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: '13px' }}>{inv.id}</span>
                    <span className="badge green">{inv.status.toUpperCase()}</span>
                    <span className="badge">{inv.job_id}</span>
                    <small style={{ color: 'var(--muted)' }}>({inv.machine_id})</small>
                  </div>
                  <strong style={{ fontSize: '15px', color: 'var(--green)' }}>
                    ₹{(inv.total_paise / 100).toLocaleString('en-IN')}
                  </strong>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  <span>PARTS: ₹{(inv.parts_total_paise / 100).toLocaleString('en-IN')}</span>
                  <span>LABOUR: ₹{(inv.labour_total_paise / 100).toLocaleString('en-IN')}</span>
                  <span>SITE: {inv.site_id.toUpperCase()}</span>
                  <span>DATE: {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {inv.lines && inv.lines.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border)', fontSize: '11px' }}>
                    <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>LINE ITEMS: </span>
                    {inv.lines.map((l, i) => (
                      <span key={i} style={{ marginRight: '10px' }}>
                        &bull; {l.description}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
