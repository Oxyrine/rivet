import { test, expect } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Completion report screen', () => {
  test('Ravi photographs the work, reports parts and checklist, and the server holds that report', async ({ page }) => {
    const auth = await page.request.post('http://127.0.0.1:8000/auth/token', {
      data: { user_id: 'ravi', otp: '246810' },
    });
    const { access_token, principal } = await auth.json();
    await page.addInitScript(
      ({ token, p }) => {
        localStorage.setItem('rivet.session', JSON.stringify({ user_id: 'ravi', role: p.role, token, device_id: p.device_id, sites: p.sites }));
        localStorage.setItem('rivet.active-tech', 'ravi');
      },
      { token: access_token, p: principal }
    );

    await page.goto('/tech');
    await page.getByText('J-2231', { exact: true }).first().click();
    await page.click('[data-testid="action-submitreport"]');
    await expect(page.locator('[data-testid="report-screen"]')).toBeVisible();

    // The before and after photos tick their own checklist items once they are saved on the device
    for (const type of ['before_photo', 'after_photo']) {
      await page.setInputFiles(`[data-testid="report-${type}-input"]`, { name: `${type}.png`, mimeType: 'image/png', buffer: PNG });
      await expect(page.locator(`[data-testid="report-check-${type}"]`)).toBeDisabled();
      await expect(page.locator(`[data-testid="report-check-${type}"]`)).toBeChecked();
    }

    for (const id of ['isolate', 'inspect', 'replace', 'test']) {
      await page.check(`[data-testid="report-check-${id}"]`);
    }
    await page.click('button[aria-label="One more HS-40"]');
    await page.fill('[data-testid="report-notes"]', 'Replaced hydraulic hose HS-40, pressure tested.');

    await page.click('[data-testid="report-review-btn"]');
    await expect(page.locator('[data-testid="report-summary"]')).toContainText('HS-40 × 1');
    await page.click('[data-testid="report-submit-btn"]');
    await expect(page.locator('[data-testid="action-notice"]')).toContainText('SubmitReport');

    // Once replayed, the job holds exactly what was entered
    await expect
      .poll(async () => {
        const job = await page.request.get('http://127.0.0.1:8000/jobs/J-2231', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const body = await job.json();
        return (body.job || body).report;
      }, { timeout: 15000 })
      .toMatchObject({ parts: { 'HS-40': 1 }, minutes: 55, notes: 'Replaced hydraulic hose HS-40, pressure tested.' });
  });
});
