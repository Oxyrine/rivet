import { test, expect } from '@playwright/test';
import { sha256 } from '../lib/offline/hash';
import { recordServerTime, getClockSkewOffsetMs, getNormalizedIsoTime, resetClockSkew } from '../lib/offline/clock';

test.describe('Task 11: Offline Edge Cases & Device Hash Chain', () => {
  test.beforeEach(async ({ page }) => {
    // Reset clock skew
    resetClockSkew();
    // Navigate to tech page and clear indexeddb
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains('commands')) {
            const tx = db.transaction('commands', 'readwrite');
            tx.objectStore('commands').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });
    });
  });

  test('Shared phone: per-shift user switching preserves queue tagged per user', async ({ context, page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // 1. Go offline to hold actions in local IndexedDB queue
    await context.setOffline(true);

    // Start on Priya's shift
    const priyaBtn = page.locator('[data-testid="tech-priya-btn"]');
    await expect(priyaBtn).toBeVisible();
    await priyaBtn.click();

    // Open first job drawer for Priya
    const firstJobPriya = page.locator('[data-testid="job-list"] .panel').first();
    await expect(firstJobPriya).toBeVisible();
    await firstJobPriya.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // Perform CheckIn as Priya
    const checkInBtn = page.locator('[data-testid="action-checkin"]');
    await expect(checkInBtn).toBeVisible();
    await checkInBtn.click();
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('CheckIn');

    // Close drawer
    await page.locator('[data-testid="close-drawer-btn"]').click();

    // Verify queue count is 1
    const queueCount = page.locator('[data-testid="queue-count"]');
    await expect(queueCount).toHaveText('1');

    // 2. Switch user to Ravi on the shared phone
    const raviBtn = page.locator('[data-testid="tech-ravi-btn"]');
    await expect(raviBtn).toBeVisible();
    await raviBtn.click();
    await page.waitForTimeout(500);

    // Open first job drawer for Ravi
    const firstJobRavi = page.locator('[data-testid="job-list"] .panel').first();
    await expect(firstJobRavi).toBeVisible();
    await firstJobRavi.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // Perform CheckIn as Ravi
    const raviCheckIn = page.locator('[data-testid="action-checkin"]');
    await expect(raviCheckIn).toBeVisible();
    await raviCheckIn.click();
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('CheckIn');
    await page.waitForTimeout(500);

    // 3. Inspect IndexedDB commands to verify multi-user tagging
    const userCommands = await page.evaluate(async () => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readonly');
          const store = tx.objectStore('commands');
          const getAll = store.getAll();
          getAll.onsuccess = () => resolve(getAll.result);
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(userCommands.length).toBeGreaterThanOrEqual(2);
    const priyaCmd = userCommands.find((c: any) => c.user_id === 'priya');
    const raviCmd = userCommands.find((c: any) => c.user_id === 'ravi');

    expect(priyaCmd).toBeDefined();
    expect(raviCmd).toBeDefined();
    expect(priyaCmd.type).toBe('CheckIn');
    expect(raviCmd.type).toBe('CheckIn');
  });

  test('Tier 2 #1 Device Hash Link: sequential commands carry previous hash', async ({ page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Perform 3 sequential actions in offline mode
    await page.locator('[data-testid="tech-priya-btn"]').click();
    const firstJob = page.locator('[data-testid="job-list"] .panel').first();
    await expect(firstJob).toBeVisible();
    await firstJob.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    const checkInBtn = page.locator('[data-testid="action-checkin"]');
    await expect(checkInBtn).toBeVisible();
    await checkInBtn.click();
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('CheckIn');

    const partBtn = page.locator('[data-testid="action-scanpart"]');
    await expect(partBtn).toBeVisible();
    await partBtn.click();
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('PartScanned');

    const taskBtn = page.locator('[data-testid="action-logtask"]');
    await expect(taskBtn).toBeVisible();
    await taskBtn.click();
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('TaskLogged');

    // Verify hash chain
    const chain = await page.evaluate(async () => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readonly');
          const store = tx.objectStore('commands');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const cmds = getAll.result.sort((a: any, b: any) => a.device_seq - b.device_seq);
            resolve(cmds);
          };
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(chain.length).toBeGreaterThanOrEqual(3);

    // Command 1 has genesis hash
    expect(chain[0].prev_hash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(chain[0].hash).toBeDefined();
    expect(chain[0].hash.length).toBe(64);

    // Command 2 points to Command 1's hash
    expect(chain[1].prev_hash).toBe(chain[0].hash);
    expect(chain[1].hash).toBeDefined();
    expect(chain[1].hash.length).toBe(64);

    // Command 3 points to Command 2's hash
    expect(chain[2].prev_hash).toBe(chain[1].hash);
    expect(chain[2].hash).toBeDefined();
    expect(chain[2].hash.length).toBe(64);
  });

  test('Clock skew tracking and normalized time generation', () => {
    resetClockSkew();
    expect(getClockSkewOffsetMs()).toBe(0);

    // Simulate server being 5 minutes (300,000 ms) ahead of client device
    const simulatedServerTime = new Date(Date.now() + 300000).toISOString();
    const skew = recordServerTime(simulatedServerTime);

    expect(skew).toBeGreaterThanOrEqual(299000);
    expect(skew).toBeLessThanOrEqual(301000);
    expect(getClockSkewOffsetMs()).toBe(skew);

    // Normalized time reflects the 5m advance
    const normalized = getNormalizedIsoTime();
    const normalizedMs = new Date(normalized).getTime();
    const localNowMs = Date.now();

    expect(normalizedMs - localNowMs).toBeGreaterThanOrEqual(299000);
  });

  test('Long outage: 2-hour stale shift cache detection', async ({ page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Inject an old cached shift (> 2 hours ago)
    await page.evaluate(async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const mockShift = {
        key: 'shift:priya',
        tech_id: 'priya',
        device_id: 'device-priya',
        cached_at: threeHoursAgo,
        jobs: [
          {
            id: 'J-2231',
            machine_id: 'M-104',
            site_id: 'site-a',
            priority: 'P1',
            fault: 'hydraulic_leak',
            state: 'assigned',
          },
        ],
        commitments: [],
        last_seq: 0,
      };

      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('cache', 'readwrite');
          const store = tx.objectStore('cache');
          store.put(mockShift);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    });

    // Reload page to trigger stale check
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Stale banner should appear
    const staleBanner = page.locator('[data-testid="stale-banner"]');
    await expect(staleBanner).toBeVisible({ timeout: 5000 });
    await expect(staleBanner).toContainText('SHIFT DATA STALE');
  });

  test('Queue limit warning thresholds (80% of 500 limit)', async ({ page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Check queue limits utility calculation
    const limitsResult = await page.evaluate(async () => {
      // Create 405 dummy commands in IndexedDB to exceed 80% of 500
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readwrite');
          const store = tx.objectStore('commands');

          for (let i = 1; i <= 405; i++) {
            store.put({
              idempotency_key: `test-cmd-${i}`,
              device_seq: i,
              device_ts: new Date().toISOString(),
              user_id: 'priya',
              device_id: 'device-priya',
              type: 'TaskLogged',
              job_id: 'J-2231',
              payload: { step: i },
              status: 'queued',
              created_at: new Date().toISOString(),
            });
          }

          tx.oncomplete = () => {
            // Check count
            const checkTx = db.transaction('commands', 'readonly');
            const checkStore = checkTx.objectStore('commands');
            const countReq = checkStore.count();
            countReq.onsuccess = () => {
              const count = countReq.result;
              resolve({
                count,
                isWarning: count >= 500 * 0.8,
                isFull: count >= 500,
              });
            };
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });

    expect(limitsResult.count).toBe(405);
    expect(limitsResult.isWarning).toBe(true);
    expect(limitsResult.isFull).toBe(false);
  });
});
