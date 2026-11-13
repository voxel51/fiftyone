import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { DICT_FIELD, Field, STRING_FIELD } from "@fiftyone/utilities";
import {
  mockValues,
  TestSelector,
  TestSelectorFamily,
  setMockAtoms,
} from "../../../../__mocks__/recoil";
import * as sidebar from "./sidebar";

const mockFields = {
  sampleFields: [
    {
      dbField: "_id",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.ObjectIdField",
      info: null,
      name: "id",
      path: "id",
      subfield: null,
    },
    {
      dbField: "filepath",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.StringField",
      info: null,
      name: "filepath",
      path: "filepath",
      subfield: null,
    },
    {
      dbField: "tags",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.ListField",
      info: null,
      name: "tags",
      path: "tags",
      subfield: "fiftyone.core.fields.StringField",
    },
    {
      dbField: "metadata",
      description: null,
      embeddedDocType: "fiftyone.core.metadata.Metadata",
      fields: [
        {
          dbField: "size_types",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.IntField",
          info: null,
          name: "size_types",
          subfield: null,
          path: "metadata.size_types",
        },
        {
          dbField: "mime_type",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.StringField",
          info: null,
          name: "mime_type",
          subfield: null,
          path: "metadata.mime_type",
        },
        {
          dbField: "width",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.IntField",
          info: null,
          name: "width",
          subfield: null,
          path: "metadata.width",
        },
        {
          dbField: "height",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.IntField",
          info: null,
          name: "height",
          subfield: null,
          path: "metadata.height",
        },
        {
          dbField: "num_channels",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.IntField",
          info: null,
          name: "num_channels",
          subfield: null,
          path: "metadata.num_channels",
        },
      ],
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      info: null,
      name: "metadata",
      path: "metadata",
      subfield: null,
    },
    {
      dbField: "ground_truth",
      description: null,
      embeddedDocType: "fiftyone.core.labels.Detection",
      fields: [
        {
          dbField: "detections",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.ListField",
          info: null,
          name: "detections",
          subfield: "fiftyone.core.fields.EmbeddedDocumentField",
          path: "ground_truth.detections",
        },
      ],
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      info: null,
      name: "ground_truth",
      path: "ground_truth",
      subfield: null,
    },
    {
      dbField: "uniqueness",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.FloatField",
      info: null,
      name: "uniqueness",
      subfield: null,
      path: "uniqueness",
    },
    {
      dbField: "predictions",
      description: null,
      embeddedDocType: "fiftyone.core.labels.Detection",
      fields: [
        {
          dbField: "detections",
          description: null,
          embeddedDocType: null,
          fields: [],
          ftype: "fiftyone.core.fields.ListField",
          info: null,
          name: "detections",
          subfield: "fiftyone.core.fields.EmbeddedDocumentField",
          path: "ground_truth.detections",
        },
      ],
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      info: null,
      name: "predictions",
      subfield: null,
      path: "predictions",
    },
    {
      dbField: "dict_field",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.DictField",
      info: null,
      name: "dict_field",
      subfield: null,
      path: "dict_field",
    },
    {
      dbField: "list_field",
      description: null,
      embeddedDocType: null,
      fields: [],
      ftype: "fiftyone.core.fields.ListField",
      info: null,
      name: "list_field",
      subfield: null,
      path: "list_field",
    },
  ],
};

