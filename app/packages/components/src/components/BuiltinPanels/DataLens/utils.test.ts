import { describe, expect, it } from "vitest";
import { findFields } from "./utils";

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
