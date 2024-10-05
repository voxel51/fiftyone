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
    name: "embedded",
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
        path: "embedded.field",
        subfield: null,
      },
    },
  },
  embeddedWithDbFields: {
    dbField: "embeddedWithDbFields",
    description: "description",
    embeddedDocType:
      "fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    info: {},
    name: "embeddedWithDbFields",
    path: "embeddedWithDbFields",
    subfield: null,
    fields: {
      sample_id: {
        dbField: "_sample_id",
        pathWithDbField: "",
        description: "description",
        embeddedDocType: "fiftyone.core.labels.EmbeddedLabel",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
        info: {},
        name: "sample_id",
        path: "embeddedWithDbFields.sample_id",
        subfield: null,
      },
    },
  },
};

describe("schema", () => {
  describe("getCls", () => {
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

  describe("getFieldInfo", () => {
    it("should get top level field info", () => {
      expect(schema.getFieldInfo("top", SCHEMA)).toEqual({
        ...SCHEMA.top,
        pathWithDbField: "",
      });
    });

    it("should get embedded field info", () => {
      expect(schema.getFieldInfo("embedded.field", SCHEMA)).toEqual({
        ...SCHEMA.embedded.fields!.field,
        pathWithDbField: "",
      });
    });

    it("should return undefined for missing field paths", () => {
      expect(schema.getCls("missing", {})).toBe(undefined);
      expect(schema.getFieldInfo("missing", SCHEMA)).toBe(undefined);
      expect(schema.getCls("missing.path", {})).toBe(undefined);
      expect(schema.getFieldInfo("missing.path", SCHEMA)).toBe(undefined);
    });

    it("should return correct pathWithDbField", () => {
      const field = schema.getFieldInfo(
        "embeddedWithDbFields.sample_id",
        SCHEMA
      );
      expect(field?.pathWithDbField).toBe("embeddedWithDbFields._sample_id");
    });
  });

  describe("getFieldsWithEmbeddedDocType", () => {
    it("should get all fields with embeddedDocType at top level", () => {
      expect(
        schema.getFieldsWithEmbeddedDocType(
          SCHEMA,
          "fiftyone.core.labels.TopLabel"
        )
      ).toEqual([SCHEMA.top]);
    });

    it("should get all fields with embeddedDocType in nested fields", () => {
      expect(
        schema.getFieldsWithEmbeddedDocType(
          SCHEMA,
          "fiftyone.core.labels.EmbeddedLabel"
        )
      ).toEqual([
        SCHEMA.embedded.fields!.field,
        SCHEMA.embeddedWithDbFields.fields!.sample_id,
      ]);
    });

    it("should return empty array if embeddedDocType does not exist", () => {
      expect(
        schema.getFieldsWithEmbeddedDocType(SCHEMA, "nonexistentDocType")
      ).toEqual([]);
    });

    it("should return empty array for empty schema", () => {
      expect(schema.getFieldsWithEmbeddedDocType({}, "anyDocType")).toEqual([]);
    });
  });

  describe("doesSchemaContainEmbeddedDocType", () => {
    it("should return true if embeddedDocType exists at top level", () => {
      expect(
        schema.doesSchemaContainEmbeddedDocType(
          SCHEMA,
          "fiftyone.core.labels.TopLabel"
        )
      ).toBe(true);
    });

    it("should return true if embeddedDocType exists in nested fields", () => {
      expect(
        schema.doesSchemaContainEmbeddedDocType(
          SCHEMA,
          "fiftyone.core.labels.EmbeddedLabel"
        )
      ).toBe(true);
    });

    it("should return false if embeddedDocType does not exist", () => {
      expect(
        schema.doesSchemaContainEmbeddedDocType(SCHEMA, "nonexistentDocType")
      ).toBe(false);
    });

    it("should return false for empty schema", () => {
      expect(schema.doesSchemaContainEmbeddedDocType({}, "anyDocType")).toBe(
        false
      );
    });
  });
});
