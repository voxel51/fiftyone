import { describe, expect, it, vi } from "vitest";
import * as sidebar from "../../src/recoil/sidebar";
import { State } from "../../src/recoil/types";

const mockDataset: State.Dataset = {
  id: "mockQuickStart",
  appConfig: {
    gridMediaField: "filepath",
    mediaFields: ["filepath"],
    modalMediaField: "filepath",
    plugins: {},
  },
  brainMethods: [],
  createdAt: { $date: new Date().getTime() },
  defaultMaskTargets: {},
  evaluations: [],
  frameFields: [],
  lastLoadedAt: { $date: new Date().getTime() },
  maskTargets: {},
  mediaType: "image",
  name: "quickstart-test",
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
  version: "test",
  skeletons: [],
  groupMediaTypes: [],
  groupField: "",
  info: {},
};

describe("ResolveGroups works", () => {
  it("dataset groups should resolve when curent is undefined", () => {
    const test = sidebar.resolveGroups(mockDataset, undefined);

    expect(test.length).toBe(6);
    // expect(test[0].name).toBe("tags");
    // expect(test[0].paths.length).toBe(0);
    // expect(test[1].name).toBe("label tags");
    // expect(test[1].paths.length).toBe(0);
    expect(test[2].name).toBe("metadata");
    expect(test[2].paths.length).toBe(5);
    expect(test[3].name).toBe("labels");
    expect(test[3].paths.length).toBe(2);
    expect(test[4].name).toBe("primitives");
    expect(test[4].paths.length).toBe(3);
    expect(test[5].name).toBe("other");
    expect(test[5].paths.length).toBe(2);
  });

  it("when dataset appconfig does not have sidebarGroups settings, use default settings", () => {
    const mockSidebarGroups = [
      // { name: "tags", paths: [], expanded: true },
      // { name: "label tags", paths: [], expanded: true },
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
    const dataSetWithNewGroups = { ...mockDataset };
    dataSetWithNewGroups.appConfig.sidebarGroups = mockSidebarGroups;

    const test = sidebar.resolveGroups(mockDataset, mockSidebarGroups);

    expect(test.length).toBe(8);
    expect(test[5].name).toBe("other");
    expect(test[5].expanded).toBeFalsy();
    expect(test[6].name).toBe("test group a");
    expect(test[6].expanded).toBeFalsy();
    expect(test[7].name).toBe("test group b");
    expect(test[7].expanded).toBeFalsy();
  });
});
