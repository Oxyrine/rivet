'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  scanFromMediaElement,
  scanFromImageUrl,
  parseScanResult,
  hasNativeBarcodeDetector,
  ParsedScanResult,
} from '@/lib/offline/scanner';
import { Camera, QrCode, Barcode, CheckCircle, X, Upload, Video } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (result: ParsedScanResult) => void;
  mode?: 'all' | 'gate' | 'machine' | 'part';
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  mode = 'all',
}: BarcodeScannerModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'simulate'>('camera');
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string>('');
  const [scanning, setScanning] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [detectedFormat, setDetectedFormat] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize camera when activeTab === 'camera' and isOpen
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    try {
      setCameraError('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCamera(false);
        setCameraError('Camera access not supported in this browser environment');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        startScanLoop();
      }
    } catch (err: any) {
      setHasCamera(false);
      setCameraError(err.message || 'Camera permission denied or camera unavailable');
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startScanLoop = () => {
    const loop = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      try {
        const result = await scanFromMediaElement(videoRef.current);
        if (result) {
          handleSuccess(result);
          return;
        }
      } catch {
        // no scan match in this frame
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  };

  const handleSuccess = (result: ParsedScanResult) => {
    stopCamera();
    onScanSuccess(result);
    onClose();
  };

  // Image Upload Scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = URL.createObjectURL(file);
      const result = await scanFromImageUrl(url);
      URL.revokeObjectURL(url);

      if (result) {
        handleSuccess(result);
      } else {
        alert('No barcode or QR code detected in the selected image.');
      }
    } catch (err: any) {
      alert(`Image scanning error: ${err.message}`);
    }
  };

  // Simulate / Manual Input submission
  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    const parsed = parseScanResult(manualInput.trim());
    handleSuccess(parsed);
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="scanner-modal"
      className="overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--panel)',
          borderRadius: '4px',
          padding: '24px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Optical Field Scanner</h2>
          </div>
          <button type="button" className="quiet-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab switchers */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <button
            type="button"
            data-testid="scanner-tab-camera"
            className={activeTab === 'camera' ? 'primary-button' : 'secondary-button'}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setActiveTab('camera')}
          >
            <Camera size={14} /> Live Viewfinder
          </button>
          <button
            type="button"
            data-testid="scanner-tab-upload"
            className={activeTab === 'upload' ? 'primary-button' : 'secondary-button'}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={14} /> Image File
          </button>
          <button
            type="button"
            data-testid="scanner-tab-simulate"
            className={activeTab === 'simulate' ? 'primary-button' : 'secondary-button'}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setActiveTab('simulate')}
          >
            <Barcode size={14} /> Direct Input / Test
          </button>
        </div>

        {/* Scanner Engine Badge */}
        <div style={{ marginBottom: '14px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
          Engine: {hasNativeBarcodeDetector() ? 'Native BarcodeDetector' : '@zxing/browser MultiFormat fallback'}
        </div>

        {/* Tab 1: Live Camera Viewfinder */}
        {activeTab === 'camera' && (
          <div>
            {cameraError ? (
              <div style={{ padding: '24px', background: 'var(--panel-alt)', textAlign: 'center', marginBottom: '14px' }}>
                <p style={{ color: 'var(--accent)', marginBottom: '12px', fontSize: '13px' }}>
                  {cameraError}
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveTab('simulate')}
                >
                  Use Direct Input Mode Instead
                </button>
              </div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '280px',
                  background: '#000',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  marginBottom: '14px',
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {/* Viewfinder crosshairs */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '15%',
                    border: '2px dashed #00e676',
                    borderRadius: '6px',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#00e676',
                    fontSize: '11px',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {scanning && 'ALIGN QR OR BARCODE HERE'}
                </div>
              </div>
            )}
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
              Point camera at Plant Gate arrival QR, Machine label (e.g. M-104), or part barcode.
            </p>
          </div>
        )}

        {/* Tab 2: Upload File / Photo */}
        {activeTab === 'upload' && (
          <div style={{ padding: '24px', background: 'var(--panel-alt)', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', marginBottom: '16px' }}>
              Select an image containing an arrival QR code, machine QR, or part barcode:
            </p>
            <input
              type="file"
              accept="image/*"
              data-testid="scanner-file-input"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="barcode-file-upload"
            />
            <label htmlFor="barcode-file-upload" className="primary-button" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Upload size={14} /> Choose Image File
            </label>
          </div>
        )}

        {/* Tab 3: Simulate / Quick Field Actions */}
        {activeTab === 'simulate' && (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>
                Paste Arrival JSON or Barcode Text:
              </label>
              <textarea
                data-testid="scanner-manual-input"
                rows={3}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '12px' }}
                placeholder='{"site_id":"site-a","window":123,"signature":"..."} or M-104 or HS-40'
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
              <button
                type="button"
                data-testid="scanner-manual-submit"
                className="primary-button"
                style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                onClick={handleManualSubmit}
              >
                Submit Scanned Code
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                QUICK PRESETS FOR TESTING:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <button
                  type="button"
                  data-testid="btn-scan-m104"
                  className="secondary-button"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => handleSuccess(parseScanResult('M-104'))}
                >
                  Machine M-104
                </button>
                <button
                  type="button"
                  data-testid="btn-scan-hs40"
                  className="secondary-button"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => handleSuccess(parseScanResult('HS-40'))}
                >
                  Part HS-40
                </button>
                <button
                  type="button"
                  data-testid="btn-scan-oring2"
                  className="secondary-button"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => handleSuccess(parseScanResult('ORING-2'))}
                >
                  Part ORING-2
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
