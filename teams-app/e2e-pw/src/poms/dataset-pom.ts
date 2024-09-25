import { Locator, Page, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;

export class DatasetPom {
  readonly assert: DatasetAsserter;
  private readonly locator: Locator;

  constructor(readonly page: Page) {
    this.assert = new DatasetAsserter(this);
  }

  get deleteBtn() {
    return this.page.getByTestId('dataset-delete-btn');
  }

  get createBtn() {
    return this.page.getByTestId('dataset-create-btn');
  }

  async exists(name: string) {
    const searchFieldParent = this.page.getByTestId('datasets-search-field');
    await searchFieldParent.locator('input').fill(name);
    await this.page.waitForSelector('ul[role="listbox"]');
    await this.page.waitForSelector('[data-testid="search-in-progress-icon"]', {
      state: 'hidden'
    });

    const matchCount = await this.page
      .locator('ul[role="listbox"] li:has-text("' + name + '")')
      .count();

    return matchCount > 1
      ? this.page
          .locator('ul[role="listbox"] li:has-text("' + name + '")')
          .nth(1)
      : null;
  }

  async search(name: string) {
    await this.page.goto(`${BASE_URL}/datasets`, { waitUntil: 'networkidle' });
    const searchFieldParent = this.page.getByTestId('datasets-search-field');
    await searchFieldParent.locator('input').fill(name);
    await searchFieldParent.locator('input').press('Enter');

    await this.page.waitForLoadState('networkidle');
    await this.page.waitForSelector('[data-testid^="dataset-table-row-"]', {
      state: 'visible'
    });
  }

  async clearSearch() {
    await this.page.getByTestId('clear-search-input').click();
    await this.page.waitForLoadState('networkidle');
  }

  async pin(name: string) {
    await this.page.getByTestId(`dataset-table-row-${name}-title`).hover();
    await this.page.getByTestId(`dataset-table-row-${name}-pin`).click();
    await this.page.waitForLoadState('networkidle');
  }

  async isPinned(name: string) {
    return Boolean(
      await this.page.getByTestId(`pinned-dataset-${name}`).count()
    );
  }

  async unpinIfPinned(name: string) {
    if (await this.isPinned(name)) {
      await this.pin(name);
    }
  }

  async searchAndNavigate(
    name: string,
    page: 'samples' | 'access' = 'samples'
  ) {
    const match = await this.exists(name);
    if (match) {
      await match.click();
      await this.page.waitForURL(`**/datasets/${name}/${page}`, {
        waitUntil: 'networkidle'
      });
    }
  }

  async delete(name: string) {
    await this.page.goto(`${BASE_URL}/datasets/${name}/manage/danger_zone`, {
      waitUntil: 'networkidle'
    });

    await this.deleteBtn.click();
    await this.page.waitForSelector('[data-testid="delete-dataset-dialog"]', {
      state: 'visible'
    });
    const deleteInput = this.page.locator(
      `input[type="text"][placeholder="${name}"]`
    );
    await deleteInput.fill(name);

    const confirmDeleteBtn = this.page.getByRole('button', {
      name: 'Delete dataset'
    });
    await confirmDeleteBtn.click();
    await this.page.waitForSelector('[data-testid="delete-dataset-dialog"]', {
      state: 'hidden'
    });
  }

  async deleteIfExists(name: string) {
    await this.page.goto(`${BASE_URL}/datasets`, { waitUntil: 'networkidle' });
    const exists = await this.exists(name);

    if (exists) {
      await this.delete(name);
    }
  }

  async goToAccessPage(name: string) {
    await this.page.waitForLoadState('networkidle'); // don't remove
    await this.page.goto(`${BASE_URL}/datasets/${name}/manage/access`, {
      timeout: 600000,
      waitUntil: 'load'
    });
  }

  async openGrantAccessModal() {
    await this.page.getByTestId('dataset-access-add-user-btn').click();
    await this.page.waitForSelector('[data-testid="dataset-access-dialog"]', {
      state: 'visible'
    });
  }

  async create(name: string) {
    await this.page.goto(`${BASE_URL}/datasets`, { waitUntil: 'load' });
    await this.page.waitForSelector('[data-testid="dataset-create-btn"]', {
      state: 'visible'
    });

    await this.createBtn.click();
    await this.page.waitForSelector('[data-testid="create-dataset-modal"]', {
      state: 'visible'
    });

    const modal = this.page.getByTestId('create-dataset-modal');

    const nameInputParent = this.page.locator(
      '[data-testid="dataset-name-input"]'
    );

    await nameInputParent
      .locator('input[placeholder="Your dataset name"]')
      .fill(name);

    const response = await this.page.waitForResponse(async (response) => {
      const url = response.url();
      const status = response.status();
      const request = response.request();

      if (request.method() === 'POST') {
        const postData = request.postData();
        const parsedData = postData ? JSON.parse(postData) : null;

        // You can now check for specific properties in the payload
        const isExpectedPayload =
          parsedData?.query?.includes('DatasetSlugQuery');

        return (
          url.includes('api/proxy/graphql-v1') &&
          status === 200 &&
          isExpectedPayload
        );
      }
      return false;
    });

    const responseBody = await response.json();

    if (responseBody?.data?.datasetSlug?.available === true) {
      await modal.getByTestId('create-dataset-submit').click();

      await this.page.waitForSelector('[data-testid="create-dataset-modal"]', {
        state: 'hidden'
      });
    } else {
      throw new Error('Dataset slug is not available');
    }
  }
}

class DatasetAsserter {
  constructor(private readonly dataset: DatasetPom) {}
  async ensureDatasetExist(name: string) {
    // await this.page.goto(`${BASE_URL}/datasets`, { waitUntil: 'networkidle' });
    await this.dataset.exists(name);
  }

  async ensureDatasetPinned(name: string) {
    await this.dataset.page.getByTestId(`pinned-dataset-${name}`).isVisible();
  }

  async ensureSearchResults(name: string) {
    const allRows = this.dataset.page.locator('[data-testid="dataset-box"]');

    const rowCount = await allRows.count();
    for (let i = 0; i < rowCount; i++) {
      const rowName = await allRows.nth(i).textContent();
      expect(rowName?.toLowerCase()).toContain(name.toLowerCase());
    }
  }

  async ensurePagination() {
    await this.dataset.page.goto(`${BASE_URL}/datasets?page=1&pageSize=1`, {
      waitUntil: 'networkidle'
    });
    const paginationControl = this.dataset.page.getByTestId('go-to-next-page');
    await paginationControl.scrollIntoViewIfNeeded();
    await paginationControl.click();

    // Verify that the page navigation worked as expected
    await this.dataset.page.waitForURL('**/datasets?page=2&pageSize=1', {
      waitUntil: 'networkidle'
    });
  }
}
