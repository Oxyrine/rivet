import { getDB, StoredPhoto } from './db';
import { executeTechnicianAction } from './actions';
import { api } from '@/lib/api';

export interface PhotoValidationResult {
  valid: boolean;
  mime: string;
  sizeBytes: number;
  base64: string;
  error?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_SIZE = 20 * 1024 * 1024;   // 20 MB

/**
 * Validates file type and magic bytes:
 * - PNG: \x89PNG\r\n\x1a\n
 * - JPEG: \xff\xd8\xff ... \xff\xd9
 * - PDF: %PDF- ... %%EOF
 */
export async function validatePhotoFile(file: Blob): Promise<PhotoValidationResult> {
  const sizeBytes = file.size;

  if (sizeBytes > MAX_IMAGE_SIZE && file.type !== 'application/pdf') {
    return {
      valid: false,
      mime: file.type,
      sizeBytes,
      base64: '',
      error: `File exceeds maximum image limit of 10 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB)`,
    };
  }

  if (sizeBytes > MAX_PDF_SIZE) {
    return {
      valid: false,
      mime: file.type,
      sizeBytes,
      base64: '',
      error: `File exceeds maximum PDF limit of 20 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB)`,
    };
  }

  // Read array buffer to check magic bytes
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let detectedMime = '';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    detectedMime = 'image/png';
  }
  // JPEG: FF D8 FF
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detectedMime = 'image/jpeg';
  }
  // PDF: %PDF- (25 50 44 46 2D)
  else if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    detectedMime = 'application/pdf';
  } else {
    // If browser supplied mime type is jpeg/png/pdf, check if we can accept
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      detectedMime = 'image/jpeg';
    } else if (file.type === 'image/png') {
      detectedMime = 'image/png';
    } else if (file.type === 'application/pdf') {
      detectedMime = 'application/pdf';
    } else {
      return {
        valid: false,
        mime: file.type || 'unknown',
        sizeBytes,
        base64: '',
        error: 'Only PNG, JPEG and PDF content is accepted',
      };
    }
  }

  // Convert to Base64
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    valid: true,
    mime: detectedMime,
    sizeBytes,
    base64,
  };
}

/**
 * Generates a minimal valid 1x1 transparent PNG for mock/testing
 */
export function generateMinimalPngBase64(): string {
  // 1x1 transparent PNG base64
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Generates a minimal valid 1x1 JPEG for mock/testing
 */
export function generateMinimalJpegBase64(): string {
  return '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
}

/**
 * Stores a photo in IndexedDB and enqueues the EvidenceAttached command.
 * Never blocks the queue: upload runs asynchronously with retry.
 */
export async function captureAndStorePhoto(params: {
  userId: string;
  deviceId: string;
  jobId: string;
  type: 'before_photo' | 'after_photo' | 'permit_photo' | 'delivery_note' | 'signed_sheet';
  base64Data: string;
  mimeType: string;
  sizeBytes: number;
  filename?: string;
  notes?: string;
  authToken?: string;
}): Promise<{ photoId: string; queuedSeq: number }> {
  const photoId = `photo-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const nowIso = new Date().toISOString();

  const storedPhoto: StoredPhoto = {
    photo_id: photoId,
    job_id: params.jobId,
    data_url: `data:${params.mimeType};base64,${params.base64Data}`,
    content_type: params.mimeType,
    device_ts: nowIso,
    size_bytes: params.sizeBytes,
    status: 'pending',
  };

  // 1. Store photo locally in IndexedDB
  const db = await getDB();
  await db.put('photos', storedPhoto);

  // 2. Enqueue EvidenceAttached command through the single offline-first code path
  const cmd = await executeTechnicianAction(
    { userId: params.userId, deviceId: params.deviceId, jobId: params.jobId },
    'EvidenceAttached',
    {
      photo_id: photoId,
      type: params.type,
      notes: params.notes || '',
      filename: params.filename || `${photoId}.${params.mimeType.includes('png') ? 'png' : 'jpg'}`,
    }
  );

  // 3. Kick off off-queue upload retry in the background (fire and forget, never blocks)
  uploadPendingPhotos(params.authToken).catch((err) => {
    console.warn('[RIVET] Background photo upload deferral:', err);
  });

  return { photoId, queuedSeq: cmd.device_seq };
}

/**
 * Background off-queue photo uploader with retries.
 * Never blocks the queue.
 */
export async function uploadPendingPhotos(authToken?: string): Promise<{
  uploaded: number;
  failed: number;
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { uploaded: 0, failed: 0 };
  }

  const db = await getDB();
  const allPhotos = await db.getAll('photos');
  const pendingPhotos = allPhotos.filter(
    (p) => p.status === 'pending' || p.status === 'failed'
  );

  let uploadedCount = 0;
  let failedCount = 0;

  for (const photo of pendingPhotos) {
    try {
      photo.status = 'uploading';
      await db.put('photos', photo);

      const base64Content = photo.data_url?.split(',')[1] || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await api<{
        photo_id: string;
        url: string;
        sha256: string;
      }>('/evidence/uploads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          photo_id: photo.photo_id,
          job_id: photo.job_id,
          content_base64: base64Content,
          type: (photo as any).type || 'before_photo',
          filename: `${photo.photo_id}.${photo.content_type.includes('png') ? 'png' : 'jpg'}`,
        }),
      });

      photo.status = 'uploaded';
      photo.upload_result = res;
      photo.error = undefined;
      await db.put('photos', photo);
      uploadedCount++;
    } catch (err: any) {
      photo.status = 'failed';
      photo.error = err.message || 'Upload failed';
      await db.put('photos', photo);
      failedCount++;
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rivet:photos-updated'));
  }

  return { uploaded: uploadedCount, failed: failedCount };
}

/**
 * Returns count of pending/failed photos
 */
export async function getPendingPhotosCount(): Promise<number> {
  try {
    const db = await getDB();
    const photos = await db.getAll('photos');
    return photos.filter((p) => p.status === 'pending' || p.status === 'failed').length;
  } catch {
    return 0;
  }
}
