import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("query-performance");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

// one sample per row: non-finite values, a real maximum, a real minimum, and
// nones; `inf`, `nan` and `ninf` hold the named value only in the first
const NON_FINITE = {
  inf: { $numberDouble: "Infinity" },
  nan: { $numberDouble: "NaN" },
  ninf: { $numberDouble: "-Infinity" },
};
const ROWS = [
  { bool: false, str: "0", ...NON_FINITE },
  { bool: false, str: "1", inf: 1.0, nan: 1.0, ninf: 1.0 },
  { bool: true, str: "2", inf: -1.0, nan: -1.0, ninf: -1.0 },
  { bool: null, str: null, inf: null, nan: null, ninf: null },
];

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: ROWS.length,
    schema: {
      bool: "BooleanField",
      bool_list: "ListField<BooleanField>",
      str: "StringField",
      str_list: "ListField<StringField>",
      ...Object.fromEntries(
        Object.keys(NON_FINITE).flatMap((key) => [
          [key, "FloatField"],
          [`${key}_list`, "ListField<FloatField>"],
          [`${key}_label_list`, "Classifications"],
        ]),
      ),
    },
    withSampleData: ({ index }, { label }) => {
      const row = ROWS[index];
      const list = <T>(value: T) => (value === null ? null : [value]);
      return {
        bool: row.bool,
        bool_list: list(row.bool),
        str: row.str,
        str_list: list(row.str),
        ...Object.fromEntries(
          Object.keys(NON_FINITE).flatMap((key) => {
            const value = row[key as keyof typeof NON_FINITE];
            return [
              [key, value],
              [`${key}_list`, list(value)],
              [
                `${key}_label_list`,
                label.classifications([
                  label.classification({ label: "label", confidence: value }),
                ]),
              ],
            ];
          }),
        ),
      };
    },
    indexes: ["$**"],
  });
});

test.describe.serial("query performance sidebar", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("assert query performance icons", async ({
    eventUtils,
    grid,
    sidebar,
  }) => {
    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.setQueryPerformance("enabled");
    for (const field of [
      "tags",
      "metadata.mime_type",
      "inf_label_list",
      "nan_label_list",
      "ninf_label_list",
      "id",
      "filepath",
      "created_at",
      "last_modified_at",
      "bool",
      "bool_list",
      "str",
      "str_list",
    ]) {
      await sidebar.asserter.assertFieldHasQueryPerformance(field);
    }

    for (const field of [
      "_label_tags",
      "metadata.size_bytes",
      "metadata.width",
      "metadata.height",
      "metadata.num_channels",
      "inf",
      "inf_list",
      "nan",
      "nan_list",
      "ninf",
      "ninf_list",
    ]) {
      await sidebar.asserter.assertFieldMissingQueryPerformance(field);
    }

    for (const field of [
      "inf_label_list",
      "nan_label_list",
      "ninf_label_list",
    ]) {
      await eventUtils.after("animation-onRest", () =>
        sidebar.clickFieldDropdown(field),
      );
    }

    const subfieldsIndexed = ["id", "label", "tags"];
    for (const field of [
      "inf_label_list",
      "nan_label_list",
      "ninf_label_list",
    ]) {
      for (const subfield of subfieldsIndexed) {
        await sidebar.asserter.assertSubfieldHasQueryPerformance(
          `${field}.classifications.${subfield}`,
          "categorical",
        );
      }
    }

    const subfieldsUnindexed = ["confidence"];
    for (const field of [
      "inf_label_list",
      "nan_label_list",
      "ninf_label_list",
    ]) {
      for (const subfield of subfieldsUnindexed) {
        await sidebar.asserter.assertSubfieldMissingQueryPerformance(
          `${field}.classifications.${subfield}`,
          "categorical",
        );
      }
    }
  });
});
