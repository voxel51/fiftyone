import { expect, test as setup } from '@playwright/test';
import { STORAGE_STATE_PATH } from 'playwright.config';

setup('authenticate', async ({ page, request }) => {
  await page.goto('/');

  await page
    .getByLabel('Email address')
    .fill(process.env.AUTH0_CLIENT_USERNAME);
  await page.getByLabel('Password').fill(process.env.AUTH0_CLIENT_PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('http://localhost:3057/datasets');
  await expect(page.getByTestId('btn-account-settings')).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
