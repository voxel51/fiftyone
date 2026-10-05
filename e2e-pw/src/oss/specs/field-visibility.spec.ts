import { test as base } from "src/oss/fixtures";
import { FieldVisibilityPom } from "src/oss/poms/field-visibility/field-visibility";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-detections");

// the default fields, always selected, then the dataset's own fields, as the
// selection list orders them
const DEFAULT_FIELDS = ["filepath", "id", "metadata", "tags"];
const OWN_FIELDS = [
  "uniqueness",
  "predictions",
  "last_modified_at",
  "index",
  "ground_truth",
  "created_at",
];
const DETECTION_ATTRIBUTES = ["confidence", "id", "label", "mask_path", "tags"];
const detectionsPaths = (field: string) => [
  field,
  `${field}.detections`,
  ...DETECTION_ATTRIBUTES.map((name) => `${field}.detections.${name}`),
];
const METADATA_PATHS = [
  "metadata",
  ...["height", "mime_type", "num_channels", "size_bytes", "width"].map(
    (name) => `metadata.${name}`,
  ),
];
// with nested fields shown, every path in schema order
const ALL_PATHS = [
  "created_at",
  "filepath",
  ...detectionsPaths("ground_truth"),
  "id",
  "index",
  "last_modified_at",
  ...METADATA_PATHS,
  ...detectionsPaths("predictions"),
  "tags",
  "uniqueness",
];
// a filter rule selects the read-only fields and the paths it matches; the
// list shows the selected rows in reverse path order, then the rest in order
const FILTER_DEFAULTS = [
  "created_at",
  "filepath",
  "id",
  "last_modified_at",
  "metadata",
  "tags",
];
const filterResults = (matches: string[]) => {
  const checked = [...FILTER_DEFAULTS, ...matches];
  return {
    checked: [...checked].sort().reverse(),
    unchecked: ALL_PATHS.filter((path) => !checked.includes(path)),
  };
};
// metadata.width carries the owner and description the spec sets
const METADATA_MATCH = METADATA_PATHS.slice(1);

const test = base.extend<{
  fieldVisibility: FieldVisibilityPom;
  sidebar: SidebarPom;
}>({
  fieldVisibility: async ({ page, eventUtils }, use) => {
    const gridPom = new GridPom(page, eventUtils);
    await use(new FieldVisibilityPom(page, gridPom, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  // the field visibility asserter reads these fields by name
  await datasetFactory.createDataset({
    datasetName,
    schema: {
      ground_truth: "Detections",
      predictions: "Detections",
      uniqueness: "FloatField",
    },
  });

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.load_dataset("${datasetName}")

    field = dataset.get_field("ground_truth")
    field.description = "ground_truth description"
    field.info = {"owner": "bob"}
    field.save()

    field = dataset.get_field("metadata.width")
    field.description = "metadata.width description"
    field.info = {"owner": "bob"}
    field.save()
  `);
});

test.describe.serial("field visibility", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("deselect all fields works - deselects enabled fields", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.hoverIcon();
    await fieldVisibility.asserter.fieldVisibilityIconHasTooltip();
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.toggleAllSelection();
    await fieldVisibility.asserter.assertSelection({
      checked: DEFAULT_FIELDS,
      unchecked: OWN_FIELDS,
    });
  });

  test("show nested field works", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.toggleShowNestedFields();
    await fieldVisibility.asserter.assertShownFields(ALL_PATHS);

    await fieldVisibility.asserter.assertMetadataInVisible();
    await fieldVisibility.toggleShowMetadata();
    await fieldVisibility.asserter.assertMetadataVisible();
  });

  test("show metadata works for nested fields", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.asserter.assertMetadataInVisible("metadata.width");
    await fieldVisibility.toggleShowNestedFields();
    await fieldVisibility.toggleShowMetadata();
    await fieldVisibility.asserter.assertMetadataVisible("metadata.width");
  });

  test("reset works", async ({ fieldVisibility, sidebar }) => {
    await fieldVisibility.hideFields(["predictions", "ground_truth"]);
    await sidebar.asserter.assertFieldsNotInSidebar([
      "predictions",
      "ground_truth",
    ]);

    // reopen modal
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.clickReset();
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);
  });

  test("filter rule tab has Examples when no filter rule", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.asserter.assertFilterRuleExamplesVisible();
  });

  test("non-matching filter rule shows default paths as results", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("metadata");
    await fieldVisibility.asserter.assertSelection(
      filterResults(METADATA_MATCH),
      "all",
    );
  });

  test("filter rule by info shows results", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("owner:bob");
    await fieldVisibility.asserter.assertSelection(
      filterResults([...METADATA_MATCH, "ground_truth"]),
      "all",
    );
  });

  test("filter rule by description shows results", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput(
      "description:ground_truth description",
    );
    await fieldVisibility.asserter.assertSelection(
      filterResults(["ground_truth"]),
      "all",
    );
  });

  test("filter rule by name shows results", async ({ fieldVisibility }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("name:predictions");
    await fieldVisibility.asserter.assertSelection(
      filterResults(["predictions"]),
      "all",
    );
  });

  test("filter rule by free text shows results if text in field info", async ({
    fieldVisibility,
  }) => {
    await fieldVisibility.openFieldVisibilityModal();
    await fieldVisibility.openTab("Filter rule");
    await fieldVisibility.addFilterRuleInput("bob");
    await fieldVisibility.asserter.assertSelection(
      filterResults([...METADATA_MATCH, "ground_truth"]),
      "all",
    );
  });

  test("sidebar group is hidden if all its fields are hidden using field visibility", async ({
    fieldVisibility,
    sidebar,
  }) => {
    await sidebar.asserter.assertSidebarGroupIsVisible("labels");
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await fieldVisibility.hideFields(["predictions", "ground_truth"]);
    await sidebar.asserter.assertFieldsNotInSidebar([
      "predictions",
      "ground_truth",
    ]);

    await sidebar.asserter.assertSidebarGroupIsHidden("labels");

    await fieldVisibility.clearFieldVisibilityChanges();
    await sidebar.asserter.assertSidebarGroupIsVisible("labels");
    await sidebar.asserter.assertFieldsInSidebar([
      "predictions",
      "ground_truth",
    ]);
  });

  test("sidebar add group input is hidden when field visibility is active", async ({
    sidebar,
    fieldVisibility,
  }) => {
    await sidebar.asserter.assertAddGroupVisible();
    await fieldVisibility.hideFields(["ground_truth"]);
    await sidebar.asserter.assertAddGroupHidden();
  });
});
