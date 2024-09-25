import { Locator, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;
const USERNAME = process.env.KC_ADMIN_USERNAME;
const USER_PASSWORD = process.env.KC_ADMIN_PASSWORD;
const KC_ADMIN_PATH = process.env.KC_ADMIN_PATH;
const KC_ADMIN_USERS_PATH = process.env.KC_ADMIN_USERS_PATH;
const KC_GUEST_PASSWORD = process.env.KC_GUEST_PASSWORD;

export class KeycloakPom {
  readonly assert: KeycloakAsserter;
  private readonly locator: Locator;

  constructor(readonly page: Page) {
    this.assert = new KeycloakAsserter(this);
  }

  static async addUser(newPage: Page, username: string, email: string) {
    const page = newPage;
    await page.goto(KC_ADMIN_USERS_PATH, { waitUntil: 'networkidle' });

    await page.waitForSelector('[data-testid="add-user"]', {
      state: 'visible'
    });
    await page.getByTestId('add-user').click();
    await page.waitForLoadState('networkidle');

    await page.locator('input[name="username"]').fill(username);
    await page.getByTestId('email-input').fill(email);

    const checkbox = page.locator(
      'input[type="checkbox"][data-testid="email-verified-switch"]'
    );
    const isChecked = await checkbox.isChecked();
    if (!isChecked) {
      const checkboxBoundingBox = await checkbox.boundingBox();
      if (checkboxBoundingBox) {
        await page.mouse.click(
          checkboxBoundingBox.x + checkboxBoundingBox.width + 10,
          checkboxBoundingBox.y + checkboxBoundingBox.height / 2
        );
      }
    }

    await page.getByTestId('create-user').click();
    await page.waitForSelector('[data-testid="credentials"]', {
      state: 'visible'
    });

    await page.getByTestId('credentials').click();
    await page.waitForLoadState('networkidle');

    await page.getByTestId('no-credentials-empty-action').click();
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });
    const dialog = page.locator('[role="dialog"]');

    await dialog.getByTestId('passwordField').fill(KC_GUEST_PASSWORD);
    await dialog
      .getByTestId('passwordConfirmationField')
      .fill(KC_GUEST_PASSWORD);

    const passCheckbox = dialog.locator('input[type="checkbox"]').first();
    const isCheckedPass = await passCheckbox.isChecked();
    if (isCheckedPass) {
      const checkboxBoundingBox = await passCheckbox.boundingBox();
      if (checkboxBoundingBox) {
        await page.mouse.click(
          checkboxBoundingBox.x + checkboxBoundingBox.width - 10,
          checkboxBoundingBox.y + checkboxBoundingBox.height / 2
        );
      }
    }

    await page.getByTestId('confirm').click();
    await page.goto(KC_ADMIN_USERS_PATH, { waitUntil: 'networkidle' });
  }

  static async removeUser(newPage: Page, email: string) {
    const page = newPage;
    await page.goto(KC_ADMIN_USERS_PATH);
    await page.waitForLoadState('networkidle');

    await page.goto(KC_ADMIN_PATH, { waitUntil: 'networkidle' });

    await page.locator('input[placeholder*="Search"]').fill(email);
    await page.locator('button[type="submit"][aria-label="Search"]').click();
    await page.waitForLoadState('networkidle');
    // TODO: improve this
    await page.waitForTimeout(2000);

    const guestLink = await page.locator('a:has-text("guest")').count();
    if (guestLink) {
      await page.locator('input[aria-label="Select row 0"]').click();
      await page.getByTestId('delete-user-btn').click();
      await page.waitForSelector('button[data-testid="confirm"]', {
        state: 'visible'
      });
      await page.locator('button[data-testid="confirm"]').click();
      await page.goto(KC_ADMIN_USERS_PATH, { waitUntil: 'networkidle' });
    }
  }

  async loginToApp() {
    const page = this.page;
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const continueButton = page.locator('button', {
      hasText: 'Continue with'
    });
    await continueButton.click();
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[name="username"]');
    await usernameInput.fill(USERNAME);

    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.fill(USER_PASSWORD);

    const loginButton = page.locator('input[name="login"]');
    await loginButton.click();

    await page.waitForLoadState('networkidle');
  }
}

class KeycloakAsserter {
  constructor(private readonly user: KeycloakPom) {}
}
