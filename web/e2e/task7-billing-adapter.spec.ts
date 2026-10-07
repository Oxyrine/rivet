import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

test.describe('Task 7: Billing Adapter & Control Room Integration', () => {
  test.beforeEach(async () => {
    // Cleanly reset store, configure J-2231, and reset billing DB via Python helper
    const rootDir = path.resolve(__dirname, '..', '..');
    execFileSync('python', ['tests/reset_billing_test.py'], { cwd: rootDir });
  });

  test('Switch it on -> J-2231 invoice appears in Control Room with standard costs and labour table', async ({ page }) => {
    // 1. Authenticate coordinator via API
    const authRes = await page.request.post('http://127.0.0.1:8000/auth/token', {
      data: { user_id: 'coordinator', otp: '246810' },
    });
    const authData = await authRes.json();

    // Set authenticated session before loading /control
    await page.addInitScript((token) => {
      localStorage.setItem('rivet.session', JSON.stringify({
        user_id: 'coordinator',
        role: 'coordinator',
        token,
        sites: ['site-a', 'site-b'],
      }));
    }, authData.access_token);

    // 2. Visit Control Room
    await page.goto('/control');
    await page.waitForLoadState('networkidle');

    // 2. Check Adapter Registry panel
    const adapterPanel = page.locator('[data-testid="adapter-list-panel"]');
    await expect(adapterPanel).toBeVisible();

    // Verify Telemetry is LIVE
    await expect(page.locator('[data-testid="status-telemetry"]')).toHaveText('LIVE');

    // Verify Billing is initially OFF
    await expect(page.locator('[data-testid="status-billing"]')).toHaveText('OFF');

    // Verify Anchoring is PLANNED
    await expect(page.locator('[data-testid="status-anchoring"]')).toHaveText('PLANNED');

    // 3. Switch billing ON
    const toggleBtn = page.locator('[data-testid="btn-toggle-billing"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // 4. Verify billing status switches to LIVE
    await expect(page.locator('[data-testid="status-billing"]')).toHaveText('LIVE', { timeout: 10000 });

    // 5. Verify the J-2231 invoice appears
    const invoiceCard = page.locator('[data-testid="invoice-J-2231"]');
    await expect(invoiceCard).toBeVisible({ timeout: 10000 });

    // Verify itemized calculations:
    // HS-40 (₹2,400) + 2x O-RING (₹300) = ₹2,700 parts
    // 60 min labour @ ₹25/min = ₹1,500 labour
    // Total = ₹4,200
    await expect(invoiceCard).toContainText('INV-J-2231');
    await expect(invoiceCard).toContainText('₹4,200');
    await expect(invoiceCard).toContainText('PARTS: ₹2,700');
    await expect(invoiceCard).toContainText('LABOUR: ₹1,500');
  });
});