describe("test sidebar groups resolution", () => {
  it("preserves local expansion choices when dataset config refreshes", () => {
    const current = [
      { name: "events", paths: ["filepath"], expanded: true },
      { name: "signals", paths: ["uniqueness"], expanded: false },
      { name: "labels", paths: ["ground_truth", "predictions"] },
    ];
    const config = [
      { name: "events", paths: ["filepath"], expanded: false },
      { name: "signals", paths: ["uniqueness"], expanded: true },
      {
        name: "labels",
        paths: ["ground_truth", "predictions"],
        expanded: true,
      },
    ];
    const refreshed = sidebar.resolveGroups(
      mockFields.sampleFields,
      [],
      current,
      config,
    );

    expect(refreshed.find(({ name }) => name === "events")?.expanded).toBe(
      true,
    );
    expect(refreshed.find(({ name }) => name === "signals")?.expanded).toBe(
      false,
    );
    expect(refreshed.find(({ name }) => name === "labels")?.expanded).toBe(
      true,
    );
    expect(
      sidebar
        .resolveGroups(mockFields.sampleFields, [], [], config)
        .find(({ name }) => name === "events")?.expanded,
    ).toBe(false);
  });

  it("resolves with sample fields", () => {
    const test = sidebar.resolveGroups(mockFields.sampleFields, [], [], []);

    expect(test.length).toBe(5);
    expect(test[0].name).toBe("tags");
    expect(test[0].paths.length).toBe(0);
    expect(test[1].name).toBe("metadata");
    expect(test[1].paths.length).toBe(5);
    expect(test[2].name).toBe("labels");
    expect(test[2].paths.length).toBe(2);
    expect(test[3].name).toBe("primitives");
    expect(test[3].paths.length).toBe(3);
    expect(test[4].name).toBe("other");
    expect(test[4].paths.length).toBe(2);
  });

  it("resolves merges of current client setting", () => {
    const mockSidebarGroups = [
      { name: "tags", paths: [], expanded: true },
      {
        name: "metadata",
        paths: [
          "metadata.size_types",
          "metadata.mime_type",
          "metadata.width",
          "metadata.height",
          "metadata.num_channels",
        ],
        expanded: true,
      },
      {
        name: "labels",
        paths: ["ground_truth", "predictions"],
        expanded: true,
      },
      {
        name: "primitives",
        paths: ["id", "filepath", "uniqueness"],
        expanded: true,
      },
      { name: "other", paths: ["dict_field", "list_field"] },
      { name: "test group a", paths: [] },
      { name: "test group b", paths: [] },
    ];

    const test = sidebar.resolveGroups(
      mockFields.sampleFields,
      [],
      mockSidebarGroups,
      [],
    );

    expect(test.length).toBe(7);
    expect(test[4].name).toBe("other");
    expect(test[4].expanded).toBeFalsy();
    expect(test[5].name).toBe("test group a");
    expect(test[5].expanded).toBeFalsy();
    expect(test[6].name).toBe("test group b");
    expect(test[6].expanded).toBeFalsy();
  });

  it("resolves merges with dataset app config", () => {
    const mockSidebarGroups = [
      {
        name: "labels",
        paths: ["predictions", "ground_truth"],
        expanded: true,
      },
      {
        name: "primitives",
        paths: ["id", "filepath", "uniqueness"],
        expanded: true,
      },
      { name: "other", paths: ["dict_field", "list_field"] },
      { name: "test group a", paths: [] },
      { name: "test group b", paths: [] },
      {
        name: "metadata",
        paths: [],
        expanded: true,
      },
      { name: "tags", paths: [], expanded: true },
    ];

    const test = sidebar.resolveGroups(
      mockFields.sampleFields,
      [],
      [],
      mockSidebarGroups,
    );

    expect(test.length).toBe(7);

    const tags = test[0];
    expect(tags.name).toBe("tags");
    expect(tags.paths).toEqual([]);

    const labels = test[1];
    expect(labels.name).toBe("labels");
    expect(labels.paths).toEqual(["predictions", "ground_truth"]);

    const primitives = test[2];
    expect(primitives.name).toEqual("primitives");
    expect(primitives.paths).toEqual(["id", "filepath", "uniqueness"]);
    expect(primitives.expanded).toBe(true);

    const other = test[3];
    expect(other.name).toEqual("other");
    expect(other.paths).toEqual(["dict_field", "list_field"]);

    const testA = test[4];
    expect(testA.name).toBe("test group a");

    const testB = test[5];
    expect(testB.name).toBe("test group b");

    const metadata = test[6];
    expect(metadata.name).toBe("metadata");
    expect(metadata.expanded).toBe(true);
    expect(metadata.paths).toEqual([
      "metadata.size_types",
      "metadata.mime_type",
      "metadata.width",
      "metadata.height",
      "metadata.num_channels",
    ]);
  });

  it("resolves merges with improper dataset app config", () => {
    const mockSidebarGroups = [
      {
        name: "improper",
        paths: ["ground_truth"],
        expanded: true,
      },
    ];

    const test = sidebar.resolveGroups(
      mockFields.sampleFields,
      [],
      [],
      mockSidebarGroups,
    );

    const tags = test[0];
    expect(tags.name).toBe("tags");
    expect(tags.paths).toEqual([]);

    const metadata = test[1];
    expect(metadata.name).toBe("metadata");
    expect(metadata.expanded).toBe(true);
    expect(metadata.paths).toEqual([
      "metadata.size_types",
      "metadata.mime_type",
      "metadata.width",
      "metadata.height",
      "metadata.num_channels",
    ]);

    const improper = test[2];
    expect(improper.name).toBe("improper");
    expect(improper.paths).toEqual(["ground_truth"]);
    expect(improper.expanded).toBe(true);

    const labels = test[3];
    expect(labels.name).toBe("labels");
    expect(labels.paths).toEqual(["predictions"]);
    expect(labels.expanded).toBe(true);
  });
});

