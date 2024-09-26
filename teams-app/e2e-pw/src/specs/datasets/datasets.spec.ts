import { test as setup } from '@playwright/test';
import { DatasetPom } from '../../poms/dataset-pom';

export const BASE_URL = process.env.BASE_URL;

const TEST_DATASET_NAME = 'test-e2e';

const test = setup.extend<{
  dataset: DatasetPom;
}>({
  dataset: async ({ page }, use) => {
    await use(new DatasetPom(page));
  }
});

test.describe('dataset and listing page', async () => {
  test('create a dataset and search the dataset', async ({ dataset }) => {
    await dataset.deleteIfExists(TEST_DATASET_NAME);
    await dataset.create(TEST_DATASET_NAME);
    await dataset.assert.ensureDatasetExist(TEST_DATASET_NAME);
  });

  test('search and pin a dataset', async ({ dataset }) => {
    await dataset.unpinIfPinned(TEST_DATASET_NAME);
    await dataset.search(TEST_DATASET_NAME);
    await dataset.assert.ensureSearchResults(TEST_DATASET_NAME);

    await dataset.pin(TEST_DATASET_NAME);
    await dataset.assert.ensureDatasetPinned(TEST_DATASET_NAME);
  });

  test('paginate dataset listing', async ({ dataset }) => {
    await dataset.assert.ensurePagination();
  });

  test('delete a dataset', async ({ dataset }) => {
    await dataset.delete(TEST_DATASET_NAME);
  });
});
