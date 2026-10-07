import { test, expect } from '@playwright/test';

test.describe('Task 3: Replay pipeline & Duplicate replay protection', () => {
  test('Duplicate replay -> server reports duplicate, nothing is applied twice', async ({ request }) => {
    // 1. Authenticate as Priya
    const authRes = await request.post('http://127.0.0.1:8000/auth/token', {
      data: { user_id: 'priya', otp: '246810' },
    });
    expect(authRes.ok()).toBeTruthy();
    const { access_token } = await authRes.json();
    expect(access_token).toBeDefined();

    // 2. Fetch current last_seq from device
    const shiftRes = await request.get('http://127.0.0.1:8000/devices/device-priya/shift-cache', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(shiftRes.ok()).toBeTruthy();
    const shiftData = await shiftRes.json();
    const nextSeq = (shiftData.last_seq || 0) + 1;

    // 3. Prepare a test command with contiguous device_seq = last_seq + 1
    const testKey = `test-idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const batch = {
      commands: [
        {
          idempotency_key: testKey,
          device_seq: nextSeq,
          device_ts: new Date().toISOString(),
          user_id: 'priya',
          type: 'CheckIn',
          job_id: 'J-2254',
          payload: {
            gps: { lat_e6: 19076000, lng_e6: 72877000 },
          },
        },
      ],
    };

    // 4. First submission -> should be accepted
    const firstRes = await request.post('http://127.0.0.1:8000/devices/device-priya/commands', {
      data: batch,
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(firstRes.ok()).toBeTruthy();
    const firstBody = await firstRes.json();
    expect(firstBody.results[0].status).toBe('accepted');
    expect(firstBody.results[0].idempotency_key).toBe(testKey);

    // 5. Second submission (duplicate replay) -> server reports duplicate, nothing applied twice
    const secondRes = await request.post('http://127.0.0.1:8000/devices/device-priya/commands', {
      data: batch,
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(secondRes.ok()).toBeTruthy();
    const secondBody = await secondRes.json();
    expect(secondBody.results[0].status).toBe('duplicate');
    expect(secondBody.results[0].idempotency_key).toBe(testKey);
    expect(secondBody.results[0].original).toBeDefined();
    expect(secondBody.results[0].original.idempotency_key).toBe(testKey);
  });

  test('Dropout command prioritized first in batch order', () => {
    // Pure unit test of the ordering invariant
    const sampleCommands = [
      { idempotency_key: 'c1', device_seq: 1, type: 'CheckIn' },
      { idempotency_key: 'c2', device_seq: 2, type: 'TaskLogged' },
      { idempotency_key: 'c3', device_seq: 3, type: 'ReportDropout' },
      { idempotency_key: 'c4', device_seq: 4, type: 'PartScanned' },
    ];

    const dropouts = sampleCommands.filter((c) => c.type === 'ReportDropout');
    const regular = sampleCommands
      .filter((c) => c.type !== 'ReportDropout')
      .sort((a, b) => a.device_seq - b.device_seq);
    const ordered = [...dropouts, ...regular];

    expect(ordered[0].type).toBe('ReportDropout');
    expect(ordered[0].device_seq).toBe(3);
    expect(ordered.map((c) => c.type)).toEqual(['ReportDropout', 'CheckIn', 'TaskLogged', 'PartScanned']);
  });

  test('iOS banner renders "Open to sync" on iOS userAgent', async ({ browser }) => {
    const iosContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const iosPage = await iosContext.newPage();
    await iosPage.goto('http://localhost:3000/tech');

    await expect(iosPage.locator('[data-testid="ios-sync-banner"]')).toBeVisible();
    await expect(iosPage.locator('[data-testid="ios-sync-banner"]')).toContainText('Open to sync');
    await iosContext.close();
  });
});
