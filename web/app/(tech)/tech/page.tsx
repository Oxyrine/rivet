'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/api';
import apiClient from '@/lib/client';
import { MOCK_SHIFTS, ShiftJob, ShiftCommitment, ShiftCacheResponse } from '@/lib/mock-shifts';
import { JobCard } from './components/job-card';
import { SyncScreen } from './components/sync-screen';
import { ConflictScreen, ConflictCode } from './components/conflict-screen';
import { registerServiceWorker } from '@/lib/offline/sw-register';
import { storeShiftCache, getCachedShift, checkStaleStatus, StaleStatus } from '@/lib/offline/cache';
import { getQueuedCommands, QueuedCommand, getQueueLimits, QueueLimits } from '@/lib/offline/queue';
import { executeTechnicianAction } from '@/lib/offline/actions';
import { hostedAuth } from '@/lib/supabase';
import { initReplayListeners, replayPendingCommands, isIOSDevice, SyncResultSummary } from '@/lib/offline/replay';
import { BarcodeScannerModal } from './components/barcode-scanner-modal';
import { SupervisorPermitModal } from './components/supervisor-permit-modal';
import { validatePhotoFile, captureAndStorePhoto, getPendingPhotosCount } from '@/lib/offline/photos';
import { captureGpsLocation } from '@/lib/offline/gps';
import { ParsedScanResult } from '@/lib/offline/scanner';
import {
  User,
  Smartphone,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wrench,
  ShieldAlert,
  ListTodo,
  Wifi,
  WifiOff,
  Database,
  Layers,
  ArrowUpRight,
  Camera,
  Barcode,
  ClipboardList,
  LogOut,
  LogIn,
  AlertTriangle,
  QrCode,
  KeyRound
} from 'lucide-react';

