import { describe, expect, it } from "vitest";

import {
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import { getBubbles, getField, unwind } from "./bubbles";

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
});