const TEST_FIELD_DATA: Field = {
  name: "unused",
  path: "unused",
  embeddedDocType: null,
  dbField: null,
  description: null,
  ftype: null,
  info: {},
  subfield: null,
};

describe("test pullSidebarValue", () => {
  it("handles dbField values", () => {
    expect(
      sidebar.pullSidebarValue(
        { ...TEST_FIELD_DATA, dbField: "_id" },
        ["id"],
        { _id: "idValue" },
        false,
      ),
    ).toBe("idValue");
  });

  it("handles embedded list values", () => {
    expect(
      sidebar.pullSidebarValue(
        TEST_FIELD_DATA,
        ["nested", "field"],
        { nested: [{ field: "nestedListValue" }] },
        true,
      ),
    ).toStrictEqual(["nestedListValue"]);
  });

  it("handles nested values", () => {
    expect(
      sidebar.pullSidebarValue(
        TEST_FIELD_DATA,
        ["nested", "field"],
        { nested: { field: "nestedValue" } },
        false,
      ),
    ).toBe("nestedValue");
  });

  it("handles undefined values", () => {
    expect(
      sidebar.pullSidebarValue(
        TEST_FIELD_DATA,
        ["undefined", "value"],
        {},
        false,
      ),
    ).toBe(undefined);
  });
});

describe("hiddenNoneGroups selector", () => {
  const assertSidebarGroupsRequest = (
    filtered: boolean,
    loading: boolean,
    modal: boolean,
  ) => {
    if (!filtered) {
      throw new Error("'filtered' should be 'true'");
    }

    if (loading) {
      throw new Error("'loading' should be 'false'");
    }

    if (!modal) {
      throw new Error("'modal' should be 'true'");
    }
  };

  const testHiddenNoneGroups = <TestSelector<typeof sidebar.hiddenNoneGroups>>(
    (<unknown>sidebar.hiddenNoneGroups)
  );

  const present = {
    paths: new Set<string>(),
    groups: new Set<string>(),
  };

  const hidden = {
    paths: new Set(["my_field", "my_list_field.subfield"]),
    groups: new Set(["field", "list_field"]),
  };

  const base = {
    hideNoneValuedFields: true,
    isOfDocumentFieldList: (p) => p === "my_list_field.subfield",
    sidebarGroups: ({ filtered, loading, modal }) => {
      assertSidebarGroupsRequest(filtered, loading, modal);

      return [
        {
          name: "tags",
          paths: [],
        },
        {
          name: "field",
          paths: ["my_field"],
        },
        {
          name: "list_field",
          paths: ["my_list_field.subfield"],
        },
      ];
    },
    field: () => TEST_FIELD_DATA,
  };

  it("tests disabled", () => {
    setMockAtoms({
      hideNoneValuedFields: false,
    });

    expect(testHiddenNoneGroups()).toStrictEqual(present);
  });

  it("tests single slice enabled", () => {
    setMockAtoms(base);
    // test null
    setMockAtoms({
      activeModalSidebarSample: {
        field: null,
        my_list_field: null,
      },
    });

    expect(testHiddenNoneGroups()).toStrictEqual(hidden);

    // test empty list
    setMockAtoms({
      activeModalSidebarSample: {
        my_field: null,
        my_list_field: [],
      },
    });

    expect(testHiddenNoneGroups()).toStrictEqual(hidden);

    // test null list value
    setMockAtoms({
      activeModalSidebarSample: {
        my_field: null,
        my_list_field: [{ subfield: null }],
      },
    });

    expect(testHiddenNoneGroups()).toStrictEqual(hidden);

    // test values
    setMockAtoms({
      activeModalSidebarSample: {
        my_field: "value",
        my_list_field: [{ subfield: "value" }],
      },
    });

    expect(testHiddenNoneGroups()).toStrictEqual(present);
  });

  it("tests multiple slices enabled", () => {
    setMockAtoms(base);

    // test null
    setMockAtoms({
      active3dSlices: ["one", "two"],
      active3dSlicesToSampleMap: {
        one: {
          sample: {},
        },
        two: {
          sample: {},
        },
      },
      is3dPinned: true,
      pinned3DSampleSlice: "one",
    });

    expect(testHiddenNoneGroups()).toStrictEqual(hidden);

    // test null and present
    setMockAtoms({
      active3dSlices: ["one", "two"],
      active3dSlicesToSampleMap: {
        one: {
          sample: {},
        },
        two: {
          sample: {
            my_field: "value",
            my_list_field: [{ subfield: "value" }],
          },
        },
      },
      is3dPinned: true,
      pinned3DSampleSlice: "one",
    });

    expect(testHiddenNoneGroups()).toStrictEqual(present);
  });

  it("falls back to the active modal sample when 3d is no longer pinned", () => {
    setMockAtoms(base);
    setMockAtoms({
      active3dSlices: ["one", "two"],
      active3dSlicesToSampleMap: {
        one: {
          sample: {},
        },
        two: {
          sample: {},
        },
      },
      activeModalSidebarSample: {
        my_field: "value",
        my_list_field: [{ subfield: "value" }],
      },
      is3dPinned: false,
      pinned3DSampleSlice: "one",
    });

    expect(testHiddenNoneGroups()).toStrictEqual(present);
  });
});

