import { test, expect } from '@playwright/test';

test.describe('Task 5: Conflict resolution & rejection screens', () => {
  test('Each rejection code renders its screen driven by the mock', async ({ page }) => {
    await page.goto('http://localhost:3000/tech');

    // Switch to Conflict Center tab
    await page.click('[data-testid="tab-conflicts"]');
    await expect(page.locator('[data-testid="conflict-card"]')).toBeVisible();

    // 1. Check JOB_REASSIGNED
    await page.click('[data-testid="btn-select-conflict-job_reassigned"]');
    const reassignedScreen = page.locator('[data-testid="screen-job-reassigned"]');
    await expect(reassignedScreen).toBeVisible();
    await expect(reassignedScreen).toContainText('CONFLICT: JOB REASSIGNED');
    await expect(reassignedScreen).toContainText('This job moved to Priya at 10:15. Your notes are attached.');
    await expect(reassignedScreen).toContainText('Your evidence is preserved: 4 task logs · 3 photos · 2 part scans');
    await expect(reassignedScreen).toContainText('Rejected: completion status update');
    await expect(reassignedScreen.locator('[data-testid="btn-view-evidence"]')).toBeVisible();

    // 2. Check PART_CONFLICT
    await page.click('[data-testid="btn-select-conflict-part_conflict"]');
    const partConflictScreen = page.locator('[data-testid="screen-part-conflict"]');
    await expect(partConflictScreen).toBeVisible();
    await expect(partConflictScreen).toContainText('REJECTION: PART CONFLICT');
    await expect(partConflictScreen).toContainText('This part is held for J-2240. Coordinator asked to transfer it.');
    await expect(partConflictScreen).toContainText('TRANSFER REQUEST PENDING');

    // 3. Check VAN_STOCK
    await page.click('[data-testid="btn-select-conflict-van_stock"]');
    const vanStockScreen = page.locator('[data-testid="screen-van-stock"]');
    await expect(vanStockScreen).toBeVisible();
    await expect(vanStockScreen).toContainText('Logged from van stock');
    await expect(vanStockScreen).toContainText('VAN LEDGER CONFIRMED');

    // 4. Check JOB_CANCELLED
    await page.click('[data-testid="btn-select-conflict-job_cancelled"]');
    const cancelledScreen = page.locator('[data-testid="screen-job-cancelled"]');
    await expect(cancelledScreen).toBeVisible();
    await expect(cancelledScreen).toContainText('JOB CANCELLED');
    await expect(cancelledScreen).toContainText('Cancellation reason:');

    // 5. Check EVIDENCE_MISSING
    await page.click('[data-testid="btn-select-conflict-evidence_missing"]');
    const evidenceScreen = page.locator('[data-testid="screen-evidence-missing"]');
    await expect(evidenceScreen).toBeVisible();
    await expect(evidenceScreen).toContainText('CLOSURE BLOCKED: EVIDENCE MISSING');
    await expect(evidenceScreen).toContainText('Checklist with the gaps highlighted:');
    await expect(evidenceScreen).toContainText('MISSING:');

    // 6. Test Report Dropout button queues command
    await page.click('[data-testid="conflict-report-dropout-btn"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('ReportDropout');
  });
});
