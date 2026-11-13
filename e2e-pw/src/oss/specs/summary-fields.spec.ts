import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("summary-fields");

const SUMMARY = { one: "two", three: "four" };
const SUMMARIES = [{ five: "six", seven: "eight" }, { nine: "ten" }];

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    schema: {
      summary: "DynamicEmbeddedDocument",
      "summary.one": "StringField",
      "summary.three": "StringField",
      summaries: "ListField<DynamicEmbeddedDocument>",
      "summaries.five": "StringField",
      "summaries.seven": "StringField",
      "summaries.nine": "StringField",
    },
    withSampleData: () => ({
      summary: { _cls: "DynamicEmbeddedDocument", ...SUMMARY },
      summaries: SUMMARIES.map((summary) => ({
        _cls: "DynamicEmbeddedDocument",
        ...summary,
      })),
    }),
    appConfig: {
      sidebar_groups: [
        { name: "summaries", paths: ["summary", "summaries"], expanded: true },
      ],
    },
  });
});

test.describe.serial("summary fields", () => {
  test("modal sidebar summary fields render", async ({
    eventUtils,
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await modal.afterSampleLoaded(() => grid.openFirstSample(), true);
    await modal.sidebar.assert.verifyObject("summary", SUMMARY);
    await eventUtils.after("animation-onRest", async () => {
      await modal.sidebar.clickFieldDropdown("summaries");
    });
    await modal.sidebar.assert.verifyObject(
      "summaries",
      Object.assign({}, ...SUMMARIES),
    );
  });
});
