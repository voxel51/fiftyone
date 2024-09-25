import { Browser, expect, Locator, Page } from '@playwright/test';
import { OrgPom } from './org-pom';

const CAS_SECRET = process.env.SUPERADMIN_SECRET;
const BASE_URL = process.env.BASE_URL;

export class SuperadminPom {
  readonly assert: SuperadminAsserter;
  readonly org: OrgPom;
  private readonly locator: Locator;

  constructor(readonly page: Page) {
    this.org = new OrgPom(page);
    this.assert = new SuperadminAsserter(this);
  }

  async goToAdminPage() {
    await this.page.goto(`${BASE_URL}/cas/admins`, {
      waitUntil: 'networkidle'
    });
  }

  async goToAuditPage() {
    await this.page.goto(`${BASE_URL}/cas/audit`, { waitUntil: 'networkidle' });
  }

  async signin() {
    await this.page.goto(`${BASE_URL}/cas`, { waitUntil: 'load' });
    await this.page.getByPlaceholder('API key').fill(CAS_SECRET);
    await this.page.getByTestId('sign-in').click();

    await this.page.waitForSelector('button[data-testid="configurations"]', {
      state: 'visible'
    });
  }

  async addUser(username: string, email: string) {
    const page = this.page;
    await page.goto(`${BASE_URL}/cas/admins`, {
      waitUntil: 'networkidle'
    });

    await page.waitForSelector('[data-testid="add-admin"]', {
      state: 'visible'
    });
    await page.getByTestId('add-admin').click();

    await page.waitForSelector('[role="dialog"]', {
      state: 'visible'
    });
    const adminDialog = page.locator('[data-testid="add-admin-content"]');

    const adminNameInput = adminDialog.locator(
      '[data-testid="admin-name"] input'
    );
    await adminNameInput.fill(username);

    const adminEmail = page.locator('[data-testid="admin-email"] input');
    await adminEmail.fill(email);

    await page.getByTestId('confirm-add').click();

    await expect(page.locator(`text=${email}`)).toBeVisible({
      timeout: 2000
    });
  }

  async removeUser(username: string) {
    await SuperadminPom.removeUser(this.page, username);
  }

  static async removeUser(page: Page, username: string) {
    await page.goto(`${BASE_URL}/cas/admins`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    const existingCount = await page
      .getByTestId(`delete-user-${username}`)
      .count();

    if (existingCount) {
      const deleteBtns = await page
        .getByTestId(`delete-user-${username}`)
        .all();
      for (let i = 0; i < deleteBtns.length; i++) {
        const existing = deleteBtns[0];
        await existing.click();
        await page.waitForSelector('[role="dialog"]', {
          state: 'visible'
        });
        await page.getByTestId('delete-user').click();
        await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
        await page.waitForSelector('[data-testid="admins-table"]');
      }
    }
  }
}

class SuperadminAsserter {
  constructor(private readonly superadmin: SuperadminPom) {}

  async ensureAuditPage() {
    await this.superadmin.signin();
    await this.superadmin.goToAuditPage();
    const audit = await this.superadmin.org.defaultAudit();

    const auditContainer = this.superadmin.page.getByTestId('audit-container');
    await expect(auditContainer.getByTestId('title')).toHaveText('License');

    const isCompliant = await this.superadmin.org.isCompliant();
    if (isCompliant) {
      const compliantBadgeCount = await auditContainer
        .getByTestId('compliant-badge')
        .count();
      expect(compliantBadgeCount).toBe(1);
    } else {
      const notCompliantBadgeCount = await auditContainer
        .getByTestId('not-compliant-badge')
        .count();
      expect(notCompliantBadgeCount).toBe(1);
    }

    const defaultOrg = await this.superadmin.org.getDefaultOrg();
    const expiration = await auditContainer.getByTestId('expires').innerText();
    expect(expiration).not.toBe('Invalid Date');
    const strictComplianceDate = await auditContainer
      .getByTestId('strict-compliance-date')
      .innerText();
    expect(strictComplianceDate).not.toBe('Invalid Date');
    const table = auditContainer.getByTestId('table');
    if (defaultOrg.hasCollaborator) {
      expect(await table.locator('tr').count()).toBe(4);
    } else {
      expect(await table.locator('tr').count()).toBe(3);
    }

    const {
      users: { current: userCurrent, remaining: userRemaining },
      guests: { current: guestCurrent, remaining: guestRemaining },
      collaborators: { current: collabCurrent, remaining: collabRemaining }
    } = { collaborators: {}, guests: {}, users: {}, ...audit };

    const expectedValues = [
      ['Role', 'Occupancy', 'Remaining', 'Max Seats'],
      ['Users', userCurrent, userRemaining, userCurrent + userRemaining],
      ['Guests', guestCurrent, guestRemaining, guestCurrent + guestRemaining],
      [
        'Collaborators',
        collabCurrent,
        collabRemaining,
        collabCurrent + collabRemaining
      ]
    ];

    // collaborator row
    for (let i = 0; i < 3; i++) {
      const row = table.locator('tr').nth(i);

      for (let j = 0; j < 4; j++) {
        if (i === 0) {
          const col = await row.locator('th').nth(j).innerText();
          expect(col).toBe(expectedValues[i][j]);
        } else {
          const col = await row.locator('td').nth(j).innerText();
          if (i === 1) {
            expect(col).toBe(String(expectedValues[i][j]));
          } else if (i === 2) {
            expect(col).toBe(String(expectedValues[i][j]));
          } else if (i === 3 && defaultOrg.hasCollaborator) {
            expect(col).toBe(String(expectedValues[i][j]));
          }
        }
      }
    }
  }
}
