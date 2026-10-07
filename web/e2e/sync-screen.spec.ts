import { test, expect } from '@playwright/test';

test.describe('Task 4: Sync screen exactly as on spec p.15', () => {
  test('Sync screen matches spec p.15 text blocks', async ({ page }) => {
    await page.goto('http://localhost:3000/tech');

    // Switch to Sync Status Screen tab
    await page.click('[data-testid="tab-sync"]');
    await expect(page.locator('[data-testid="sync-screen-container"]')).toBeVisible();

    // 1. OFFLINE BLOCK MATCH
    await page.click('[data-testid="sync-mode-offline"]');
    const offlineBlock = page.locator('[data-testid="spec-offline-block"]');
    await expect(offlineBlock).toBeVisible();
    await expect(offlineBlock).toContainText('OFFLINE · last sync 10:02');
    await expect(offlineBlock).toContainText('7 actions queued');
    await expect(offlineBlock).toContainText('3 photos pending');
    await expect(offlineBlock).toContainText('✓Check-in recorded');
    await expect(offlineBlock).toContainText('✓Part scan recorded');
    await expect(offlineBlock).toContainText('✓Evidence timestamped');

    // 2. SYNC COMPLETE BLOCK MATCH
    await page.click('[data-testid="sync-mode-complete"]');
    const completeBlock = page.locator('[data-testid="spec-sync-complete-block"]');
    await expect(completeBlock).toBeVisible();
    await expect(completeBlock).toContainText('SYNC COMPLETE');
    await expect(completeBlock).toContainText('7 of 7 commands accepted');
    await expect(completeBlock).toContainText('3 of 3 photos uploaded');
    await expect(completeBlock).toContainText('0 duplicates ignored');
    await expect(completeBlock).toContainText('0 sequence gaps detected');

    // 3. CONFLICT BLOCK MATCH
    await page.click('[data-testid="sync-mode-conflict"]');
    const conflictBlock = page.locator('[data-testid="spec-conflict-block"]');
    await expect(conflictBlock).toBeVisible();
    await expect(conflictBlock).toContainText('CONFLICT: J-2236 moved to Karthik at 10:15');
    await expect(conflictBlock).toContainText('Your evidence is preserved: 4 task logs · 3 photos · 2 part scans');
    await expect(conflictBlock).toContainText('Rejected: completion status update');
    await expect(conflictBlock.locator('[data-testid="view-evidence-btn"]')).toContainText('[ View evidence ]');
  });
});
