import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix(`dynamic-groups-cifar`);

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo
  import fiftyone.zoo as foz

  cifar10_dataset = foz.load_zoo_dataset("cifar10", split="test", max_samples=50, dataset_name="${datasetName}")
  cifar10_dataset.persistent = True
`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.skip("valid candidates for group-by keys", async ({ grid }) => {
  await grid.actionsRow.toggleCreateDynamicGroups();
  await verifyCandidateFields(grid, ["ground_truth.id", "ground_truth.label"]);
});

const verifyCandidateFields = async (grid: GridPom, fields: string[]) => {
  await grid.actionsRow.gridActionsRow.getByTestId("group-by-selector").click();
  const results = grid.actionsRow.gridActionsRow.getByTestId(
    "selector-results-container"
  );
  const options = grid.actionsRow.gridActionsRow
    .getByTestId("selector-results-container")
    .locator("div");

  const count = await options.count();
  expect(count).toBe(fields.length);

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const fieldWithDotEscaped = field.replace(/\./g, "\\.");
    const visible = await results
      .getByTestId(`selector-result-${fieldWithDotEscaped}`)
      .isVisible();
    expect(visible).toBe(true);
  }
};
