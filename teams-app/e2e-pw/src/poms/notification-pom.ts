import { expect, Locator, Page } from '@playwright/test';
import { OrgPom } from './org-pom';
import { isDate } from 'lodash';

export class NotificationPom {
  readonly assert: NotificationAsserter;
  private readonly locator: Locator;
  readonly org: OrgPom;

  constructor(readonly page: Page) {
    this.assert = new NotificationAsserter(this);
    this.locator = this.page.getByTestId('global-notification-container');
    this.org = new OrgPom(page);
  }

  async hasNotifications() {
    return Boolean(await this.locator.count());
  }

  async getStrictComplianceNotificationText() {
    return this.locator
      .getByTestId('global-notification-strict_compliance')
      .innerText();
  }
}

const isAfterNow = (date) => {
  return isDate(date) && date > new Date();
};

class NotificationAsserter {
  constructor(private readonly pom: NotificationPom) {}

  async ensureStrictComplianceNotification() {
    expect(await this.pom.hasNotifications()).toBe(true);
    const scText = await this.pom.getStrictComplianceNotificationText();
    const expectedPattern =
      /Your deployment is currently in violation of its license\. Please resolve this before .* to avoid any service interruptions\./;
    expect(scText).toMatch(expectedPattern);
  }

  async ensureComplianceNotification() {
    const audit = await this.pom.org.defaultAudit();
    const org = await this.pom.org.getDefaultOrg();

    const isCompliant = await this.pom.org.isCompliant();
    if (isCompliant) {
      expect(await this.pom.hasNotifications()).toBe(false);
    }
    if (!isCompliant && isAfterNow(new Date(org?.strictComplianceDate))) {
      await this.ensureStrictComplianceNotification();
    }
  }
}
