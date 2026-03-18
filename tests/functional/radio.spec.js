const { test, expect } = require('@playwright/test');

test.describe('Wayback Radio shell', () => {
  test('renders the radio interface', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Recording years')).toBeVisible();
    await expect(page.getByTitle('Play/Pause')).toBeVisible();
    await expect(page.getByLabel('Previous item')).toBeVisible();
    await expect(page.getByLabel('Next item')).toBeVisible();
  });

  test('keeps year query parameters shareable', async ({ page }) => {
    await page.goto('/?year=1942');

    await expect(page).toHaveURL(/year=1942/);
    await expect(page.locator('#year-selector-mobile')).toHaveValue('1942');
  });
});
