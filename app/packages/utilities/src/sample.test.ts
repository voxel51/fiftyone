import { describe, expect, it, vi } from "vitest";
import { LabelData, LabelType, Sample } from "./sample";
import { Field, Schema } from "./schema";

const field = (
  embeddedDocType: string | null,
  fields?: Schema,
  extras: Partial<Field> = {}
): Field => ({
  dbField: null,
  description: null,
  embeddedDocType,
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  info: null,
  name: "",
  path: "",
  subfield: null,
  ...(fields ? { fields } : {}),
  ...extras,
});

const detectionsSchema: Schema = {
  ground_truth: field("fiftyone.core.labels.Detections", {
    detections: field(null, undefined, {
      ftype: "fiftyone.core.fields.ListField",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    }),
  }),
  classification: field("fiftyone.core.labels.Classification"),
  classifications: field("fiftyone.core.labels.Classifications"),
  detection: field("fiftyone.core.labels.Detection"),
  uuid: field(null, undefined, { ftype: "fiftyone.core.fields.StringField" }),
};

const makeDet = (
  id: string,
  label: string,
  tags: string[] = []
): LabelData => ({
  _id: id,
  _cls: "Detection",
  label,
  tags,
});

describe("Sample", () => {
  describe("setField / getResolved", () => {
    it("returns source when no transient is set", () => {
      const s = new Sample({ data: { uuid: "abc" } });
      expect(s.getResolved("uuid")).toBe("abc");
    });

    it("prefers transient over source for the same path", () => {
      const s = new Sample({ data: { uuid: "abc" } });
      s.setField("uuid", "xyz");
      expect(s.getResolved("uuid")).toBe("xyz");
    });

    it("resolves nested source paths", () => {
      const s = new Sample({
        data: { ground_truth: { detections: [makeDet("d1", "cat")] } },
      });
      expect(s.getResolved("ground_truth.detections")).toEqual([
        makeDet("d1", "cat"),
      ]);
    });

    it("resolves nested transient via the flat parent key", () => {
      const s = new Sample();
      s.setField("ground_truth", { detections: [makeDet("d1", "cat")] });
      expect(s.getResolved("ground_truth.detections")).toEqual([
        makeDet("d1", "cat"),
      ]);
    });

    it("returns undefined for unset paths", () => {
      const s = new Sample();
      expect(s.getResolved("nope.nope")).toBeUndefined();
    });

    it("clearing removes transient edits", () => {
      const s = new Sample({ data: { uuid: "abc" } });
      s.setField("uuid", "xyz");
      s.clear();
      expect(s.getResolved("uuid")).toBe("abc");
    });
  });

  describe("schema accessors", () => {
    it("returns field info for a known path", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(s.getFieldInfo("ground_truth")?.embeddedDocType).toBe(
        "fiftyone.core.labels.Detections"
      );
    });

    it("maps embeddedDocType to LabelType", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(s.getLabelType("ground_truth")).toBe(LabelType.Detections);
      expect(s.getLabelType("detection")).toBe(LabelType.Detection);
      expect(s.getLabelType("classification")).toBe(LabelType.Classification);
      expect(s.getLabelType("uuid")).toBe(LabelType.Unknown);
      expect(s.getLabelType("missing")).toBe(LabelType.Unknown);
    });

    it("identifies list-label fields", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(s.isListLabel("ground_truth")).toBe(true);
      expect(s.isListLabel("classifications")).toBe(true);
      expect(s.isListLabel("detection")).toBe(false);
      expect(s.isListLabel("uuid")).toBe(false);
    });
  });

  describe("updateLabel — single labels", () => {
    it("merges with the existing single label preserving server fields", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          classification: {
            _cls: "Classification",
            _id: "c1",
            tags: ["reviewed"],
            label: "positive",
            confidence: 0.9,
          },
        },
      });

      s.updateLabel("classification", { _id: "c1", label: "negative" });

      expect(s.getResolved("classification")).toEqual({
        _cls: "Classification",
        _id: "c1",
        tags: ["reviewed"],
        label: "negative",
        confidence: 0.9,
      });
    });

    it("creates the label from scratch when no source value exists", () => {
      const s = new Sample({ schema: detectionsSchema });
      s.updateLabel("detection", {
        _id: "d1",
        _cls: "Detection",
        label: "cat",
      });
      expect(s.getResolved("detection")).toEqual({
        _id: "d1",
        _cls: "Detection",
        label: "cat",
      });
    });
  });

  describe("updateLabel — list labels", () => {
    it("upserts an existing element by _id", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat", ["foo"]), makeDet("d2", "dog")],
          },
        },
      });

      s.updateLabel("ground_truth", { _id: "d1", label: "lion" });

      expect(s.listLabels("ground_truth")).toEqual([
        { _id: "d1", _cls: "Detection", label: "lion", tags: ["foo"] },
        makeDet("d2", "dog"),
      ]);
    });

    it("appends a new element when _id is not present", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat")],
          },
        },
      });

      const newDet = makeDet("d2", "dog");
      s.updateLabel("ground_truth", newDet);

      expect(s.listLabels("ground_truth")).toEqual([
        makeDet("d1", "cat"),
        newDet,
      ]);
    });

    it("seeds an empty list when the field is missing", () => {
      const s = new Sample({ schema: detectionsSchema });
      s.updateLabel("ground_truth", makeDet("d1", "cat"));
      expect(s.listLabels("ground_truth")).toEqual([makeDet("d1", "cat")]);
    });

    it("throws when _id is missing on a list-label update", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(() =>
        s.updateLabel("ground_truth", { label: "cat" } as LabelData)
      ).toThrow(/requires an _id/);
    });
  });

  describe("getLabel / listLabels", () => {
    it("looks up a list label by id", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
          },
        },
      });
      expect(s.getLabel("ground_truth", "d2")).toEqual(makeDet("d2", "dog"));
    });

    it("returns transient updates from listLabels", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat")],
          },
        },
      });
      s.updateLabel("ground_truth", { _id: "d1", label: "lion" });
      expect(s.listLabels("ground_truth")[0].label).toBe("lion");
    });

    it("throws when id is required but not provided", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(() => s.getLabel("ground_truth")).toThrow(/id is required/);
    });

    it("throws when calling listLabels on a non-list field", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(() => s.listLabels("detection")).toThrow(/not a list label/);
    });
  });

  describe("deleteField", () => {
    it("marks a non-label field for removal", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.deleteField("uuid");
      expect(s.getResolved("uuid")).toBeUndefined();
      expect(s.getJsonPatch()).toEqual([{ op: "remove", path: "/uuid" }]);
    });

    it("is undone by a subsequent setField", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.deleteField("uuid");
      s.setField("uuid", "xyz");
      expect(s.getResolved("uuid")).toBe("xyz");
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/uuid", value: "xyz" },
      ]);
    });

    it("emits no delta when the source already lacks the field", () => {
      const s = new Sample({ schema: detectionsSchema });
      s.deleteField("uuid");
      expect(s.getJsonPatch()).toEqual([]);
    });
  });

  describe("deleteLabel", () => {
    it("removes a single label", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.deleteLabel("detection");
      expect(s.getResolved("detection")).toBeUndefined();
    });

    it("filters a list label by id", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
          },
        },
      });
      s.deleteLabel("ground_truth", "d1");
      expect(s.listLabels("ground_truth")).toEqual([makeDet("d2", "dog")]);
    });

    it("setField after deleteLabel clears the deletion", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.deleteLabel("detection");
      s.setField("detection", makeDet("d1", "cat-revived"));
      expect(s.getResolved("detection")).toEqual(makeDet("d1", "cat-revived"));
    });
  });

  describe("getJsonPatch", () => {
    it("returns an empty patch when nothing has changed", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("emits a replace for a single-label edit, prefixed by the field path", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          classification: {
            _cls: "Classification",
            _id: "c1",
            tags: ["reviewed"],
            label: "positive",
          },
        },
      });
      s.updateLabel("classification", { _id: "c1", label: "negative" });
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/classification/label", value: "negative" },
      ]);
    });

    it("emits patch ops scoped under the parent list path for upserts", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat")],
          },
        },
      });
      s.updateLabel("ground_truth", { _id: "d1", label: "lion" });
      expect(s.getJsonPatch()).toEqual([
        {
          op: "replace",
          path: "/ground_truth/detections/0/label",
          value: "lion",
        },
      ]);
    });

    it("emits a remove for a deleted single label", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.deleteLabel("detection");
      expect(s.getJsonPatch()).toEqual([{ op: "remove", path: "/detection" }]);
    });

    it("skips deletions when the source already lacks the field", () => {
      const s = new Sample({ schema: detectionsSchema });
      s.deleteLabel("detection");
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("falls back to the unknown supplier for primitive replaces", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.setField("uuid", "xyz");
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/uuid", value: "xyz" },
      ]);
    });

    it("skips transient writes that match the source value", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.setField("uuid", "abc");
      expect(s.getJsonPatch()).toEqual([]);
    });

    describe("DateTime normalization", () => {
      // MongoDB serializes datetimes as { _cls: "DateTime", datetime: <ms> };
      // sidebar edits arrive as ISO strings. The two must compare equal so we
      // don't emit a `replace` op every flush after an autosave roundtrip.
      const iso = "2026-02-11T00:00:00.000Z";
      const ms = new Date(iso).getTime();

      it("treats a {_cls,datetime} source as equal to an ISO transient of the same instant", () => {
        const s = new Sample({
          schema: detectionsSchema,
          data: { actual_date_field: { _cls: "DateTime", datetime: ms } },
        });
        s.setField("actual_date_field", iso);
        expect(s.getJsonPatch()).toEqual([]);
      });

      it("still emits a replace when the ISO transient is a different instant", () => {
        const s = new Sample({
          schema: detectionsSchema,
          data: { actual_date_field: { _cls: "DateTime", datetime: ms } },
        });
        const newIso = "2026-03-15T12:00:00.000Z";
        s.setField("actual_date_field", newIso);
        expect(s.getJsonPatch()).toEqual([
          { op: "replace", path: "/actual_date_field", value: newIso },
        ]);
      });

      it("gc clears the transient once the server roundtrip reseeds source as a DateTime object", () => {
        const s = new Sample({ schema: detectionsSchema });
        s.setField("actual_date_field", iso);
        // server applied the patch and returned the field as a DateTime wrapper
        s.setData({ actual_date_field: { _cls: "DateTime", datetime: ms } });
        expect(s.getJsonPatch()).toEqual([]);
      });

      it("normalizes nested DateTime fields inside label structural diffs", () => {
        const labelSchema: Schema = {
          ground_truth: field("fiftyone.core.labels.Detections", {
            detections: field(null),
          }),
        };
        const s = new Sample({
          schema: labelSchema,
          data: {
            ground_truth: {
              _cls: "Detections",
              detections: [
                {
                  _id: "d1",
                  _cls: "Detection",
                  label: "cat",
                  when: { _cls: "DateTime", datetime: ms },
                },
              ],
            },
          },
        });
        // re-set the same label with the date already normalized to ISO
        s.updateLabel("ground_truth", { _id: "d1", when: iso });
        expect(s.getJsonPatch()).toEqual([]);
      });
    });

    it("dispatches to a custom supplier when one is registered", () => {
      const custom = vi.fn().mockReturnValue([{ op: "test", path: "" }]);
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
        suppliers: { [LabelType.Detection]: custom },
      });
      s.updateLabel("detection", { _id: "d1", label: "lion" });
      const patch = s.getJsonPatch();
      expect(custom).toHaveBeenCalledOnce();
      expect(patch).toEqual([{ op: "test", path: "/detection" }]);
    });
  });

  describe("subscribe / getVersion", () => {
    it("notifies subscribers on every mutator", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "abc" } });
      const listener = vi.fn();
      s.subscribe(listener);

      s.setField("uuid", "xyz");
      s.updateLabel("detection", { _id: "d1", label: "cat" });
      s.deleteLabel("detection");
      s.clear();
      s.setData({ uuid: "abc" });
      s.setSchema(detectionsSchema);

      expect(listener).toHaveBeenCalledTimes(6);
    });

    it("returns an unsubscribe function", () => {
      const s = new Sample();
      const listener = vi.fn();
      const unsubscribe = s.subscribe(listener);
      s.setField("a", 1);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      s.setField("b", 2);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("increments version monotonically", () => {
      const s = new Sample();
      const before = s.getVersion();
      s.setField("a", 1);
      const after = s.getVersion();
      expect(after).toBeGreaterThan(before);
    });

    it("version is stable across reads", () => {
      const s = new Sample();
      s.setField("a", 1);
      expect(s.getVersion()).toBe(s.getVersion());
    });
  });

  describe("firstEditedLabel", () => {
    it("returns undefined when nothing is edited", () => {
      const s = new Sample({ schema: detectionsSchema });
      expect(s.firstEditedLabel()).toBeUndefined();
    });

    it("returns the upserted element of a list label", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
          },
        },
      });
      s.updateLabel("ground_truth", { _id: "d2", label: "wolf" });

      expect(s.firstEditedLabel()).toEqual({
        labelId: "d2",
        labelPath: "ground_truth",
      });
    });

    it("appends the list child key when isGenerated=true", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat")],
          },
        },
      });
      s.updateLabel("ground_truth", { _id: "d1", label: "lion" });

      expect(s.firstEditedLabel({ isGenerated: true })).toEqual({
        labelId: "d1",
        labelPath: "ground_truth.detections",
      });
    });

    it("returns the single label when a single-label field changes", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.updateLabel("detection", { _id: "d1", label: "lion" });

      expect(s.firstEditedLabel()).toEqual({
        labelId: "d1",
        labelPath: "detection",
      });
    });

    it("skips list entries that match source and returns the first divergent one", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
          },
        },
      });
      // touch the field but only mutate d2
      s.updateLabel("ground_truth", { _id: "d2", label: "wolf" });

      expect(s.firstEditedLabel()).toEqual({
        labelId: "d2",
        labelPath: "ground_truth",
      });
    });

    it("skips non-label primitive edits", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.setField("uuid", "xyz");
      expect(s.firstEditedLabel()).toBeUndefined();
    });
  });

  describe("gc on setData", () => {
    it("drops transient entries that have been incorporated into source", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.setField("uuid", "xyz");
      // server roundtrip: source now matches what we'd written
      s.setData({ uuid: "xyz" });
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("keeps transient entries that still diverge from source", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { uuid: "abc" },
      });
      s.setField("uuid", "xyz");
      s.setData({ uuid: "def" });
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/uuid", value: "xyz" },
      ]);
    });

    it("drops pending deletions once the source no longer has the field", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.deleteLabel("detection");
      s.setData({}); // server confirmed the deletion
      expect(s.getJsonPatch()).toEqual([]);
    });
  });
});
