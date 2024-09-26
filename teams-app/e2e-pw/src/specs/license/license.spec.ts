import { expect, test as setup } from '@playwright/test';
import { LicensePom } from '../../poms/license-pom';
import { DatasetPom } from '../../poms/dataset-pom';
import { SuperadminPom } from '../../poms/superadmin-pom';

import { InstallModalPom } from '../../poms/install-modal-pom';
import { SettingsRolesPom } from 'src/poms/settings-roles-pom';
import { NotificationPom } from 'src/poms/notification-pom';

const { KC_GUEST_EMAIL, KC_GUEST_USERNAME } = process.env;
export const BASE_URL = process.env.BASE_URL;

const TEST_DATASET_NAME = 'test-e2e';

const test = setup.extend<{
  license: LicensePom;
  dataset: DatasetPom;
  superadmin: SuperadminPom;
  installModal: InstallModalPom;
  settingsConfig: SettingsRolesPom;
  notification: NotificationPom;
}>({
  license: async ({ page }, use) => {
    await use(new LicensePom(page));
  },
  dataset: async ({ page }, use) => {
    await use(new DatasetPom(page));
  },
  superadmin: async ({ page }, use) => {
    await use(new SuperadminPom(page));
  },
  installModal: async ({ page }, use) => {
    await use(new InstallModalPom(page));
  },
  settingsConfig: async ({ page }, use) => {
    await use(new SettingsRolesPom(page));
  },
  notification: async ({ page }, use) => {
    await use(new NotificationPom(page));
  }
});

test.describe('Tests license data displayed in Teams App', async () => {
  test('pypitoken in install modal', async ({ installModal }) => {
    await installModal.assert.ensureCorrectPypiToken();
  });

  test('Admin alert in settings > team > users', async ({ license }) => {
    await license.assert.ensureAlertShownCorrectly();
  });

  test('Admin tooltip in settings > team > users', async ({ license }) => {
    await license.assert.ensureTableShownCorrectly();
  });

  test('license table in grant dataset access modal', async ({
    license,
    dataset,
    page
  }) => {
    await dataset.deleteIfExists(TEST_DATASET_NAME);
    await dataset.create(TEST_DATASET_NAME);

    await dataset.goToAccessPage(TEST_DATASET_NAME);
    await dataset.openGrantAccessModal();

    await license.assert.ensureTableShownCorrectly(false);
    await license.assert.ensureAlertShownCorrectly(false);
  });

  test('super admin audit page', async ({ license, superadmin, page }) => {
    await superadmin.assert.ensureAuditPage();
  });

  test('roles page and role definitions', async ({ settingsConfig }) => {
    await settingsConfig.assert.ensureRolesPageTable();
  });

  test('add/remove user and license alert updates', async ({
    license,
    superadmin
  }) => {
    await license.goTo(`${BASE_URL}/settings/team/users`);
    const currentSeats = await license.getSeatsInfo();

    await superadmin.signin();
    await superadmin.addUser(KC_GUEST_USERNAME, KC_GUEST_EMAIL);

    await license.goTo(`${BASE_URL}/settings/team/users`);
    const newSeats = await license.getSeatsInfo();

    await superadmin.goToAdminPage();
    await superadmin.removeUser(KC_GUEST_USERNAME);

    expect(newSeats.users.current).toBeGreaterThan(currentSeats.users.current);
    expect(newSeats.users.remaining).toBeLessThan(currentSeats.users.remaining);
    expect(newSeats.users.total).toEqual(currentSeats.users.total);
  });

  test('global notification when non-compliant but within the grace period', async ({
    page,
    dataset,
    notification
  }) => {
    await page.goto(`${BASE_URL}/datasets`);

    //we should verify that the datasets page is loaded
    expect(dataset.createBtn).toBeVisible();

    await notification.assert.ensureComplianceNotification();
  });
});
