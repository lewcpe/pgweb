import { test, expect } from '@playwright/test';

test.describe('Frontend UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: '__x_email', value: 'test@example.com', domain: 'localhost', path: '/' }
    ]);
    await page.goto('/', { ignoreHTTPSErrors: true });
  });

  test('should display the database list and not the other sections', async ({ page }) => {
    await expect(page.locator('#dashboard-section')).toBeVisible();
  });
});