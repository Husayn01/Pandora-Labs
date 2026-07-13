import { expect, test } from '@playwright/test';

test.describe('public product surface', () => {
  test('landing page communicates the voice-first product and navigates to signup', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Run the work. Just say it.');
    await expect(page.getByText(/ordinary phone/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /start free/i }).first()).toHaveAttribute('href', '/signup');

    await page.getByRole('link', { name: /start free/i }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: /create|start|workspace/i })).toBeVisible();
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
});
