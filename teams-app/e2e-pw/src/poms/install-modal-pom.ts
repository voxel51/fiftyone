import { expect, Locator, Page } from '@playwright/test';
import { OrgPom } from './org-pom';

const BASE_URL = process.env.BASE_URL;

export class InstallModalPom {
  readonly assert: InstallModalAsserter;
  private readonly locator: Locator;
  readonly org: OrgPom;

  constructor(readonly page: Page) {
    this.org = new OrgPom(page);
    this.assert = new InstallModalAsserter(this);
  }

  async getInstallCode() {
    const dialogContainer = this.page.getByTestId('dialog');
    const installText = await dialogContainer
      .getByTestId('code')
      .getByRole('code')
      .nth(1)
      .innerText();
    return installText;
  }

  async open() {
    await this.page.goto(`${BASE_URL}/datasets`, {
      waitUntil: 'networkidle'
    });
    const container = this.page.getByTestId('profile-menu');
    await container.getByTestId('btn-account-settings').click();
    await this.page.waitForSelector('[data-testid=menu-content]', {
      state: 'visible'
    });

    const menuContainer = this.page.getByTestId('menu-content');
    await menuContainer.getByTestId('install').click();
    await this.page.waitForSelector('[data-testid=dialog]', {
      state: 'visible'
    });
  }

  async close() {
    const dialogContainer = this.page.getByTestId('dialog');
    await dialogContainer.getByTestId('close').click();
  }
}

class InstallModalAsserter {
  constructor(private readonly installModal: InstallModalPom) {}

  async ensureCorrectPypiToken() {
    const pypiToken = await this.installModal.org.pypiToken();
    await this.installModal.open();

    const installCode = await this.installModal.getInstallCode();
    if (installCode.includes('--extra-index-url')) {
      expect(installCode).toContain(`pip install --extra-index-url`);
    } else {
      expect(installCode).toEqual(
        `pip install --index-url https://${pypiToken}@pypi.fiftyone.ai fiftyone`
      );
    }

    await this.installModal.close();
  }
}