export default function TechnicianFieldPage() {
  const { session, login } = useSession();
  const [selectedTech, setSelectedTech] = useState<'priya' | 'ravi'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rivet.active-tech');
      if (saved === 'ravi' || saved === 'priya') return saved;
    }
    return 'priya';
  });
  const [shiftData, setShiftData] = useState<ShiftCacheResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<'live-mock' | 'fixture-mock'>('fixture-mock');
  const [selectedJob, setSelectedJob] = useState<ShiftJob | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('Online · Shift cached');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [signInPending, setSignInPending] = useState<number | null>(null);
  const [queuedCmds, setQueuedCmds] = useState<QueuedCommand[]>([]);
  const [staleInfo, setStaleInfo] = useState<StaleStatus>({ isStale: false });
  const [actionNotice, setActionNotice] = useState<string>('');
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [limits, setLimits] = useState<QueueLimits>({ commandsCount: 0, maxCommands: 500, isWarning: false, isFull: false });
  const [syncResult, setSyncResult] = useState<SyncResultSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'jobs' | 'sync' | 'conflicts'>('jobs');
  const [syncScreenMode, setSyncScreenMode] = useState<'offline' | 'complete' | 'conflict'>('offline');
  const [activeConflictCode, setActiveConflictCode] = useState<ConflictCode>('JOB_REASSIGNED');

  // Scanner & Photos & Permit State
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState<boolean>(false);
  const [scannedArrivalCode, setScannedArrivalCode] = useState<any | null>(null);
  const [scannedMachineQr, setScannedMachineQr] = useState<string>('');
  const [pendingPhotosCount, setPendingPhotosCount] = useState<number>(0);

  // Register Service Worker & Replay Listeners
  useEffect(() => {
    registerServiceWorker();
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    setIsIOS(isIOSDevice());

    const cleanupReplay = initReplayListeners(
      () => `device-${selectedTech}`,
      () => session?.token
    );

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSyncCompleted = (e: any) => {
      setSyncResult(e.detail);
      setSyncStatus(`Sync Complete · ${e.detail.accepted} accepted · ${e.detail.duplicates} duplicates`);
    };

    const handleAuthRequired = (e: any) => setSignInPending(e.detail?.pending ?? 0);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('rivet:sync-completed', handleSyncCompleted);
    window.addEventListener('rivet:auth-required', handleAuthRequired);

    return () => {
      cleanupReplay();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('rivet:sync-completed', handleSyncCompleted);
      window.removeEventListener('rivet:auth-required', handleAuthRequired);
    };
  }, [selectedTech, session?.token]);

  useEffect(() => {
    if (session?.token) setSignInPending(null);
  }, [session?.token]);

  // Update session based on selection
  useEffect(() => {
    if (session?.user_id === 'ravi') {
      setSelectedTech('ravi');
    } else if (session?.user_id === 'priya') {
      setSelectedTech('priya');
    }
  }, [session]);

  // Refresh Queued Commands from IndexedDB
  const refreshQueue = useCallback(async () => {
    try {
      const deviceId = `device-${selectedTech}`;
      const cmds = await getQueuedCommands(deviceId);
      const lim = await getQueueLimits(deviceId);
      console.log(`[RIVET] refreshQueue for ${deviceId}: count = ${cmds.length}`);
      setQueuedCmds(cmds);
      setLimits(lim);
    } catch (err) {
      console.error('[RIVET] refreshQueue error:', err);
    }
  }, [selectedTech]);

  useEffect(() => {
    refreshQueue();
    const handleQueueChange = () => refreshQueue();
    window.addEventListener('rivet:queue-change', handleQueueChange);
    return () => window.removeEventListener('rivet:queue-change', handleQueueChange);
  }, [refreshQueue]);

  // Load shift and store in IndexedDB cache
  const loadShift = useCallback(async (techId: 'priya' | 'ravi') => {
    setLoading(true);
    const deviceId = `device-${techId}`;

    // First check local IndexedDB cache
    const localCached = await getCachedShift(techId);
    if (localCached) {
      setShiftData(localCached as unknown as ShiftCacheResponse);
      const stale = checkStaleStatus(localCached.cached_at);
      setStaleInfo(stale);
    }

    try {
      // Fetch through API client from mock backend
      const response = await apiClient.GET('/devices/{ident}/shift-cache', {
        params: { path: { ident: deviceId } },
      });

      const data = response.data as unknown as ShiftCacheResponse | undefined;
      if (data && Array.isArray(data.jobs)) {
        setShiftData(data);
        setDataSource('live-mock');
        setSyncStatus(`Connected to backend mock · ${new Date().toLocaleTimeString()}`);
        await storeShiftCache(techId, deviceId, data);
        setStaleInfo(checkStaleStatus(data.cached_at));
        setLoading(false);
        return;
      }
    } catch {
      // Offline or backend unreachable, fallback to fixture mock
    }

    // Fallback: Read directly from mock fixtures
    const mock = MOCK_SHIFTS[techId];
    if (mock) {
      setShiftData(mock);
      setDataSource('fixture-mock');
      setSyncStatus(`Fixture mock loaded · ${new Date().toLocaleTimeString()}`);
      await storeShiftCache(techId, deviceId, mock);
      setStaleInfo(checkStaleStatus(mock.cached_at));
    }
    setLoading(false);
  }, []);

  // Reload when the person signs in, so a signed-in technician replaces the fixture shift.
  useEffect(() => {
    loadShift(selectedTech);
  }, [selectedTech, loadShift, session?.token]);

  const handleSwitchTech = async (tech: 'priya' | 'ravi') => {
    setSelectedTech(tech);
    setSelectedJob(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rivet.active-tech', tech);
    }
    // Demo sign-in only exists on the local demo server; a hosted deployment keeps the
    // person's own sign-in and only switches which technician's shift is shown.
    if (!hostedAuth) {
      try {
        await login(tech, '246810');
      } catch {
        // ignore
      }
    }
  };

  // Photo count tracking
  const refreshPhotoCount = useCallback(async () => {
    const count = await getPendingPhotosCount();
    setPendingPhotosCount(count);
  }, []);

  useEffect(() => {
    refreshPhotoCount();
    window.addEventListener('rivet:photos-updated', refreshPhotoCount);
    return () => window.removeEventListener('rivet:photos-updated', refreshPhotoCount);
  }, [refreshPhotoCount]);

  // Handle scanned barcodes & QR codes
  const handleScanSuccess = async (result: ParsedScanResult) => {
    if (result.type === 'gate_arrival' && result.arrivalCode) {
      setScannedArrivalCode(result.arrivalCode);
      setActionNotice(`Scanned Gate Code (Window: ${result.arrivalCode.window})`);
      setTimeout(() => setActionNotice(''), 4000);
    } else if (result.type === 'machine' && result.machineId) {
      setScannedMachineQr(result.machineId);
      setActionNotice(`Scanned Machine QR: ${result.machineId}`);
      setTimeout(() => setActionNotice(''), 4000);
    } else if (result.type === 'part' && result.partResource) {
      setActionNotice(`Scanned Part: ${result.partResource}`);
      setTimeout(() => setActionNotice(''), 4000);
      const jobId = selectedJob ? selectedJob.id : (currentJobs[0]?.id || 'GENERAL');
      await performAction('PartScanned', {
        resource: result.partResource,
        quantity: 1,
        source: `job:${jobId}:reserved`,
      });
    }
  };

  // Handle camera photo capture
  const handlePhotoCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'before_photo' | 'after_photo' | 'permit_photo' | 'delivery_note' = 'after_photo'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = await validatePhotoFile(file);
    if (!validation.valid) {
      alert(validation.error || 'Invalid photo file');
      return;
    }

    const jobId = selectedJob ? selectedJob.id : (currentJobs[0]?.id || 'GENERAL');
    const deviceId = `device-${selectedTech}`;

    try {
      await captureAndStorePhoto({
        userId: selectedTech,
        deviceId,
        jobId,
        type,
        base64Data: validation.base64,
        mimeType: validation.mime,
        sizeBytes: validation.sizeBytes,
        filename: file.name,
        notes: `Captured via camera: ${type}`,
        authToken: session?.token,
      });

      setActionNotice(`Photo captured (${(validation.sizeBytes / 1024).toFixed(0)} KB) · EvidenceAttached queued`);
      setTimeout(() => setActionNotice(''), 4000);
      await refreshQueue();
      await refreshPhotoCount();
    } catch (err: any) {
      alert(`Photo capture error: ${err.message}`);
    }
  };

  // Perform action using the unified offline-first action dispatcher
  const performAction = async (actionType: string, payload: Record<string, any> = {}) => {
    const jobId = selectedJob ? selectedJob.id : (currentJobs[0]?.id || 'GENERAL');
    const deviceId = `device-${selectedTech}`;

    try {
      const cmd = await executeTechnicianAction(
        { userId: selectedTech, deviceId, jobId },
        actionType,
        payload
      );
      setActionNotice(`Queued action #${cmd.device_seq}: ${actionType}`);
      setTimeout(() => setActionNotice(''), 3500);
      await refreshQueue();
    } catch (err: any) {
      alert(`Action error: ${err.message}`);
    }
  };

  // CheckIn with GPS & Arrival Code
  const handleCheckIn = async () => {
    const siteId = selectedJob?.site_id || 'site-a';
    const gps = await captureGpsLocation(siteId);

    await performAction('CheckIn', {
      gps,
      arrival_code: scannedArrivalCode || null,
      machine_qr: scannedMachineQr || selectedJob?.machine_id || 'M-104',
    });
  };

  // CheckOut with GPS
  const handleCheckOut = async () => {
    const siteId = selectedJob?.site_id || 'site-a';
    const gps = await captureGpsLocation(siteId);

    await performAction('CheckOut', {
      gps,
      notes: 'Repair finished, site cleared',
    });
  };

  const currentJobs = shiftData?.jobs || [];
  const currentCommitments = shiftData?.commitments || [];
  const p1Jobs = currentJobs.filter((j) => j.priority === 'P1');
  const p2Jobs = currentJobs.filter((j) => j.priority === 'P2');

  const isPermitPending = Boolean(
    selectedJob &&
    currentCommitments.some(
      (c) => c.type === 'PERMIT_TO_WORK' && c.job_id === selectedJob.id && c.state !== 'FULFILLED'
    )
  );

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* iOS Banner: "Open to sync" */}
      {isIOS && (
        <div
          data-testid="ios-sync-banner"
          style={{
            background: 'var(--panel-alt)',
            border: '1px solid var(--border)',
            padding: '8px 16px',
            marginBottom: '12px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            color: 'var(--text)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={14} />
            <b>iOS DETECTED:</b>
            <span>Open to sync (Background sync is unavailable on iOS)</span>
          </div>
          <button
            type="button"
            className="quiet-button"
            style={{ padding: '2px 8px', textDecoration: 'underline' }}
            onClick={() => replayPendingCommands(`device-${selectedTech}`, session?.token)}
          >
            Sync now
          </button>
        </div>
      )}

      {signInPending !== null && !session && (
        <div
          role="status"
          data-testid="sign-in-to-sync-banner"
          style={{
            background: '#ffecb3',
            border: '1px solid #ffe082',
            color: '#795548',
            padding: '10px 16px',
            marginBottom: '14px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
        >
          <AlertCircle size={16} />
          <b>SIGN IN TO SYNC:</b>
          <span>{signInPending} change(s) are saved on this device and will send once you sign in.</span>
        </div>
      )}

      {/* 80% Queue Limits Warning Banner */}
      {limits.isWarning && (
        <div
          data-testid="limits-warning-banner"
          style={{
            background: '#ffecb3',
            border: '1px solid #ffe082',
            color: '#795548',
            padding: '10px 16px',
            marginBottom: '14px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
        >
          <AlertCircle size={16} />
          <b>QUEUE LIMIT WARNING:</b>
          <span>{limits.commandsCount} of {limits.maxCommands} commands queued (over 80% limit). Reconnect to sync.</span>
        </div>
      )}

      {/* 2-Hour Stale Banner */}
      {staleInfo.isStale && (
        <div
          data-testid="stale-banner"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 16px',
            marginBottom: '16px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <b>SHIFT DATA STALE</b>
            <span>&middot; Last sync was {staleInfo.hoursAgo || 'over 2'} hours ago. Reconnect to refresh.</span>
          </div>
          <button
            type="button"
            className="quiet-button"
            style={{ color: '#fff', padding: '2px 8px', textDecoration: 'underline' }}
            onClick={() => loadShift(selectedTech)}
          >
            Refresh Now
          </button>
        </div>
      )}

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
            data-testid="tech-priya-btn"
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
            data-testid="tech-ravi-btn"
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

      {/* Offline Status & Live Queue Bar */}
      <div
        data-testid="offline-sync-strip"
        className="panel"
        style={{
          padding: '14px 18px',
          marginBottom: '16px',
          background: isOnline ? 'var(--panel-alt)' : '#fff3cd',
          borderLeft: isOnline ? '4px solid var(--green)' : '4px solid var(--accent)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isOnline ? (
              <span className="badge green" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Wifi size={13} /> ONLINE
              </span>
            ) : (
              <span className="badge amber" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <WifiOff size={13} /> OFFLINE
              </span>
            )}
            <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600 }}>
              <span data-testid="queue-count">{queuedCmds.length}</span> actions queued
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
              &middot; Device: device-{selectedTech}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              data-testid="sync-now-btn"
              className="secondary-button"
              style={{ padding: '5px 11px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={async () => {
                const res = await replayPendingCommands(`device-${selectedTech}`, session?.token);
                setActionNotice(`Sync complete: ${res.accepted} accepted · ${res.duplicates} duplicates · ${res.sequenceGaps} gaps`);
                setTimeout(() => setActionNotice(''), 4000);
              }}
            >
              <RefreshCw size={12} /> Sync Now
            </button>
            <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <Database size={12} /> IDB ACTIVE
            </span>
          </div>
        </div>

        {actionNotice && (
          <div data-testid="action-notice" style={{ marginTop: '10px', fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
            &check; {actionNotice}
          </div>
        )}
      </div>

      {/* View Mode Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        <button
          type="button"
          data-testid="tab-jobs"
          className={activeTab === 'jobs' ? 'primary-button' : 'secondary-button'}
          onClick={() => setActiveTab('jobs')}
        >
          Shift Jobs ({currentJobs.length})
        </button>
        <button
          type="button"
          data-testid="tab-sync"
          className={activeTab === 'sync' ? 'primary-button' : 'secondary-button'}
          onClick={() => setActiveTab('sync')}
        >
          Sync Status Screen (Spec p.15)
        </button>
        <button
          type="button"
          data-testid="tab-conflicts"
          className={activeTab === 'conflicts' ? 'primary-button' : 'secondary-button'}
          onClick={() => setActiveTab('conflicts')}
        >
          Conflict Center
        </button>
      </div>

      {activeTab === 'jobs' ? (
        <>
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
              <small>QUEUED OFFLINE ACTIONS</small>
              <h2>{queuedCmds.length}</h2>
              <span>Stored in IndexedDB commands store</span>
            </div>
          </div>

          {/* Main Shift Jobs List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ListTodo size={18} /> Shift Job Queue ({currentJobs.length})
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                CLICK JOB TO TEST OFFLINE ACTIONS
              </span>
            </div>

            {loading ? (
              <div className="panel loading">Loading shift cache...</div>
            ) : currentJobs.length === 0 ? (
              <div className="panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                No jobs assigned for this shift.
              </div>
            ) : (
              <div data-testid="job-list">
                {currentJobs.map((job) => (
                  <div key={job.id} data-testid={`job-${job.id}`}>
                    <JobCard
                      job={job}
                      commitments={currentCommitments}
                      onSelect={(j) => setSelectedJob(j)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'sync' ? (
        /* Sync Screen Tab (Spec p.15) */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span className="section-title">SPECIFICATION P.15 VERIFICATION DISPLAY</span>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                Select mock/live state to verify matching typography and metrics
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                data-testid="sync-mode-offline"
                className={syncScreenMode === 'offline' ? 'primary-button' : 'secondary-button'}
                style={{ padding: '6px 12px', fontSize: '11px' }}
                onClick={() => setSyncScreenMode('offline')}
              >
                OFFLINE Spec
              </button>
              <button
                type="button"
                data-testid="sync-mode-complete"
                className={syncScreenMode === 'complete' ? 'primary-button' : 'secondary-button'}
                style={{ padding: '6px 12px', fontSize: '11px' }}
                onClick={() => setSyncScreenMode('complete')}
              >
                SYNC COMPLETE Spec
              </button>
              <button
                type="button"
                data-testid="sync-mode-conflict"
                className={syncScreenMode === 'conflict' ? 'primary-button' : 'secondary-button'}
                style={{ padding: '6px 12px', fontSize: '11px' }}
                onClick={() => setSyncScreenMode('conflict')}
              >
                CONFLICT Spec
              </button>
            </div>
          </div>

          <SyncScreen
            mode={syncScreenMode}
            lastSyncTime="10:02"
            actionsQueued={queuedCmds.length > 0 && syncScreenMode === 'offline' ? queuedCmds.length : 7}
            photosPending={3}
            commandsAccepted={syncResult ? syncResult.accepted : 7}
            commandsTotal={syncResult ? syncResult.total : 7}
            photosUploaded={3}
            photosTotal={3}
            duplicatesIgnored={syncResult ? syncResult.duplicates : 0}
            sequenceGapsDetected={syncResult ? syncResult.sequenceGaps : 0}
            conflictDetails={{
              jobId: 'J-2236',
              newTechnician: 'Karthik',
              movedAt: '10:15',
              taskLogsCount: 4,
              photosCount: 3,
              partScansCount: 2,
              rejectedMessage: 'completion status update',
            }}
            onViewEvidence={() => alert('Preserved evidence: 4 task logs, 3 photos, 2 part scans attached to job J-2236.')}
            onSyncNow={async () => {
              const res = await replayPendingCommands(`device-${selectedTech}`, session?.token);
              setSyncScreenMode('complete');
            }}
          />
        </div>
      ) : (
        /* Conflict Center Tab (Spec p.14-15) */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span className="section-title">REPLAY CONFLICT & REJECTION RESOLUTION</span>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                Demonstrate each rejection code and evidence preservation
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['JOB_REASSIGNED', 'PART_CONFLICT', 'VAN_STOCK', 'JOB_CANCELLED', 'EVIDENCE_MISSING'] as ConflictCode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`btn-select-conflict-${c.toLowerCase()}`}
                  className={activeConflictCode === c ? 'primary-button' : 'secondary-button'}
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                  onClick={() => setActiveConflictCode(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <ConflictScreen
            code={activeConflictCode}
            jobId={selectedJob?.id || 'J-2236'}
            data={{
              reassignedTo: 'Priya',
              reassignedAt: '10:15',
              taskLogsCount: 4,
              photosCount: 3,
              partScansCount: 2,
              heldForJob: 'J-2240',
              partNumber: 'HS-40',
              vanCovered: true,
              vanQuantity: 2,
              cancellationReason: 'Plant scheduled maintenance postponed.',
              missingItems: [
                'Before-repair photo of seal leak',
                'Calibrated pressure reading (180 bar target)',
                'Plant gate arrival timestamp confirmation'
              ],
            }}
            onViewEvidence={() => alert('Viewing preserved evidence: 4 task logs, 3 photos, 2 part scans.')}
            onReportDropout={() => performAction('ReportDropout', { reason: 'vehicle_breakdown' })}
          />
        </div>
      )}

      {/* Job Details Drawer & Offline Action Controls */}
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
            data-testid="job-drawer"
            style={{
              width: '100%',
              maxWidth: '560px',
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
                <span className="eyebrow" style={{ marginBottom: '4px' }}>JOB INSPECTION &middot; FIELD ACTIONS</span>
                <h2 style={{ margin: 0, fontSize: '22px' }}>{selectedJob.id} &middot; {selectedJob.machine_id}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  {selectedJob.fault.replace('_', ' ')} &middot; {selectedJob.site_id.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                data-testid="close-drawer-btn"
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
              <span className="badge" style={{ fontFamily: 'var(--mono)' }}>SEQ: {queuedCmds.length}</span>
              {isPermitPending && <span className="badge amber" data-testid="badge-permit-pending">PERMIT PENDING</span>}
            </div>

            {/* Scanned Presence & Barcodes Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {scannedArrivalCode ? (
                <div data-testid="scanned-arrival-indicator" style={{ padding: '6px 10px', background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#2e7d32', borderRadius: '3px', fontSize: '11px', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} />
                  <span>ARRIVAL CODE SCANNED · SITE {scannedArrivalCode.site_id.toUpperCase()} · WIN {scannedArrivalCode.window}</span>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Gate arrival QR not scanned yet</span>
                  <button type="button" className="quiet-button" data-testid="btn-open-scanner" style={{ textDecoration: 'underline', padding: 0 }} onClick={() => setIsScannerOpen(true)}>
                    Scan Gate QR
                  </button>
                </div>
              )}

              {scannedMachineQr && (
                <div data-testid="scanned-machine-indicator" style={{ padding: '6px 10px', background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#2e7d32', borderRadius: '3px', fontSize: '11px', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} />
                  <span>MACHINE QR SCANNED: {scannedMachineQr}</span>
                </div>
              )}
            </div>

            {/* Permit Lockout Banner */}
            {isPermitPending && (
              <div
                data-testid="permit-pending-banner"
                style={{
                  background: '#ffebee',
                  border: '1px solid #ffcdd2',
                  color: '#c62828',
                  padding: '12px 14px',
                  borderRadius: '3px',
                  marginBottom: '16px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '4px' }}>
                  <ShieldAlert size={16} />
                  <span>PERMIT PENDING · Permit to work has not been issued</span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#b71c1c' }}>
                  Start work is locked until permit is approved by customer portal or authorized on-site by supervisor.
                </p>
                <button
                  type="button"
                  data-testid="btn-open-supervisor-permit"
                  className="primary-button"
                  style={{ fontSize: '11px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', background: '#c62828' }}
                  onClick={() => setIsSupervisorModalOpen(true)}
                >
                  <KeyRound size={13} /> In-Plant Permit Fallback (Supervisor PIN)
                </button>
              </div>
            )}

            {/* Offline Action Buttons (Exercising the 1 Code Path) */}
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              Record Field Action (Always Enqueues to IDB)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0 24px' }}>
              <button
                type="button"
                data-testid="action-checkin"
                className="secondary-button"
                onClick={handleCheckIn}
              >
                <LogIn size={14} /> 1. Check In (GPS)
              </button>
              <button
                type="button"
                data-testid="action-startwork"
                className="secondary-button"
                disabled={isPermitPending}
                title={isPermitPending ? 'Permit to work has not been issued' : 'Start Work'}
                style={{ opacity: isPermitPending ? 0.5 : 1, cursor: isPermitPending ? 'not-allowed' : 'pointer' }}
                onClick={() => performAction('StartWork', {})}
              >
                <Wrench size={14} /> 2. Start Work
              </button>
              <button
                type="button"
                data-testid="action-open-scanner"
                className="secondary-button"
                onClick={() => setIsScannerOpen(true)}
              >
                <QrCode size={14} /> Scan Barcode/QR
              </button>
              <button
                type="button"
                data-testid="action-scanpart"
                className="secondary-button"
                onClick={() => performAction('PartScanned', { resource: 'HS-40', quantity: 1, source: `job:${selectedJob.id}:reserved` })}
              >
                <Barcode size={14} /> 3. Scan Part
              </button>
              <button
                type="button"
                data-testid="action-logtask"
                className="secondary-button"
                onClick={() => performAction('TaskLogged', { task: 'Seal replaced', checklist: ['Depressurize', 'Remove seal'] })}
              >
                <ClipboardList size={14} /> 4. Log Task
              </button>
              <button
                type="button"
                data-testid="action-reading"
                className="secondary-button"
                onClick={() => performAction('ReadingRecorded', { gauge: 'pressure', value: 180, unit: 'bar' })}
              >
                <Clock size={14} /> 5. Record Reading
              </button>

              {/* Camera Photo Upload */}
              <div>
                <input
                  id="camera-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  data-testid="camera-file-input"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePhotoCapture(e, 'after_photo')}
                />
                <button
                  type="button"
                  data-testid="action-evidence"
                  className="secondary-button"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                  onClick={() => {
                    performAction('EvidenceAttached', { photo_id: `photo-${Date.now()}`, type: 'after_photo' });
                    const fileInput = document.getElementById('camera-photo-input') as HTMLInputElement | null;
                    if (fileInput) fileInput.click();
                  }}
                >
                  <Camera size={14} /> 6. Attach Photo
                </button>
              </div>

              <button
                type="button"
                data-testid="action-submitreport"
                className="secondary-button"
                onClick={() => performAction('SubmitReport', { tasks_completed: ['repaired'], parts_claimed: ['HS-40'] })}
              >
                <CheckCircle2 size={14} /> 7. Submit Report
              </button>
              <button
                type="button"
                data-testid="action-checkout"
                className="secondary-button"
                onClick={handleCheckOut}
              >
                <LogOut size={14} /> 8. Check Out
              </button>
            </div>

            {/* Dropout Button */}
            <div style={{ marginBottom: '24px' }}>
              <button
                type="button"
                data-testid="action-dropout"
                className="quiet-button"
                style={{ width: '100%', border: '1px solid var(--accent)', color: 'var(--accent)', justifyContent: 'center' }}
                onClick={() => performAction('ReportDropout', { reason: 'vehicle_breakdown' })}
              >
                <AlertCircle size={14} /> Report Vehicle Dropout
              </button>
            </div>

            {/* Queued Commands for this Device */}
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              Pending Commands in Queue ({queuedCmds.length})
            </h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
              {queuedCmds.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Queue is empty.</p>
              ) : (
                queuedCmds.map((cmd) => (
                  <div key={cmd.idempotency_key} style={{ padding: '8px 10px', background: 'var(--panel-alt)', marginBottom: '6px', fontSize: '11px', fontFamily: 'var(--mono)', borderRadius: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <b>#{cmd.device_seq} {cmd.type}</b>
                      <span className="badge amber">{cmd.status.toUpperCase()}</span>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '10px' }}>Key: {cmd.idempotency_key.slice(0, 18)}...</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
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

      {/* Optical Barcode / QR Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Supervisor In-Plant Permit Fallback Modal */}
      {selectedJob && (
        <SupervisorPermitModal
          isOpen={isSupervisorModalOpen}
          onClose={() => setIsSupervisorModalOpen(false)}
          jobId={selectedJob.id}
          technicianId={selectedTech}
          onPermitFulfilled={async () => {
            await loadShift(selectedTech);
            setActionNotice('Permit to work fulfilled by supervisor PIN · Work unlocked');
            setTimeout(() => setActionNotice(''), 4000);
          }}
        />
      )}
    </div>
  );
}
