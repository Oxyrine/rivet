import { useState, useEffect, useCallback } from 'react';
import { api, useSession } from '@/lib/api';

export interface Site {
  id: string;
  name: string;
}

export interface Technician {
  id: string;
  name: string;
  qualifications: string[];
}

export interface DashboardSummary {
  now: string;
  sites?: Site[];
  technicians?: Technician[];
  breaches?: {
    job_id: string;
    machine_id: string;
    description: string;
    deadline: string;
  }[];
  machines?: {
    id: string;
    site_id: string;
  }[];
}

let cachedSummary: DashboardSummary | null = null;
let lastFetch = 0;

export function useSummary() {
  const { session } = useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(cachedSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (force = false) => {
    if (!session) {
      setSummary(null);
      return;
    }
    const nowTime = Date.now();
    // Cache for 30 seconds unless forced
    if (!force && cachedSummary && nowTime - lastFetch < 30000) {
      setSummary(cachedSummary);
      return;
    }

    setLoading(true);
    try {
      const data = await api<DashboardSummary>('/dashboard/summary');
      cachedSummary = data;
      lastFetch = Date.now();
      setSummary(data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { summary, loading, error, refresh };
}
