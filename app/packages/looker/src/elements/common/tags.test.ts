import { afterEach, describe, expect, it, vi } from "vitest";
import { getFieldAndValue } from "./tags";

const TEST_SAMPLE = {
  metadata: {
    width: 0,
    height: 0,
  },
  _id: "1",
  filepath: "/path",
  tags: ["foo"],
  _label_tags: ["bar"],
  _media_type: "image" as const,
};

const TEST_SCHEMA = {
  filepath: {
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
  test: {
    dbField: "test",
    description: null,
    embeddedDocType: null,
    fields: {
      int_field: {
        dbField: "int_field",
        description: null,
        embeddedDocType: null,
        fields: [],
        ftype: "fiftyone.core.fields.IntField",
        info: null,
        name: "int_field",
        subfield: null,
        path: "test.int_field",
      },
      str_field: {
        dbField: "str_field",
        description: null,
        embeddedDocType: null,
        fields: [],
        ftype: "fiftyone.core.fields.StringField",
        info: null,
        name: "str_field",
        subfield: null,
        path: "test.str_field",
      },
      predictions_field: {
        dbField: "predictions_field",
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
        name: "predictions_field",
        subfield: null,
        path: "test.predictions_field",
      },
    },
    ftype: "fiftyone.core.fields.ListField",
    info: null,
    name: "test",
    subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    path: "test",
  },
  predictions: {
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
};

describe(`
  getFieldAndValue works
`, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filepath field returns correct field and value", () => {
    const res = getFieldAndValue(TEST_SAMPLE, TEST_SCHEMA, "filepath");
    expect(res[0].name).toEqual("filepath");
    expect(res[1]).toContain("/path");
  });

  it("nested primitive in a list of embedded document return correct field:values", () => {
    // top level test (LIST<EmbeddedDocument{int_field, str_field}>)
    let [resultField, _] = getFieldAndValue(TEST_SAMPLE, TEST_SCHEMA, "test");
    expect(resultField).toBeNull();

    [resultField, _] = getFieldAndValue(
      TEST_SAMPLE,
      TEST_SCHEMA,
      "test.int_field"
    );
    expect(resultField.name).toEqual("int_field");

    [resultField, _] = getFieldAndValue(
      TEST_SAMPLE,
      TEST_SCHEMA,
      "predictions"
    );
    expect(resultField.name).toBe("predictions");

    [resultField, _] = getFieldAndValue(
      TEST_SAMPLE,
      TEST_SCHEMA,
      "test.predictions"
    );
    expect(resultField).toBeNull();
  });
});
