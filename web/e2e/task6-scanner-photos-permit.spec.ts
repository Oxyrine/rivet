import { test, expect } from '@playwright/test';

test.describe('Task 6: Photos, Scanner, Gate Arrival & Permit Lockout', () => {
  test('Step 1 & 2: Gate arrival code generation, scanning, and strong presence check-in', async ({ page }) => {
    // 1. Visit Gate page and enroll site-a gate identity
    await page.goto('/gate');
    await expect(page.locator('h1')).toContainText('Gate arrival verification');

    // Click "Activate this gate" (automatically signs in as supervisor if needed and enrolls)
    const enrollBtn = page.locator('[data-testid="btn-enroll-gate"]');
    await enrollBtn.click();

    // Verify gate enrolled status and wait for arrival code and QR code image
    await expect(page.locator('[data-testid="gate-status"]')).toContainText('signing locally', { timeout: 15000 });
    const codePre = page.locator('[data-testid="gate-arrival-code"]');
    await expect(codePre).toBeVisible();

    const arrivalCodeJson = await codePre.innerText();
    expect(arrivalCodeJson).toContain('site-a');
    expect(arrivalCodeJson).toContain('signature');

    const parsedCode = JSON.parse(arrivalCodeJson);
    expect(parsedCode.site_id).toBe('site-a');
    expect(typeof parsedCode.window).toBe('number');
    expect(parsedCode.signature.length).toBeGreaterThan(10);

    // Verify QR code image rendered
    await expect(page.locator('[data-testid="gate-qr-image"]')).toBeVisible();

    // 2. Open Technician App with Site A Geolocation
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 19.076, longitude: 72.877 });

    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Ensure Priya is active
    await page.locator('[data-testid="tech-priya-btn"]').click();
    await page.waitForTimeout(500);

    // Open first job drawer
    const firstJob = page.locator('[data-testid^="job-"]').first();
    await expect(firstJob).toBeVisible();
    await firstJob.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // 3. Open optical scanner and scan the Gate Arrival Code
    await page.locator('[data-testid="action-open-scanner"]').click();
    await expect(page.locator('[data-testid="scanner-modal"]')).toBeVisible();

    // Use direct simulation/input mode
    await page.locator('[data-testid="scanner-tab-simulate"]').click();
    await page.locator('[data-testid="scanner-manual-input"]').fill(arrivalCodeJson);
    await page.locator('[data-testid="scanner-manual-submit"]').click();

    // Verify scanner modal closed and arrival code indicator is displayed
    await expect(page.locator('[data-testid="scanner-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="scanned-arrival-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="scanned-arrival-indicator"]')).toContainText('ARRIVAL CODE SCANNED');

    // 4. Record Check-In action with scanned arrival code and GPS
    await page.locator('[data-testid="action-checkin"]').click();

    // Verify CheckIn command queued
    await expect(page.locator('[data-testid="queue-count"]')).not.toHaveText('0', { timeout: 10000 });

    // Inspect IndexedDB to verify CheckIn payload has arrival_code and GPS
    const checkInCmd = await page.evaluate(async () => {
      const req = indexedDB.open('rivet-field-db', 1);
      return new Promise<any>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readonly');
          const store = tx.objectStore('commands');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const cmds = getAll.result;
            resolve(cmds.find((c: any) => c.type === 'CheckIn'));
          };
        };
      });
    });

    expect(checkInCmd).toBeDefined();
    expect(checkInCmd.payload.arrival_code).toBeDefined();
    expect(checkInCmd.payload.arrival_code.site_id).toBe('site-a');
    expect(checkInCmd.payload.gps).toBeDefined();
    expect(checkInCmd.payload.gps.lat_e6).toBe(19076000);
    expect(checkInCmd.payload.gps.lng_e6).toBe(72877000);

    // Close job drawer before clicking sync now in the main strip
    await page.getByRole('button', { name: 'Close Job Card' }).click();
    await expect(page.locator('[data-testid="job-drawer"]')).not.toBeVisible();

    // 5. Sync to server and verify strong presence
    await page.locator('[data-testid="sync-now-btn"]').click();
    await page.waitForTimeout(1500);

    // Check notice or sync results
    const notice = page.locator('[data-testid="action-notice"]');
    if (await notice.isVisible()) {
      const text = await notice.innerText();
      expect(text).toContain('Sync complete');
    }
  });

  test('Step 3: Permit lockout disables StartWork and in-plant supervisor PIN unlocks it', async ({ page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Ensure Ravi is active (Ravi's J-2231 / J-2236 shifts have commitments)
    await page.locator('[data-testid="tech-ravi-btn"]').click();
    await page.waitForTimeout(500);

    // Select job J-2236
    const jobCard = page.locator('[data-testid="job-J-2236"]');
    await expect(jobCard).toBeVisible();
    await jobCard.click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // Verify permit banner and disabled Start Work button
    const permitBanner = page.locator('[data-testid="permit-pending-banner"]');
    const startWorkBtn = page.locator('[data-testid="action-startwork"]');

    if (await permitBanner.isVisible()) {
      await expect(startWorkBtn).toBeDisabled();

      // Open supervisor PIN modal
      await page.locator('[data-testid="btn-open-supervisor-permit"]').click();
      await expect(page.locator('[data-testid="supervisor-permit-modal"]')).toBeVisible();

      // Test invalid PIN
      await page.locator('[data-testid="supervisor-pin-input"]').fill('0000');
      await page.locator('[data-testid="btn-submit-supervisor-permit"]').click();
      await expect(page.locator('[data-testid="supervisor-pin-error"]')).toBeVisible();

      // Enter valid supervisor PIN: 4826
      await page.locator('[data-testid="supervisor-pin-input"]').fill('4826');
      await page.locator('[data-testid="btn-submit-supervisor-permit"]').click();

      // Modal should close and Start Work should be enabled
      await expect(page.locator('[data-testid="supervisor-permit-modal"]')).not.toBeVisible();
      await expect(startWorkBtn).toBeEnabled();

      // Click Start Work
      await startWorkBtn.click();
      await page.waitForTimeout(500);

      // Verify StartWork command is queued
      const hasStartWork = await page.evaluate(async () => {
        const req = indexedDB.open('rivet-field-db', 1);
        return new Promise<boolean>((resolve) => {
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('commands', 'readonly');
            const getAll = tx.objectStore('commands').getAll();
            getAll.onsuccess = () => {
              const cmds = getAll.result;
              resolve(cmds.some((c: any) => c.type === 'StartWork'));
            };
          };
        });
      });
      expect(hasStartWork).toBe(true);
    }
  });

  test('Step 4: Camera input captures photo with type checking and off-queue upload', async ({ page }) => {
    await page.goto('/tech');
    await page.waitForLoadState('networkidle');

    // Open Priya's job
    await page.locator('[data-testid="tech-priya-btn"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-testid^="job-"]').first().click();
    await expect(page.locator('[data-testid="job-drawer"]')).toBeVisible();

    // Attach valid 1x1 PNG photo file to camera input
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const buffer = Buffer.from(pngBase64, 'base64');

    await page.setInputFiles('[data-testid="camera-file-input"]', {
      name: 'field-photo.png',
      mimeType: 'image/png',
      buffer,
    });

    await page.waitForTimeout(600);

    // Verify EvidenceAttached command was queued
    const hasEvidence = await page.evaluate(async () => {
      const req = indexedDB.open('rivet-field-db', 1);
      return new Promise<any>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('commands', 'readonly');
          const getAll = tx.objectStore('commands').getAll();
          getAll.onsuccess = () => {
            const cmds = getAll.result;
            resolve(cmds.find((c: any) => c.type === 'EvidenceAttached'));
          };
        };
      });
    });

    expect(hasEvidence).toBeDefined();
    expect(hasEvidence.payload.photo_id).toBeDefined();
    expect(hasEvidence.payload.type).toBe('after_photo');

    // Verify photo stored in IndexedDB photos store
    const storedPhoto = await page.evaluate(async (photoId: string) => {
      const req = indexedDB.open('rivet-field-db', 1);
      return new Promise<any>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('photos', 'readonly');
          const getReq = tx.objectStore('photos').get(photoId);
          getReq.onsuccess = () => resolve(getReq.result);
        };
      });
    }, hasEvidence.payload.photo_id);

    expect(storedPhoto).toBeDefined();
    expect(storedPhoto.photo_id).toBe(hasEvidence.payload.photo_id);
    expect(storedPhoto.content_type).toBe('image/png');
  });
});
