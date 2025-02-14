import { beforeEach, describe, expect, it } from "vitest";
import { findFields, formatSchema, toCamelCase } from "./utils";

describe("findFields", () => {
  const sampleData = {
    filepath: "https://path/to/file.png",
    other_field: "hello",
    nested_dict: {
      filepath: "https://path/to/file2.png",
      obj_without_media: {
        not_here: true,
        x: 5,
      },
      object_with_media: {
        k: "v",
        filepath: "https://localhost/path/to/file33.png",
      },
      null_field: null,
    },
  };

  describe("with null or empty data", () => {
    it("should return empty object", () => {
      expect(findFields(["filepath"], null)).toStrictEqual({});
      expect(findFields(["filepath"], {})).toStrictEqual({});
    });
  });

  describe("with non-matching or empty media fields", () => {
    it("should return empty object", () => {
      expect(findFields([], sampleData)).toStrictEqual({});
      expect(findFields(["zzz"], sampleData)).toStrictEqual({});
    });
  });

  describe("with valid input", () => {
    it("should retrieve all nested media", () => {
      expect(findFields(["filepath"], sampleData)).toStrictEqual({
        filepath: sampleData.filepath,
        "nested_dict.filepath": sampleData.nested_dict.filepath,
        "nested_dict.object_with_media.filepath":
          sampleData.nested_dict.object_with_media.filepath,
      });
    });
  });
});

describe("toCamelCase", () => {
  describe("with null or empty data", () => {
    it("should return undefined", () => {
      expect(toCamelCase(null)).toBeUndefined();
      expect(toCamelCase(undefined)).toBeUndefined();
      expect(toCamelCase("")).toBeUndefined();
    });
  });

  describe("with an camelCase string", () => {
    it("should return the same string", () => {
      expect(toCamelCase("camelCase")).toStrictEqual("camelCase");
    });
  });

  describe("with a snake_case string", () => {
    it("should return the string as camelCase", () => {
      expect(toCamelCase("snake_case")).toStrictEqual("snakeCase");
    });
  });

  describe("with a string containing spaces", () => {
    it("should remove spaces and concatenate words", () => {
      expect(toCamelCase("camelCase camelCase")).toStrictEqual(
        "camelCaseCamelCase"
      );
      expect(toCamelCase("snake_case snake_case")).toStrictEqual(
        "snakeCaseSnakeCase"
      );
    });
  });
});

describe("formatSchema", () => {
  describe("with a valid input schema", () => {
    const sdkSchema: { [k: string]: any } = {
      detections: {
        name: "detections",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
        embedded_doc_type: "fiftyone.core.labels.Detections",
        subfield: null,
        fields: [
          {
            name: "detections",
            ftype: "fiftyone.core.fields.ListField",
            embedded_doc_type: "fiftyone.core.labels.Detection",
            subfield: "fiftyone.core.fields.EmbeddedDocumentField",
            fields: [
              {
                name: "id",
                ftype: "fiftyone.core.fields.ObjectIdField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "_id",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "tags",
                ftype: "fiftyone.core.fields.ListField",
                embedded_doc_type: null,
                subfield: "fiftyone.core.fields.StringField",
                fields: [],
                db_field: "tags",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "attributes",
                ftype: "fiftyone.core.fields.DictField",
                embedded_doc_type: "fiftyone.core.labels.Attribute",
                subfield: "fiftyone.core.fields.EmbeddedDocumentField",
                fields: [],
                db_field: "attributes",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "label",
                ftype: "fiftyone.core.fields.StringField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "label",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "bounding_box",
                ftype: "fiftyone.core.fields.ListField",
                embedded_doc_type: null,
                subfield: "fiftyone.core.fields.FloatField",
                fields: [],
                db_field: "bounding_box",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "mask",
                ftype: "fiftyone.core.fields.ArrayField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "mask",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "mask_path",
                ftype: "fiftyone.core.fields.StringField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "mask_path",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "confidence",
                ftype: "fiftyone.core.fields.FloatField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "confidence",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
              {
                name: "index",
                ftype: "fiftyone.core.fields.IntField",
                embedded_doc_type: null,
                subfield: null,
                fields: [],
                db_field: "index",
                description: null,
                info: null,
                read_only: false,
                created_at: null,
              },
            ],
            db_field: "detections",
            description: null,
            info: null,
            read_only: false,
            created_at: {
              $date: "2025-02-05T22:09:03.990Z",
            },
          },
        ],
        db_field: "detections",
        description: null,
        info: null,
        read_only: false,
        created_at: {
          $date: "2025-02-05T22:09:03.990Z",
        },
      },
    };
    const inputSchema = sdkSchema["detections"];

    let formattedSchema: { [k: string]: any };
    beforeEach(() => {
      formattedSchema = formatSchema(inputSchema);
    });

    it("should set the 'path' property", () => {
      expect(formattedSchema["path"]).toStrictEqual(
        sdkSchema["detections"]["name"]
      );
    });

    it("should convert keys from snake_case to camelCase", () => {
      const snakeKeys = Object.keys(inputSchema).filter((k) => k.includes("_"));
      snakeKeys.forEach((key) => {
        expect(formattedSchema[key]).toBeUndefined();
        expect(formattedSchema[toCamelCase(key)]).toBeDefined();
      });
    });

    it("should convert 'fields' from a list to a nested object", () => {
      expect(typeof formattedSchema["fields"]).toStrictEqual("object");
    });

    it("should convert the schema recursively", () => {
      const assertConversion = (
        input: { [k: string]: any },
        output: { [k: string]: any }
      ) => {
        // case conversion
        const snakeKeys = Object.keys(input).filter((k) => k.includes("_"));
        snakeKeys.forEach((key) => {
          expect(output[key]).toBeUndefined();
          expect(output[toCamelCase(key)]).toBeDefined();
        });

        // path property
        expect(output["path"]).toStrictEqual(input["name"]);

        // fields array conversion
        expect(typeof output["fields"]).toStrictEqual("object");
      };

      // one level deep - "detections" field
      assertConversion(
        inputSchema["fields"][0],
        formattedSchema["fields"]["detections"]
      );

      // two levels deep - "detections.label" field
      assertConversion(
        inputSchema["fields"][0]["fields"].filter(
          (o: { name: string }) => o["name"] === "label"
        )[0],
        formattedSchema["fields"]["detections"]["fields"]["label"]
      );
    });
  });
});
