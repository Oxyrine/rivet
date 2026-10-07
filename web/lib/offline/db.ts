import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface QueuedCommand {
  idempotency_key: string;      // UUID
  device_seq: number;           // Monotonic per device
  device_ts: string;            // ISO timestamp with timezone
  user_id: string;              // e.g. 'priya', 'ravi'
  device_id: string;            // e.g. 'device-priya', 'device-ravi'
  type: string;                 // CheckIn, StartWork, PartScanned, TaskLogged, EvidenceAttached, SubmitReport, CheckOut, ReportDropout
  job_id: string;
  payload: Record<string, any>;
  status: 'queued' | 'sending' | 'accepted' | 'rejected' | 'duplicate';
  result?: any;
  error_code?: string;
  error_message?: string;
  created_at: string;
  prev_hash?: string;           // Optional Tier 2 client-side device hash chain
  hash?: string;                // SHA-256 hash of this command linked to prev_hash
  clock_skew_ms?: number;       // Recorded clock skew offset at enqueue time
}

export interface StoredPhoto {
  photo_id: string;             // UUID
  job_id: string;
  blob?: Blob | ArrayBuffer;
  data_url?: string;
  content_type: string;
  device_ts: string;
  size_bytes: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  upload_result?: any;
  error?: string;
}

export interface CachedShift {
  key: string;                  // e.g. 'shift:priya', 'shift:ravi'
  tech_id: string;
  device_id: string;
  cached_at: string;            // ISO timestamp
  jobs: any[];
  commitments: any[];
  last_seq: number;
}

export interface DeviceMeta {
  device_id: string;
  last_seq: number;
  last_sync?: string;
  last_hash?: string;
}

interface RivetDB extends DBSchema {
  commands: {
    key: string; // idempotency_key
    value: QueuedCommand;
    indexes: {
      'by_device': string;
      'by_user': string;
      'by_status': string;
      'by_device_seq': [string, number];
    };
  };
  photos: {
    key: string; // photo_id
    value: StoredPhoto;
    indexes: {
      'by_job': string;
      'by_status': string;
    };
  };
  cache: {
    key: string;
    value: any;
  };
  meta: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'rivet-field-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RivetDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<RivetDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in browser environments');
  }
  if (!dbPromise) {
    dbPromise = openDB<RivetDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Commands Store
        if (!db.objectStoreNames.contains('commands')) {
          const cmdStore = db.createObjectStore('commands', { keyPath: 'idempotency_key' });
          cmdStore.createIndex('by_device', 'device_id');
          cmdStore.createIndex('by_user', 'user_id');
          cmdStore.createIndex('by_status', 'status');
          cmdStore.createIndex('by_device_seq', ['device_id', 'device_seq']);
        }

        // Photos Store
        if (!db.objectStoreNames.contains('photos')) {
          const photoStore = db.createObjectStore('photos', { keyPath: 'photo_id' });
          photoStore.createIndex('by_job', 'job_id');
          photoStore.createIndex('by_status', 'status');
        }

        // Cache Store
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }

        // Device Metadata Store
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'device_id' });
        }
      },
    });
  }
  return dbPromise;
}
