'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/api';
import apiClient from '@/lib/client';
import { MOCK_SHIFTS, ShiftJob, ShiftCommitment, ShiftCacheResponse } from '@/lib/mock-shifts';
import { JobCard } from './components/job-card';
import {
  User,
  Smartphone,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wrench,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  ListTodo
} from 'lucide-react';

export default function TechnicianFieldPage() {
  const { session, login } = useSession();
  const [selectedTech, setSelectedTech] = useState<'priya' | 'ravi'>('priya');
  const [shiftData, setShiftData] = useState<ShiftCacheResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<'live-mock' | 'fixture-mock'>('fixture-mock');
  const [selectedJob, setSelectedJob] = useState<ShiftJob | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('Online · Shift cached');

  // If session is already a technician, sync selection
  useEffect(() => {
    if (session?.user_id === 'ravi') {
      setSelectedTech('ravi');
    } else if (session?.user_id === 'priya') {
      setSelectedTech('priya');
    }
  }, [session]);

  const loadShift = useCallback(async (techId: 'priya' | 'ravi') => {
    setLoading(true);
    const deviceId = `device-${techId}`;

    try {
      // First try fetching through openapi-fetch client from the mock backend
      const response = await apiClient.GET('/devices/{ident}/shift-cache', {
        params: { path: { ident: deviceId } },
      });

      const data = response.data as unknown as ShiftCacheResponse | undefined;
      if (data && Array.isArray(data.jobs)) {
        setShiftData(data);
        setDataSource('live-mock');
        setSyncStatus(`Connected to backend mock · ${new Date().toLocaleTimeString()}`);
        setLoading(false);
        return;
      }
    } catch {
      // Fallback to local fixture mock
    }

    // Fallback: Read directly from mock fixtures
    const mock = MOCK_SHIFTS[techId];
    if (mock) {
      setShiftData(mock);
      setDataSource('fixture-mock');
      setSyncStatus(`Fixture mock loaded · ${new Date().toLocaleTimeString()}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadShift(selectedTech);
  }, [selectedTech, loadShift]);

  const handleSwitchTech = async (tech: 'priya' | 'ravi') => {
    setSelectedTech(tech);
    setSelectedJob(null);
    // Optionally log in via demo OTP to authenticate session
    try {
      await login(tech, '246810');
    } catch {
      // Ignore login errors in mock mode
    }
  };

  const currentJobs = shiftData?.jobs || [];
  const currentCommitments = shiftData?.commitments || [];
  const p1Jobs = currentJobs.filter((j) => j.priority === 'P1');
  const p2Jobs = currentJobs.filter((j) => j.priority === 'P2');

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header / Technician Switcher */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">FIELD OPERATIONS · TECHNICIAN WORKSPACE</span>
          <h1 style={{ marginBottom: '4px' }}>Technician Shift Shell</h1>
          <p>Evidence-preserving offline execution for field engineers</p>
        </div>

        {/* Technician Selector Tabs */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className={selectedTech === 'priya' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleSwitchTech('priya')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <User size={15} />
            <span>Priya Sharma</span>
            <small style={{ opacity: 0.8 }}>(1 job)</small>
          </button>
          <button
            type="button"
            className={selectedTech === 'ravi' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleSwitchTech('ravi')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <User size={15} />
            <span>Ravi Kumar</span>
            <small style={{ opacity: 0.8 }}>(2 jobs)</small>
          </button>
          <button
            type="button"
            className="quiet-button"
            title="Refresh shift"
            onClick={() => loadShift(selectedTech)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Technician Profile & Sync Status Bar */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: '20px', background: 'var(--panel-alt)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '16px',
              }}
            >
              {selectedTech === 'priya' ? 'PS' : 'RK'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <b style={{ fontSize: '15px' }}>{selectedTech === 'priya' ? 'Priya Sharma' : 'Ravi Kumar'}</b>
                <span className="badge green">ON SHIFT</span>
                <span className="badge" style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
                  device-{selectedTech}
                </span>
              </div>
              <small style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <Smartphone size={12} /> Registered Device &middot; Scoped to Aster Works Site A
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--muted)' }}>SOURCE: {dataSource.toUpperCase()}</span>
            <span className="badge amber" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} /> {syncStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Shift Overview Metrics */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <small>ASSIGNED COMMITMENTS</small>
          <h2>{currentJobs.length}</h2>
          <span>{currentJobs.length === 1 ? '1 scheduled job' : `${currentJobs.length} scheduled jobs`}</span>
        </div>
        <div className="stat-card">
          <small>CRITICALITY BREAKDOWN</small>
          <h2>{p1Jobs.length} <span style={{ fontSize: '18px', color: 'var(--muted)' }}>P1</span> / {p2Jobs.length} <span style={{ fontSize: '18px', color: 'var(--muted)' }}>P2</span></h2>
          <span>{p1Jobs.length > 0 ? 'Urgent response window active' : 'All jobs within standard SLAs'}</span>
        </div>
        <div className="stat-card">
          <small>TOTAL SHIFT TIME</small>
          <h2>
            {currentJobs.reduce((acc, j) => acc + (j.duration_minutes || 0), 0)}
            <span style={{ fontSize: '18px', fontWeight: 400 }}> min</span>
          </h2>
          <span>Across all reserved machine slots</span>
        </div>
      </div>

      {/* Main Shift Jobs List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListTodo size={18} /> Shift Job Queue ({currentJobs.length})
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            CHRONOLOGICAL ORDER
          </span>
        </div>

        {loading ? (
          <div className="panel loading">Loading shift cache...</div>
        ) : currentJobs.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            No jobs assigned for this shift.
          </div>
        ) : (
          <div>
            {currentJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                commitments={currentCommitments}
                onSelect={(j) => setSelectedJob(j)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Job Details Drawer / Inspection Modal */}
      {selectedJob && (
        <div
          className="overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 100,
          }}
          onClick={() => setSelectedJob(null)}
        >
          <aside
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--panel)',
              height: '100%',
              padding: '28px',
              overflowY: 'auto',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: '4px' }}>JOB INSPECTION</span>
                <h2 style={{ margin: 0, fontSize: '22px' }}>{selectedJob.id} &middot; {selectedJob.machine_id}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  {selectedJob.fault.replace('_', ' ')} &middot; {selectedJob.site_id.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                className="quiet-button"
                style={{ fontSize: '20px', lineHeight: 1 }}
                onClick={() => setSelectedJob(null)}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <span className={`badge ${selectedJob.priority === 'P1' ? 'amber' : 'green'}`}>{selectedJob.priority} PRIORITY</span>
              <span className="badge">{selectedJob.state.toUpperCase()}</span>
            </div>

            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              Commitment Schedule
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px', fontSize: '13px' }}>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', fontFamily: 'var(--mono)' }}>PLANNED START</small>
                <b>{new Date(selectedJob.planned_start).toLocaleTimeString()}</b>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', fontFamily: 'var(--mono)' }}>SLA DEADLINE</small>
                <b style={{ color: 'var(--accent)' }}>{new Date(selectedJob.deadline).toLocaleTimeString()}</b>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', fontFamily: 'var(--mono)' }}>ESTIMATED DURATION</small>
                <b>{selectedJob.duration_minutes} minutes</b>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', fontFamily: 'var(--mono)' }}>TECHNICIAN TIME HELD</small>
                <b>7 slots (105 min)</b>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              Associated Commitments
            </h3>
            <div style={{ marginBottom: '24px' }}>
              {currentCommitments
                .filter((c) => c.job_id === selectedJob.id)
                .map((c) => (
                  <div key={c.id} className="panel" style={{ padding: '12px', marginBottom: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <b>{c.type}</b>
                      <span className="badge green">{c.state}</span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                      ID: {c.id} &middot; Owner: {c.owner || 'System'}
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '30px' }}>
              <div style={{ padding: '12px', background: 'var(--panel-alt)', borderRadius: '3px', fontSize: '12px', color: 'var(--muted)' }}>
                Offline queue & command pipeline enabled. All actions will route through IndexedDB.
              </div>
              <button
                type="button"
                className="primary-button"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setSelectedJob(null)}
              >
                Close Job Card
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