describe("collapsedPaths resolution", () => {
  it("does not add valid list fields (i.e. with a primitive subfield)", () => {
    setMockAtoms({
      field: (path) =>
        path === "dict_list"
          ? { subfield: DICT_FIELD }
          : { subfield: STRING_FIELD },
      fieldPaths: ({ ftype }) =>
        ftype === DICT_FIELD ? [] : ["dict_list", "string_list"],
      fields: () => [],
    });

    const collapsed = <TestSelector<typeof sidebar.collapsedPaths>>(
      (<unknown>sidebar.collapsedPaths)
    );

    expect(collapsed()).toStrictEqual(new Set(["dict_list"]));
  });
});

describe("flat Events sidebar", () => {
  const groups = sidebar.sidebarGroups({
    modal: false,
    loading: false,
  }) as unknown as TestSelectorFamily<typeof sidebar.sidebarGroups>;
  const setup = (filters = {}, search = "", multimodal = true) => {
    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "tags", paths: [] },
        { name: "events", paths: ["events.a", "events.b"], expanded: true },
        { name: "signals", paths: ["signals.speed"] },
      ],
      textFilter: () => search,
      isMultimodalDataset: multimodal,
      field: () => ({
        ftype: "fiftyone.core.fields.DynamicEmbeddedDocumentField",
      }),
      pathIsShown: () => true,
      filters,
      supportsTemporalTags: () => false,
      isVideoDataset: false,
      isLargeVideo: false,
    });
  };

  it("combines projection rows and leaves other grains alone", () => {
    setup();
    expect(groups().find((group) => group.name === "events")?.paths).toEqual([
      "_events",
    ]);
    expect(groups().find((group) => group.name === "signals")?.paths).toEqual([
      "signals.speed",
    ]);
  });

  it("keeps legacy filters visible so they can be cleared", () => {
    setup({ "events.a.id": { values: ["brake"] } });
    expect(groups().find((group) => group.name === "events")?.paths).toEqual([
      "_events",
      "events.a",
    ]);
  });

  it("respects sidebar field search", () => {
    setup({}, "speed");
    expect(groups().find((group) => group.name === "events")?.paths).toEqual(
      [],
    );
  });

  it("preserves ordinary datasets' event fields", () => {
    setup({}, "", false);
    expect(groups().find((group) => group.name === "events")?.paths).toEqual([
      "events.a",
      "events.b",
    ]);
  });

  it("exposes physical projection paths to Color settings", () => {
    setup();
    const physical = sidebar.sidebarGroups({
      modal: false,
      loading: false,
      flatEvents: false,
    }) as unknown as TestSelectorFamily<typeof sidebar.sidebarGroups>;
    expect(physical().find((group) => group.name === "events")?.paths).toEqual([
      "events.a",
      "events.b",
    ]);
  });

  it("keeps physical paths through expand/collapse without persisting the facet", () => {
    setup();
    const writable = sidebar.sidebarGroups({
      modal: false,
      loading: false,
      persist: false,
    }) as unknown as TestSelectorFamily<typeof sidebar.sidebarGroups>;
    writable.set(groups().map((group) => ({ ...group, expanded: false })));
    const saved = mockValues[sidebar.sidebarGroupsDefinition(false).key];
    expect(saved).toEqual([
      { name: "tags", paths: [], expanded: false },
      { name: "events", paths: ["events.a", "events.b"], expanded: false },
      { name: "signals", paths: ["signals.speed"], expanded: false },
    ]);
    setMockAtoms({ sidebarGroupsDefinition: () => saved });
    expect(groups().find((group) => group.name === "events")?.paths).toEqual([
      "_events",
    ]);
    setMockAtoms({ filters: { "events.b.id": { values: ["a"] } } });
    expect(groups().find((group) => group.name === "events")?.paths).toEqual([
      "_events",
      "events.b",
    ]);
    writable.set(groups());
    expect(
      mockValues[sidebar.sidebarGroupsDefinition(false).key].find(
        (group: { name: string }) => group.name === "events",
      ).paths,
    ).toEqual(["events.a", "events.b"]);
  });

  it("preserves hidden event placement in custom groups", () => {
    setup();
    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "tags", paths: [] },
        { name: "custom", paths: ["events.a", "signals.speed"] },
      ],
    });
    const writable = sidebar.sidebarGroups({
      modal: false,
      loading: false,
      persist: false,
    }) as unknown as TestSelectorFamily<typeof sidebar.sidebarGroups>;
    writable.set(groups());
    expect(
      mockValues[sidebar.sidebarGroupsDefinition(false).key].find(
        (group: { name: string }) => group.name === "custom",
      ).paths,
    ).toEqual(["events.a", "signals.speed"]);
  });
});

