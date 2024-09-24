import type { Schema } from "@fiftyone/utilities";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { getBubbles, getField, unwind } from "./bubbles";
import { applyTagValue } from "./tags";

const FIELD_DATA = {
  dbField: "",
  description: null,
  embeddedDocType: null,
  info: {},
  ftype: "ftype",
  name: "key",
  path: "",
  subfield: "",
};

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

const TEST_SCHEMA: Schema = {
  filepath: {
    dbField: "filepath",
    description: null,
    embeddedDocType: null,
    fields: {},
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
        fields: {},
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
        fields: {},
        ftype: "fiftyone.core.fields.StringField",
        info: null,
        name: "str_field",
        subfield: null,
        path: "test.str_field",
      },
      str_list_field: {
        dbField: "str_list_field",
        description: null,
        embeddedDocType: null,
        fields: {},
        ftype: "fiftyone.core.fields.ListField",
        info: null,
        name: "str_list_field",
        path: "test.str_list_field",
        subfield: "fiftyone.core.fields.StringField",
      },
      predictions_field: {
        dbField: "predictions_field",
        description: null,
        embeddedDocType: "fiftyone.core.labels.Detection",
        fields: {
          detections: {
            dbField: "detections",
            description: null,
            embeddedDocType: null,
            fields: {},
            ftype: "fiftyone.core.fields.ListField",
            info: null,
            name: "detections",
            subfield: "fiftyone.core.fields.EmbeddedDocumentField",
            path: "predictions_field.detections",
          },
        },
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
    fields: {
      detections: {
        dbField: "detections",
        description: null,
        embeddedDocType: null,
        fields: {},
        ftype: "fiftyone.core.fields.ListField",
        info: null,
        name: "detections",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
        path: "predictions.detections",
      },
    },
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    info: null,
    name: "predictions",
    subfield: null,
    path: "predictions",
  },
};

describe("text bubble tests", () => {
  it("unwind unwinds values", () => {
    expect(
      unwind("key", [{ key: ["one"] }, { key: ["two"] }]).flat()
    ).toStrictEqual(["one", "two"]);

    expect(unwind("_id", { id: "value" }).flat()).toStrictEqual(["value"]);
  });

  it("getBubble gets values for path", () => {
    const listField = {
      ...FIELD_DATA,
      dbField: "my",
      ftype: LIST_FIELD,
      embeddedDocType: DYNAMIC_EMBEDDED_DOCUMENT_PATH,
      subfield: EMBEDDED_DOCUMENT_FIELD,
      fields: {
        list: {
          ...FIELD_DATA,
        },
      },
    };
    expect(
      getBubbles(
        "my",
        { my: [{ list: "value" }] },
        {
          my: {
            ...listField,
          },
        }
      )
    ).toStrictEqual([listField, [{ list: "value" }]]);

    const field = {
      ...FIELD_DATA,
      dbField: "my",
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: DYNAMIC_EMBEDDED_DOCUMENT_PATH,
      fields: {
        value: {
          ...FIELD_DATA,
          dbField: "value",
          ftype: STRING_FIELD,
        },
      },
    };
    expect(
      getBubbles(
        "my.value",
        { my: { value: "value" } },
        {
          my: {
            ...field,
          },
        }
      )
    ).toStrictEqual([field.fields.value, ["value"]]);
  });

  it("getField gets field from a path keys", () => {
    expect(
      getField(["my", "embedded", "value"], {
        my: {
          ...FIELD_DATA,
          fields: {
            embedded: {
              ...FIELD_DATA,
              fields: {
                value: {
                  ...FIELD_DATA,
                  ftype: "value",
                },
              },
            },
          },
        },
      })
    ).toStrictEqual({ ...FIELD_DATA, ftype: "value" });
  });

  it("filepath field returns correct field and value", () => {
    const res = getBubbles("filepath", TEST_SAMPLE, TEST_SCHEMA);
    expect(res[0].name).toEqual("filepath");
    expect(res[1]).toContain("/path");
  });

  it("nested primitive in a list of embedded document return correct field:values", () => {
    let [resultField, _] = getBubbles(
      "test.int_field",
      TEST_SAMPLE,
      TEST_SCHEMA
    );
    expect(resultField.name).toEqual("int_field");

    [resultField, _] = getBubbles("predictions", TEST_SAMPLE, TEST_SCHEMA);
    expect(resultField.name).toBe("predictions");

    [resultField, _] = getBubbles("test.predictions", TEST_SAMPLE, TEST_SCHEMA);
    expect(resultField).toBeNull();
  });

  it("nested primitive list in a list of embedded document return correct field:values", () => {
    const [resultField, _] = getBubbles(
      "test.str_list_field",
      TEST_SAMPLE,
      TEST_SCHEMA
    );
    expect(resultField.name).toEqual("str_list_field");
  });
});

describe("applyTagValue", () => {
  it("prevents XSS", () => {
    const xss = "<img src=# onerror=alert('XSS')>";
    const div = applyTagValue("white", "path", "title", xss, "3px");
    expect(div.textContent).toEqual(xss);
  });
});
