import { Browser, expect, Locator, Page } from '@playwright/test';
import { OrgPom } from './org-pom';
import sortBy from 'lodash/sortBy';

const CAS_SECRET = process.env.SUPERADMIN_SECRET;
const BASE_URL = process.env.BASE_URL;
const header = ['Attribute', 'ADMIN', 'MEMBER', 'COLLABORATOR', 'GUEST'];

export class SettingsRolesPom {
  readonly assert: SettingsRolesAsserter;
  readonly org: OrgPom;
  private readonly locator: Locator;

  constructor(readonly page: Page) {
    this.org = new OrgPom(page);
    this.assert = new SettingsRolesAsserter(this);
    this.locator = this.page.getByTestId('security-roles');
  }

  async goToSettingsRole() {
    await this.page.goto(`${BASE_URL}/settings/security/roles`, {
      waitUntil: 'networkidle'
    });
  }

  async goToAdminPage() {
    await this.page.goto(`${BASE_URL}/cas/admins`, {
      waitUntil: 'networkidle'
    });
  }

  async getPageTitle() {
    return await this.locator.getByTestId('title').first().innerText();
  }

  async getPageSubtitle() {
    return await this.locator.getByTestId('description').innerText();
  }

  async getLearnMoreLink() {
    return await this.locator.getByTestId('learn-more').innerText();
  }

  async getTableRows() {
    const tableBody = this.locator.getByTestId('table-body');
    return await tableBody.locator('tr').all();
  }
}

class SettingsRolesAsserter {
  constructor(private readonly pom: SettingsRolesPom) {}

  async ensurePageTitle() {
    const pageTitle = await this.pom.getPageTitle();
    expect(pageTitle).toBe('Roles');
  }

  async ensurePageSubtitle() {
    const subtitle = await this.pom.getPageSubtitle();
    expect(subtitle).toBe(
      'Detailed access to actions of different roles in the organization '
    );
  }

  async ensureLearnMoreLink() {
    const learnMore = await this.pom.getLearnMoreLink();
    expect(learnMore).toBe('Learn more about roles and permissions');
  }

  private async roleDefinitionMatrix() {
    const roleDefinitions = await this.pom.org.defaultRoleDefinitions();
    let expected: (string | boolean)[][] = [header];

    Object.keys(roleDefinitions['ADMIN']).forEach(
      (roleDef: string, idx: number) => {
        if (['maxSeats'].includes(roleDef)) return;
        if (roleDef === 'executeBuiltinPlugins') return;

        expected.push([]);
        expected[idx + 1].push(roleDef);

        Object.keys(roleDefinitions).forEach((role: string) => {
          if (!expected[0].includes(role)) return;
          expected[idx + 1].push(roleDefinitions[role][roleDef]);
        });
      }
    );

    return sortBy(expected, [0]);
  }

  private async tableValuesMatrix() {
    const rows = await this.pom.getTableRows();
    let values = [header];

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const tds = await tr.locator('td').all();
      values.push([]);

      for (let j = 0; j < tds.length; j++) {
        const tc = tds[j];
        const val = await tc.innerText();
        const clearIconCount = await tc.getByTestId('ClearIcon').count();
        const checkIconCount = await tc.getByTestId('CheckIcon').count();

        let attrValue;

        const title = tc.getByTestId('title');
        if (await title.count()) {
          attrValue = await title.innerText();
          const attrKeyRaw = attrValue.replace(/\s+/g, '');
          attrValue = attrKeyRaw.charAt(0).toLowerCase() + attrKeyRaw.slice(1);
          if (attrValue === 'useAPIKeys') {
            attrValue = 'useApiKeys';
          }
          if (attrValue === 'executebuilt-inPlugins') {
            attrValue = 'executeBuiltinPlugins';
          }
          if (attrValue === 'executecustomPlugins') {
            attrValue = 'executeCustomPlugins';
          }
        } else if (Boolean(val)) {
          attrValue = val;
        } else if (clearIconCount > 0) {
          attrValue = false;
        } else if (checkIconCount > 0) {
          attrValue = true;
        } else {
          throw Error('unknown attribute type');
        }

        values[i + 1].push(attrValue);
      }
    }

    return sortBy(values, [0]);
  }

  async ensureTable() {
    const expected = await this.roleDefinitionMatrix();
    const actual = await this.tableValuesMatrix();
    expect(actual).toStrictEqual(expected);
  }

  async ensureRolesPageTable() {
    await this.pom.goToSettingsRole();

    await this.ensurePageTitle();
    await this.ensurePageSubtitle();
    await this.ensureLearnMoreLink();

    await this.ensureTable();
  }
}