describe("sidebarPaths", () => {
  const paths = <TestSelector<typeof sidebar.sidebarPaths>>(
    (<unknown>sidebar.sidebarPaths)
  );

  it("returns the same array when only a group's expanded state changes", () => {
    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "tags", paths: [], expanded: true },
        { name: "labels", paths: ["ground_truth"], expanded: true },
      ],
    });
    const first = paths();

    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "tags", paths: [], expanded: false },
        { name: "labels", paths: ["ground_truth"], expanded: true },
      ],
    });
    expect(paths()).toBe(first);
  });

  it("returns a new array when the paths change", () => {
    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "labels", paths: ["ground_truth"], expanded: true },
      ],
    });
    const first = paths();

    setMockAtoms({
      sidebarGroupsDefinition: () => [
        { name: "labels", paths: ["ground_truth", "predictions"] },
      ],
    });
    expect(paths()).toStrictEqual(["ground_truth", "predictions"]);
    expect(paths()).not.toBe(first);
  });
});

describe("withMissingSidebarPaths", () => {
  const modal = [
    { name: "metadata", paths: ["metadata.width"], expanded: true },
    { name: "labels", paths: ["gt"], expanded: false },
  ];

  it("adds the paths the modal lacks, keeping its own groups", () => {
    const grid = [
      { name: "labels", paths: ["cls", "gt"], expanded: true },
      { name: "primitives", paths: ["id"], expanded: true },
      { name: "metadata", paths: ["metadata.width"], expanded: false },
    ];

    expect(sidebar.withMissingSidebarPaths(modal, grid)).toStrictEqual([
      { name: "metadata", paths: ["metadata.width"], expanded: true },
      { name: "labels", paths: ["gt", "cls"], expanded: false },
      { name: "primitives", paths: ["id"], expanded: true },
    ]);
    expect(modal[1].paths).toStrictEqual(["gt"]);
  });

  it("returns the modal groups themselves when nothing is missing", () => {
    const grid = [{ name: "labels", paths: ["gt"], expanded: true }];

    expect(sidebar.withMissingSidebarPaths(modal, grid)).toBe(modal);
  });
});
