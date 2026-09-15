/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating and deleting a standalone sample-level Regression:
 *   - the Regression action creates a label, opens the edit form with a numeric
 *     `value` input (no class picker), and commits the typed value through the
 *     engine (persisted, true round-trip),
 *   - the regression can be deleted.
 *
 * Persistence is read back from Python (`getRegressionState`) — a true server
 * round-trip on the sample's `Regression` field — once the sample PATCH that
 * carries the change has been answered.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-regression");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const FIELD = "score";
const VALUE = "0.75";

/**
 * The sample write whose body carries `fragment`. Creating a chip already
 * writes an empty label, so the write we care about is matched on content,
 * not on being the next one.
 */
const savedSample = (page: Page, fragment: string) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()) &&
      (r.request().postData() ?? "").includes(fragment),
  );

/** Clear the sample's regression so each serial test starts empty. */
const clearRegression = () => `
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
sample["${FIELD}"] = None
sample.save()
`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { [FIELD]: "Regression" },
  });
  await annotateSDK.updateLabelSchema(datasetName, FIELD, {
    type: "regression",
    attributes: [{ name: "value", type: "float", component: "text" }],
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, FIELD);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("2D annotation regression", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.executePythonCode(clearRegression());
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("creating a regression assigns a value and persists", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.createRegression();

    // the new regression opens its edit form with a numeric value input and
    // no class picker; typing a value commits it.
    await expect(modal.sidebar.edit.getFieldContainer("label")).toBeHidden();
    const saved = savedSample(page, VALUE);
    await modal.sidebar.edit.setFieldValue("value", VALUE);
    await modal.sidebar.edit.assert.verifyFieldValue("value", VALUE);
    await saved;

    // true round-trip: the field holds the typed value
    expect(
      (await annotateSDK.getRegressionState(datasetName, FIELD)).value,
    ).toBe(Number(VALUE));
  });

  test("a regression can be deleted", async ({ annotateSDK, modal, page }) => {
    await modal.sidebar.annotate.createRegression();
    const saved = savedSample(page, VALUE);
    await modal.sidebar.edit.setFieldValue("value", VALUE);
    await saved;

    // the new regression is selected (form open) — delete it.
    const deleted = savedSample(page, '"remove"');
    await modal.sidebar.edit.deleteLabel();
    await deleted;

    expect(
      (await annotateSDK.getRegressionState(datasetName, FIELD)).present,
    ).toBe(false);
  });
});
