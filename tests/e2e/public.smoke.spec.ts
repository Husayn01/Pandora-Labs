import { expect, test } from '@playwright/test';

test.describe('public product surface', () => {
  test('landing page communicates the voice-first product and navigates to signup', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Run the work\.\s*Just say it\./);
    await expect(page.getByText(/ordinary phone/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /start free/i }).first()).toHaveAttribute('href', '/signup');

    await page.getByRole('link', { name: /start free/i }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: /create|start|workspace/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('interactive product walkthrough is keyboard accessible', async ({ page }) => {
    await page.goto('/');

    const walkthrough = page.getByRole('tablist', { name: /operation walkthrough/i });
    await expect(walkthrough).toBeVisible();
    const confirmTab = page.getByRole('tab', { name: /confirm/i });
    await confirmTab.focus();
    await confirmTab.press('Enter');
    await expect(confirmTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText(/preview|approval|confirm/i);
  });

  test('operations console advances without shifting the surrounding experience', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('3/5').first()).toBeVisible();
    await page.getByRole('button', { name: /advance example/i }).click();
    await expect(page.getByText('4/5').first()).toBeVisible();
    await expect(page.getByText(/amina@acme\.ng\. Yes, make it 30 minutes/i)).toBeVisible();
  });

  test('mobile navigation exposes the core product sections', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 768, 'Mobile navigation only');
    await page.goto('/');

    const menu = page.getByRole('button', { name: /open navigation/i });
    await menu.click();
    await expect(page.getByRole('link', { name: 'Trust' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(page.getByRole('button', { name: /close navigation/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
