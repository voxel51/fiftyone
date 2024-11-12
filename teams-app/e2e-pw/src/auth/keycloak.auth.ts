import { test } from '@playwright/test';
import { STORAGE_STATE_PATH } from '../../playwright.config';
import { KeycloakPom } from '../poms/keycloak-pom';

const setup = test.extend<{
  keycloak: KeycloakPom;
}>({
  keycloak: async ({ page }, use) => {
    await use(new KeycloakPom(page));
  }
});

setup('authenticate', async ({ page, keycloak }) => {
  await keycloak.loginToApp();
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
