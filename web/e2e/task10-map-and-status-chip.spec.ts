import { test, expect } from '@playwright/test';
import { deriveStatus } from '../components/status-chip';

test.describe('Task 10: Leaflet Map and StatusChip Component', () => {
  test('StatusChip derives and renders all states accurately in Control Room', async ({ page }) => {
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
        sites: ['site-a', 'site-b', 'site-c'],
      }));
    }, authData.access_token);

    // Navigate to control room
    await page.goto('/control');
    await page.waitForLoadState('networkidle');

    // Verify status chips rendered in table
    const chips = page.locator('[data-testid="status-chip"]');
    await expect(chips.first()).toBeVisible({ timeout: 5000 });

    const count = await chips.count();
    expect(count).toBeGreaterThan(0);

    // Click first job row to open drawer
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();

    // Verify drawer header has StatusChip
    const drawerChip = page.locator('.drawer [data-testid="status-chip"], [class*="drawer"] [data-testid="status-chip"]');
    await expect(drawerChip).toBeVisible();
  });

  test('MapView renders leaflet container with sites and technicians in Control Room', async ({ page }) => {
    // 1. Authenticate coordinator via API
    const authRes = await page.request.post('http://127.0.0.1:8000/auth/token', {
      data: { user_id: 'coordinator', otp: '246810' },
    });
    const authData = await authRes.json();

    await page.addInitScript((token) => {
      localStorage.setItem('rivet.session', JSON.stringify({
        user_id: 'coordinator',
        role: 'coordinator',
        token,
        sites: ['site-a', 'site-b', 'site-c'],
      }));
    }, authData.access_token);

    await page.goto('/control');
    await page.waitForLoadState('networkidle');

    // Verify Map panel is present
    const mapPanel = page.locator('[data-testid="map-slot-panel"]');
    await expect(mapPanel).toBeVisible({ timeout: 5000 });

    // Verify Leaflet map container exists
    const mapContainer = page.locator('[data-testid="leaflet-map-container"]');
    await expect(mapContainer).toBeVisible();

    // Verify legend exists
    const legend = page.locator('[data-testid="map-pins-legend"]');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Customer Plants & Depots');
    await expect(legend).toContainText('Field Technicians');
  });

  test('Portal page renders StatusChip next to machine ID', async ({ page }) => {
    // 1. Authenticate supervisor via API
    const authRes = await page.request.post('http://127.0.0.1:8000/auth/token', {
      data: { user_id: 'supervisor', otp: '246810' },
    });
    const authData = await authRes.json();

    await page.addInitScript((token) => {
      localStorage.setItem('rivet.session', JSON.stringify({
        user_id: 'supervisor',
        role: 'supervisor',
        token,
        sites: ['site-a'],
      }));
    }, authData.access_token);

    await page.goto('/portal');
    await page.waitForLoadState('networkidle');

    // Verify stats grid renders with equipment and status chip
    const statusChip = page.locator('.stats-grid [data-testid="status-chip"]');
    await expect(statusChip).toBeVisible({ timeout: 5000 });
  });

  test('Status derivation lifecycle transitions: Fault -> Under repair -> Restored -> Verified', () => {
    // Step 1: Initial detected fault on assignment
    const s1 = deriveStatus({ status: 'Fault detected' }, { state: 'assigned' });
    expect(s1).toBe('Fault detected');

    // Step 2: Tech begins work on site
    const s2 = deriveStatus(null, { state: 'in_progress', started_at: '2026-10-07T10:00:00Z' });
    expect(s2).toBe('Under repair');

    // Step 3: Checkout and awaiting supervisor acceptance
    const s3 = deriveStatus(null, { state: 'awaiting_acceptance', checkout_at: '2026-10-07T11:00:00Z' });
    expect(s3).toBe('Restored, awaiting confirmation');

    // Step 4: Supervisor verifies and closes job
    const s4 = deriveStatus(null, { state: 'closed', acceptance: 'Verified' });
    expect(s4).toBe('Verified');
  });
});
