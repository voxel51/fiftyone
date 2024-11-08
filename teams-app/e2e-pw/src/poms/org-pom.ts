import { Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;
const { SUPERADMIN_SECRET } = process.env;

let cachedOrgs = null;
let cachedAudit = null;

async function getOrgs() {
  if (!cachedOrgs) {
    const orgsReq = await fetch(`${BASE_URL}/cas/api/orgs`, {
      headers: { 'X-API-KEY': SUPERADMIN_SECRET },
      method: 'GET'
    });
    cachedOrgs = await orgsReq.json(); // assuming the response is JSON
  }
  return cachedOrgs;
}

async function getAudit(defaultOrgId) {
  if (!cachedAudit) {
    const auditReq = await fetch(
      `${BASE_URL}/cas/api/orgs/${defaultOrgId}/audit`,
      {
        headers: {
          'X-API-KEY': SUPERADMIN_SECRET,
          'Content-Type': 'application/json'
        },
        method: 'GET'
      }
    );
    cachedAudit = await auditReq.json(); // assuming the response is JSON
  }
  return cachedAudit;
}

export class OrgPom {
  constructor(readonly page: Page) {}

  async getDefaultOrg() {
    const orgs = await getOrgs();
    const defaultOrg = orgs.organizations.filter((org) => org.isDefault)[0];
    return defaultOrg;
  }

  async defaultRoleDefinitions(orgId?: string) {
    if (!orgId) {
      const org = await this.getDefaultOrg();
      return org.roleDefinitions;
    }
  }

  async pypiToken(orgId?: string) {
    if (!orgId) {
      const org = await this.getDefaultOrg();
      return org.pypiToken;
    }
  }

  async defaultOrgId() {
    const org = await this.getDefaultOrg();
    return org.id;
  }

  async defaultAudit() {
    const audit = await getAudit(await this.defaultOrgId());
    return audit;
  }

  async isCompliant() {
    const audit = await this.defaultAudit();
    let isCompliant = true;
    Object.entries(audit).forEach(
      ([_, item]: [string, { remaining: number }]) => {
        if (item?.remaining && item?.remaining < 0) {
          isCompliant = false;
        }
      }
    );
    return isCompliant;
  }
}
