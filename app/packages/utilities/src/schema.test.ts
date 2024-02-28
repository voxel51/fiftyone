import { describe, expect, it } from "vitest";
import * as schema from "./schema";

const SCHEMA: schema.Schema = {
  top: {
    dbField: null,
    description: "description",
    embeddedDocType: "fiftyone.core.labels.TopLabel",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    info: {},
    name: "top",
    path: "top",
    subfield: null,
  },
  embedded: {
    dbField: null,
    description: "description",
    embeddedDocType:
      "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    info: {},
    name: "top",
    path: "embedded",
    subfield: null,
    fields: {
      field: {
        dbField: null,
        description: "description",
        embeddedDocType: "fiftyone.core.labels.EmbeddedLabel",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
        info: {},
        name: "field",
        path: "field",
        subfield: null,
      },
    },
  },
};

describe("schema", () => {
  describe("getCls ", () => {
    it("should get top level cls", () => {
      expect(schema.getCls("top", SCHEMA)).toBe("TopLabel");
    });

    it("should get embedded field cls", () => {
      expect(schema.getCls("embedded.field", SCHEMA)).toBe("EmbeddedLabel");
    });

    it("should return undefined for missing field paths", () => {
      expect(schema.getCls("missing", {})).toBe(undefined);
      expect(schema.getCls("missing", SCHEMA)).toBe(undefined);
      expect(schema.getCls("missing.path", {})).toBe(undefined);
      expect(schema.getCls("missing.path", SCHEMA)).toBe(undefined);
    });
  });

  describe("getFieldInfo ", () => {
    it("should get top level field info", () => {
      expect(schema.getFieldInfo("top", SCHEMA)).toBe(SCHEMA.top);
    });

    it("should get embedded field info", () => {
      expect(schema.getFieldInfo("embedded.field", SCHEMA)).toBe(
        SCHEMA.embedded.fields.field
      );
    });

    it("should return undefined for missing field paths", () => {
      expect(schema.getCls("missing", {})).toBe(undefined);
      expect(schema.getFieldInfo("missing", SCHEMA)).toBe(undefined);
      expect(schema.getCls("missing.path", {})).toBe(undefined);
      expect(schema.getFieldInfo("missing.path", SCHEMA)).toBe(undefined);
    });
  });
});
