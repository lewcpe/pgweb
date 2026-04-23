import { test, expect } from '@playwright/test';

test.describe('Frontend Database Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: '__x_email', value: 'test@example.com', domain: 'localhost', path: '/' }
    ]);
    await page.goto('/', { ignoreHTTPSErrors: true });
  });

  test('should display the database list on the main page', async ({ page }) => {
    await expect(page.locator('#dashboard-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Databases', exact: true })).toBeVisible();
  });

  test('should open the create database dialog', async ({ page }) => {
    await page.getByRole('button', { name: /create database/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should show validation error for invalid database name', async ({ page }) => {
    await page.getByRole('button', { name: /create database/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#name').fill('INVALID_NAME');
    await page.getByRole('button', { type: 'submit', name: /create database/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});