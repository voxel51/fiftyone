import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;

export class LicensePom {
  readonly assert: LicenseAsserter;
  private readonly locator: Locator;

  constructor(readonly page: Page) {
    this.assert = new LicenseAsserter(this);
  }

  async goTo(url: string) {
    await this.page.goto(url, {
      waitUntil: 'networkidle'
    });
  }

  async getInfoAlert() {
    await this.page.waitForSelector('[data-testid="license-info-alert"]');
    return this.page.getByTestId('license-info-alert');
  }

  async getInfoIcon() {
    await this.page.waitForSelector('[data-testid="license-info-icon"]');
    return this.page.getByTestId('license-info-icon');
  }

  async getLicenseCountText() {
    return await this.page.getByTestId('license-counts-text').innerText();
  }

  async getSeatsInfo() {
    await this.hoverOverLicenseInfoIcon();
    let seatsMap: { users: any; guests: any; collaborators?: any } = {
      users: {
        current: Number(
          await this.page.getByTestId('license-table-users-current').innerText()
        ),
        remaining: Number(
          await this.page
            .getByTestId('license-table-users-remaining')
            .innerText()
        ),
        total: Number(
          await this.page.getByTestId('license-table-users-total').innerText()
        )
      },
      guests: {
        current: Number(
          await this.page.getByTestId('license-table-guest-current').innerText()
        ),
        remaining: Number(
          await this.page
            .getByTestId('license-table-guest-remaining')
            .innerText()
        ),
        total: Number(
          await this.page.getByTestId('license-table-guest-total').innerText()
        )
      }
    };

    const collabCount = await this.page
      .locator('[data-testid="license-table-collaborator-current"]')
      .count();

    if (collabCount > 0) {
      seatsMap.collaborators = {
        current: Number(
          await this.page
            .getByTestId('license-table-collaborator-current')
            .innerText()
        ),
        remaining: Number(
          await this.page
            .getByTestId('license-table-collaborator-remaining')
            .innerText()
        ),
        total: Number(
          await this.page
            .getByTestId('license-table-collaborator-total')
            .innerText()
        )
      };
    }

    await this.unHoverOverLicenseInfoIcon();
    return seatsMap;
  }

  async getAuditTable() {
    await this.hoverOverLicenseInfoIcon();
    return this.page.locator('[data-testid="license-info-table"]');
  }

  async unHoverOverLicenseInfoIcon() {
    await this.page.mouse.move(0, 0);
    await this.page.waitForSelector('[data-testid="license-info-table"]', {
      state: 'hidden'
    });
  }

  async hoverOverLicenseInfoIcon() {
    const infoIcon = await this.getInfoIcon();
    await infoIcon.hover();
    await this.page.waitForSelector('[data-testid="license-info-table"]', {
      state: 'visible',
      timeout: 10000
    });
  }
}

class LicenseAsserter {
  constructor(private readonly license: LicensePom) {}

  async ensureTableShownCorrectly(routeToUsersPage: boolean = true) {
    if (routeToUsersPage) {
      await this.license.goTo(`${BASE_URL}/settings/team/users`);
    }

    const table = await this.license.getAuditTable();
    await expect(table).toBeVisible();

    await expect(
      table.getByTestId('license-info-table-header-role')
    ).toHaveText('Role');
  }

  async ensureAlertShownCorrectly(routeToUsersPage: boolean = true) {
    if (routeToUsersPage) {
      await this.license.goTo(`${BASE_URL}/settings/team/users`);
    }
    const seatMap = await this.license.getSeatsInfo();

    const alertText = await this.license.getLicenseCountText();

    let expectedText = '';
    if (!seatMap?.collaborators) {
      expectedText = `Users (Admins, Members, Collaborators): ${seatMap.users.remaining} Guests: ${seatMap.guests.remaining}`;
    } else {
      expectedText = `Users (Admins, Members): ${seatMap.users.remaining} Guests: ${seatMap.guests.remaining} Collaborators: ${seatMap.collaborators.remaining}`;
    }

    expect(alertText).toContain(expectedText);
  }
}
