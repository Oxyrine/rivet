import { test, expect } from '@playwright/test';

test.describe('Task 2: Evidence-preserving offline execution & queue persistence', () => {
  test('setOffline(true), do 7 actions, reload, queue still holds 7', async ({ context, page }) => {
    page.on('console', (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err}`));
    page.on('requestfailed', (req) => console.log(`[REQ FAILED] ${req.url()} - ${req.failure()?.errorText}`));

    // 1. Navigate to Technician Field app
    await page.goto('/tech');
    await expect(page.locator('h1')).toContainText('Technician Shift Shell');

    // Select Priya Sharma's shift
    await page.click('[data-testid="tech-priya-btn"]');
    await expect(page.locator('[data-testid="job-list"]')).toBeVisible();

    // Allow Service Worker to register and cache assets while online
    await page.waitForTimeout(1500);

    // 2. Go offline
    await context.setOffline(true);

    // Verify offline badge shows up
    await expect(page.locator('[data-testid="offline-sync-strip"]')).toContainText('OFFLINE');

    // 3. Open first job inspection drawer
    const firstJob = page.locator('[data-testid="job-list"] .panel').first();
    await firstJob.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // 4. Perform 7 distinct field actions offline
    // Action 1: Check In
    await page.click('[data-testid="action-checkin"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('CheckIn');

    // Action 2: Start Work
    await page.click('[data-testid="action-startwork"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('StartWork');

    // Action 3: Scan Part
    await page.click('[data-testid="action-scanpart"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('PartScanned');

    // Action 4: Log Task
    await page.click('[data-testid="action-logtask"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('TaskLogged');

    // Action 5: Record Reading
    await page.click('[data-testid="action-reading"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('ReadingRecorded');

    // Action 6: Attach Evidence
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.setInputFiles('[data-testid="camera-file-input"]', {
      name: 'field-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('EvidenceAttached');

    // Action 7: Submit Report
    await page.click('[data-testid="action-submitreport"]');
    await page.click('[data-testid="report-review-btn"]');
    await page.click('[data-testid="report-submit-btn"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('SubmitReport');

    // 5. Verify queue count shows 7 before reload
    await expect(page.locator('[data-testid="queue-count"]')).toHaveText('7');

    // 6. Reload page while still offline
    await page.reload();

    // 7. Verify queue still holds 7 actions after reload
    await expect(page.locator('[data-testid="queue-count"]')).toHaveText('7');

    // 8. Directly inspect IndexedDB to verify 7 records, monotonic sequence 1..7, and one-code-path integrity
    const dbCommands = await page.evaluate(async () => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('rivet-field-db', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readonly');
          const store = tx.objectStore('commands');
          const getAll = store.getAll();
          getAll.onsuccess = () => resolve(getAll.result);
          getAll.onerror = () => reject(getAll.error);
        };
      });
    });

    expect(dbCommands.length).toBe(7);
    const seqs = dbCommands.map((c) => c.device_seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(dbCommands.every((c) => c.status === 'queued')).toBe(true);
    expect(dbCommands.every((c) => c.idempotency_key && c.device_ts && c.user_id === 'priya')).toBe(true);
  });
});
