'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PackageCheck, Truck, PackagePlus, Boxes } from 'lucide-react';
import { api, useSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusLabel } from '@/components/ui/status-label';
import s from './stores.module.css';

type Need = {
  job_id: string; machine_id: string; site_id: string; priority?: string; job_state: string;
  technician_id: string | null; technician: string | null; planned_start?: string;
  kind: 'part' | 'tool'; resource: string; name?: string | null;
  needed: number; issued: number; outstanding: number; status: 'issued' | 'ready' | 'waiting'; store_site: string;
};
type Shelf = { resource: string; name?: string | null; available: number; held: number; low: boolean };
type Overview = {
  stores: { site_id: string; name: string; stock: Shelf[] }[];
  needs: Need[];
  vans: { technician_id: string; technician: string; stock: { resource: string; name?: string | null; quantity: number }[] }[];
  technicians: { id: string; name: string }[];
};

const label = (code: string, name?: string | null) => (name ? `${name} (${code})` : code);
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

export default function Stores() {
  const { session } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [receive, setReceive] = useState({ resource: '', quantity: '1', reference: '' });
  const [van, setVan] = useState({ technician_id: '', resource: '', quantity: '1' });

  // Reading is open to the coordinator and manager (they assign against what is in stock); only the storekeeper changes stock.
  const canAct = session?.role === 'storekeeper' || session?.role === 'admin';

  const load = useCallback(async () => {
    try { setData(await api<Overview>('/stores/overview')); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { if (session) void load(); else setData(null); }, [session, load]);

  const act = async (id: string, path: string, body: object, done: string) => {
    setBusy(id); setMessage(''); setError('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': `${id}-${Date.now()}` } });
      setMessage(done);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: Need[] }>();
    for (const need of data?.needs ?? []) {
      const key = need.technician_id ?? '_none';
      if (!map.has(key)) map.set(key, { name: need.technician ?? 'Not assigned yet', rows: [] });
      map.get(key)!.rows.push(need);
    }
    return [...map.entries()].sort(([a], [b]) => (a === '_none' ? 1 : b === '_none' ? -1 : a.localeCompare(b)));
  }, [data]);

  const ready = data?.needs.filter(n => n.status === 'ready' && n.kind === 'part').length ?? 0;
  const waiting = data?.needs.filter(n => n.status === 'waiting').length ?? 0;
  const low = data?.stores.flatMap(x => x.stock).filter(x => x.low).length ?? 0;
  const resources = [...new Set(data?.stores.flatMap(x => x.stock.map(r => r.resource)) ?? [])];

  if (!session) {
    return (
      <div className={s.page}>
        <h1>Stores</h1>
        <p className="muted">Sign in as the storekeeper to see what each technician needs and what is on the shelf.</p>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">STORES</span>
          <h1>What each technician needs.</h1>
          <p className="muted">
            Parts and tools are reserved when a job is assigned. Hand them over here, top up vans, and book in new stock.
            {!canAct && ' You can see stock here; only the storekeeper changes it.'}
          </p>
        </div>
      </div>

      {error && <p role="alert" className="error-banner">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}

      <div className={s.kpis}>
        <div className={s.kpi}><PackageCheck size={18} /><b>{ready}</b><span>ready to hand over</span></div>
        <div className={s.kpi}><Truck size={18} /><b>{waiting}</b><span>waiting for a technician</span></div>
        <div className={s.kpi}><Boxes size={18} /><b>{low}</b><span>{low === 1 ? 'line' : 'lines'} running low</span></div>
      </div>

      <section className="panel">
        <h2>Needed by technician</h2>
        {!data && !error && <p className="muted">Loading…</p>}
        {data && !groups.length && <p className="muted">No open job needs a part or tool from this store right now.</p>}
        <div className={s.groups}>
          {groups.map(([key, group]) => (
            <div key={key} className={s.group}>
              <div className={s.groupHead}>
                <strong>{group.name}</strong>
                <span className="muted">{key === '_none' ? 'Reserved automatically once a technician is assigned' : `${group.rows.length} ${group.rows.length === 1 ? 'item' : 'items'}`}</span>
              </div>
              {group.rows.map(row => {
                const id = `${row.job_id}-${row.resource}-${row.kind}`;
                return (
                  <div key={id} className={s.row}>
                    <div className={s.what}>
                      <span>{row.needed} × {label(row.resource, row.name)}</span>
                      <span className={s.sub}>{row.job_id} · {row.machine_id}{row.priority ? ` · ${row.priority}` : ''}{row.planned_start ? ` · from ${time(row.planned_start)}` : ''}</span>
                    </div>
                    <StatusLabel tone={row.status === 'issued' ? 'positive' : row.status === 'ready' ? 'warning' : 'neutral'}>
                      {row.status === 'issued' ? 'Issued' : row.kind === 'tool' ? 'Held for the job' : row.status === 'ready' ? 'Ready to hand over' : 'Waiting for a technician'}
                    </StatusLabel>
                    {canAct && row.kind === 'part' && row.status === 'ready' && (
                      <Button variant="primary" busy={busy === id} disabled={!!busy}
                        onClick={() => act(id, '/stores/issue', { job_id: row.job_id, resource: row.resource, quantity: row.outstanding }, `Issued ${row.outstanding} × ${row.resource} to ${row.technician} for ${row.job_id}.`)}>
                        Issue {row.outstanding}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {data?.stores.map(store => (
        <section key={store.site_id} className="panel">
          <h2>On the shelf · {store.name}</h2>
          <div className={s.scroller}>
            <table>
              <thead><tr><th>Part</th><th>On the shelf</th><th>Held for jobs</th><th /></tr></thead>
              <tbody>
                {store.stock.map(item => (
                  <tr key={item.resource}>
                    <td>{item.name ? <>{item.name} <span className={s.sub}>{item.resource}</span></> : item.resource}</td>
                    <td><b>{item.available}</b></td>
                    <td>{item.held || '–'}</td>
                    <td>{item.low && <StatusLabel tone={item.available ? 'warning' : 'critical'}>{item.available ? 'Running low' : 'None left'}</StatusLabel>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {canAct && data && (
        <div className={s.forms}>
          <section className="panel">
            <h2><PackagePlus size={16} /> Book in stock</h2>
            <p className="muted">Goods received from a supplier.</p>
            <form className={s.form} onSubmit={e => { e.preventDefault(); void act('receive', '/stores/receive', { resource: receive.resource, quantity: Number(receive.quantity), reference: receive.reference }, `Booked in ${receive.quantity} × ${receive.resource.toUpperCase()}.`).then(() => setReceive({ resource: '', quantity: '1', reference: '' })); }}>
              <label>Part code<input list="parts" value={receive.resource} onChange={e => setReceive({ ...receive, resource: e.target.value })} placeholder="HS-40" required /></label>
              <label>Quantity<input type="number" min={1} max={1000} value={receive.quantity} onChange={e => setReceive({ ...receive, quantity: e.target.value })} required /></label>
              <label>Delivery note<input value={receive.reference} onChange={e => setReceive({ ...receive, reference: e.target.value })} placeholder="optional" /></label>
              <Button variant="primary" type="submit" busy={busy === 'receive'} disabled={!!busy}>Book in</Button>
            </form>
          </section>

          <section className="panel">
            <h2><Truck size={16} /> Top up a van</h2>
            <p className="muted">Stock a technician carries for small jobs; they explain its use on their report.</p>
            <form className={s.form} onSubmit={e => { e.preventDefault(); void act('van', '/stores/van-issue', { technician_id: van.technician_id, resource: van.resource, quantity: Number(van.quantity) }, `Put ${van.quantity} × ${van.resource} in the van.`); }}>
              <label>Technician
                <select value={van.technician_id} onChange={e => setVan({ ...van, technician_id: e.target.value })} required>
                  <option value="">Choose…</option>
                  {data.technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>Part
                <select value={van.resource} onChange={e => setVan({ ...van, resource: e.target.value })} required>
                  <option value="">Choose…</option>
                  {resources.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Quantity<input type="number" min={1} max={1000} value={van.quantity} onChange={e => setVan({ ...van, quantity: e.target.value })} required /></label>
              <Button variant="primary" type="submit" busy={busy === 'van'} disabled={!!busy}>Put in van</Button>
            </form>
          </section>
        </div>
      )}
      <datalist id="parts">{resources.map(r => <option key={r} value={r} />)}</datalist>

      {!!data?.vans.length && (
        <section className="panel">
          <h2>Van stock</h2>
          <div className={s.vans}>
            {data.vans.map(v => (
              <div key={v.technician_id} className={s.van}>
                <strong>{v.technician}</strong>
                {v.stock.map(x => <span key={x.resource}>{x.quantity} × {label(x.resource, x.name)}</span>)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
