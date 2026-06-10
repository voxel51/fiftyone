import { describe, expect, it, vi } from "vitest";
import { LabelData, LabelType, Sample, SampleChangeKind } from "./index";
import { Field, Schema } from "../schema";

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
  polylines: field("fiftyone.core.labels.Polylines"),
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

    it("preserves server-managed fields the transient omits (no spurious removes / save loop)", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [{ _id: "d1", _cls: "Detection", label: "cat" }],
          },
        },
      });

      // A lighter overlay edit writes a partial label (no tags/attributes yet).
      s.updateLabel("ground_truth", { _id: "d1", mask: "m1" });

      // Server applied the edit and reseeded source with default fields it
      // manages (tags/attributes) plus the persisted mask.
      s.setData({
        ground_truth: {
          _cls: "Detections",
          detections: [
            {
              _id: "d1",
              _cls: "Detection",
              label: "cat",
              mask: "m1",
              tags: [],
              attributes: {},
            },
          ],
        },
      });

      // The stale partial must NOT emit remove ops for tags/attributes (which
      // would loop forever as the server re-adds them).
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("preserves server-managed parent fields on a newly-created list field (no _cls remove loop)", () => {
      // First polyline on a field absent from source: the transient parent has
      // no `_cls`. The server assigns it on save; the parent diff must not emit
      // a spurious `remove /polylines/_cls` (which would loop forever).
      const s = new Sample({ schema: detectionsSchema, data: {} });

      s.updateLabel("polylines", {
        _id: "p1",
        _cls: "Polyline",
        label: "lane",
        points: [[[0.1, 0.1]]],
        closed: false,
        filled: false,
      });

      s.setData({
        polylines: {
          _cls: "Polylines",
          polylines: [
            {
              _id: "p1",
              _cls: "Polyline",
              label: "lane",
              points: [[[0.1, 0.1]]],
              closed: false,
              filled: false,
              tags: [],
              attributes: {},
            },
          ],
        },
      });

      expect(s.getJsonPatch()).toEqual([]);
    });

    it("still emits a real change while preserving omitted server fields", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [
              { _id: "d1", _cls: "Detection", label: "cat", tags: ["a"] },
            ],
          },
        },
      });
      // Partial update changes the mask only; omits tags.
      s.setField("ground_truth", {
        _cls: "Detections",
        detections: [
          { _id: "d1", _cls: "Detection", label: "cat", mask: "m2" },
        ],
      });

      expect(s.getJsonPatch()).toEqual([
        { op: "add", path: "/ground_truth/detections/0/mask", value: "m2" },
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

  describe("getJsonPatch — generated views", () => {
    it("emits a single-element diff rooted at the label (no parent-field prefix)", () => {
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

      // Non-generated: parent-list-scoped path with the element index.
      expect(s.getJsonPatch()).toEqual([
        {
          op: "replace",
          path: "/ground_truth/detections/1/label",
          value: "wolf",
        },
      ]);
      // Generated: only the changed element, rooted at the label.
      expect(s.getJsonPatch({ isGenerated: true })).toEqual([
        { op: "replace", path: "/label", value: "wolf" },
      ]);
    });

    it("pairs with firstEditedLabel metadata for routing", () => {
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

      expect(s.getJsonPatch({ isGenerated: true })).toEqual([
        { op: "replace", path: "/label", value: "lion" },
      ]);
      expect(s.firstEditedLabel({ isGenerated: true })).toEqual({
        labelId: "d1",
        labelPath: "ground_truth.detections",
      });
    });

    it("emits adds rooted at the label for a newly-created element", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [makeDet("d1", "cat")],
          },
        },
      });
      s.updateLabel("ground_truth", {
        _id: "d2",
        _cls: "Detection",
        label: "dog",
      });

      const patch = s.getJsonPatch({ isGenerated: true });
      // Every op describes the new element relative to its own root — no
      // parent-field prefix — and together they reconstruct the element.
      expect(patch.length).toBeGreaterThan(0);
      expect(patch.every((d) => d.op === "add")).toBe(true);
      expect(patch.every((d) => !d.path.includes("ground_truth"))).toBe(true);
      expect(
        Object.fromEntries(
          patch.map((d) => [
            d.path.replace(/^\//, ""),
            (d as { value: unknown }).value,
          ])
        )
      ).toEqual({ _id: "d2", _cls: "Detection", label: "dog" });
    });

    it("emits a root-level diff for a single (non-list) label", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.updateLabel("detection", { _id: "d1", label: "lion" });

      expect(s.getJsonPatch({ isGenerated: true })).toEqual([
        { op: "replace", path: "/label", value: "lion" },
      ]);
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

  describe("reconcilePersisted (server-owned field release)", () => {
    const detData = (extra: Record<string, unknown> = {}) => ({
      detection: { _id: "d1", _cls: "Detection", label: "cat", ...extra },
    });

    it("releases a persisted mask so a server re-encode does not loop", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: detData({ mask: "m0" }),
      });

      s.updateLabel("detection", { _id: "d1", mask: "m1" });
      const deltas = s.getJsonPatch();
      expect(deltas).toEqual([
        { op: "replace", path: "/detection/mask", value: "m1" },
      ]);

      // Server accepted the edit; reconcile releases the write-once mask.
      s.reconcilePersisted(deltas);
      expect(s.getJsonPatch()).toEqual([]);

      // Server echoes the mask in a different representation than we sent.
      // Without the release this diffs forever; the transient now defers to
      // source.
      s.setData(detData({ mask: "m1-reencoded-by-server" }));
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("releases a relocated mask edit (inline mask -> server-chosen path)", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: detData({ mask_path: "/p0" }),
      });

      // Lighter persists an inline mask and nulls the source path.
      s.updateLabel("detection", {
        _id: "d1",
        mask: "pending",
        mask_path: null,
      });
      s.reconcilePersisted(s.getJsonPatch());
      expect(s.getJsonPatch()).toEqual([]);

      // Server stored the mask to a path it chose — unpredictable client-side.
      s.setData(detData({ mask_path: "/server/chosen/p1" }));
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("preserves a re-paint that landed after the patch was built (value CAS)", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: detData({ mask: "m0" }),
      });

      s.updateLabel("detection", { _id: "d1", mask: "m1" });
      const deltas = s.getJsonPatch(); // captures m1

      // User paints again while the m1 request is in flight.
      s.updateLabel("detection", { _id: "d1", mask: "m2" });

      s.reconcilePersisted(deltas); // stale deltas reference m1, not m2
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/detection/mask", value: "m2" },
      ]);
    });

    it("does not release non-server-owned fields", () => {
      const s = new Sample({ schema: detectionsSchema, data: detData() });

      s.updateLabel("detection", { _id: "d1", label: "dog" });
      const deltas = s.getJsonPatch();
      expect(deltas).toEqual([
        { op: "replace", path: "/detection/label", value: "dog" },
      ]);

      // A real value edit is owned by the transient until source confirms it;
      // it must survive reconcile (only gc-on-setData clears it).
      s.reconcilePersisted(deltas);
      expect(s.getJsonPatch()).toEqual([
        { op: "replace", path: "/detection/label", value: "dog" },
      ]);
    });

    it("releases a list-label mask without touching an un-edited sibling", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: {
          ground_truth: {
            _cls: "Detections",
            detections: [
              { _id: "d1", _cls: "Detection", label: "cat", mask: "a0" },
              { _id: "d2", _cls: "Detection", label: "dog", mask: "b0" },
            ],
          },
        },
      });

      s.updateLabel("ground_truth", { _id: "d1", mask: "a1" });
      const deltas = s.getJsonPatch();
      expect(deltas).toEqual([
        { op: "replace", path: "/ground_truth/detections/0/mask", value: "a1" },
      ]);

      s.reconcilePersisted(deltas);
      // Server re-encodes BOTH masks on save; neither should loop.
      s.setData({
        ground_truth: {
          _cls: "Detections",
          detections: [
            { _id: "d1", _cls: "Detection", label: "cat", mask: "a1-reenc" },
            { _id: "d2", _cls: "Detection", label: "dog", mask: "b0-reenc" },
          ],
        },
      });
      expect(s.getJsonPatch()).toEqual([]);
    });

    it("releases a mask nested inside a whole-element add (new detection)", () => {
      // Adding a new masked detection emits a single `add` of the whole element,
      // so the mask is nested in the op value (pointer leaf is the array index,
      // not `mask`). It must still be released, else the next autosave tick
      // re-diffs the server-re-encoded mask — the extra save.
      const s = new Sample({
        schema: detectionsSchema,
        data: { ground_truth: { _cls: "Detections", detections: [] } },
      });

      s.updateLabel("ground_truth", {
        _id: "d1",
        _cls: "Detection",
        label: "vehicle",
        bounding_box: [0.1, 0.2, 0.3, 0.4],
        mask: "m-new",
      });

      const deltas = s.getJsonPatch();
      expect(deltas).toEqual([
        {
          op: "add",
          path: "/ground_truth/detections/0",
          value: {
            _id: "d1",
            _cls: "Detection",
            label: "vehicle",
            bounding_box: [0.1, 0.2, 0.3, 0.4],
            mask: "m-new",
          },
        },
      ]);

      s.reconcilePersisted(deltas);

      // Server hydrates the new detection with a re-encoded mask + the fields it
      // manages. The released mask defers to source and the rest matches, so
      // there is no redundant second save.
      s.setData({
        ground_truth: {
          _cls: "Detections",
          detections: [
            {
              _id: "d1",
              _cls: "Detection",
              label: "vehicle",
              bounding_box: [0.1, 0.2, 0.3, 0.4],
              mask: "m-new-reencoded",
              tags: [],
              attributes: {},
            },
          ],
        },
      });

      expect(s.getJsonPatch()).toEqual([]);
    });

    it("supports a custom server-owned field set", () => {
      const s = new Sample({
        schema: detectionsSchema,
        serverOwnedFields: ["embedding"],
        data: detData({ embedding: "e0" }),
      });

      s.updateLabel("detection", { _id: "d1", embedding: "e1" });
      s.reconcilePersisted(s.getJsonPatch());
      s.setData(detData({ embedding: "e1-server" }));
      expect(s.getJsonPatch()).toEqual([]);
    });
  });

  describe("subscribeChanges", () => {
    it("emits an update change for setField", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.setField("uuid", "b");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([
        { path: "uuid", kind: SampleChangeKind.Update },
      ]);
    });

    it("emits a delete change for deleteField", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.deleteField("uuid");

      expect(listener).toHaveBeenCalledWith([
        { path: "uuid", kind: SampleChangeKind.Delete },
      ]);
    });

    it("tags list-label edits with the element id", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { ground_truth: { detections: [makeDet("d1", "cat")] } },
      });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.updateLabel("ground_truth", { _id: "d1", label: "dog" });

      expect(listener).toHaveBeenCalledWith([
        { path: "ground_truth", labelId: "d1", kind: SampleChangeKind.Update },
      ]);
    });

    it("omits the element id for single-label edits", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.updateLabel("detection", { _id: "d1", label: "dog" });

      expect(listener).toHaveBeenCalledWith([
        { path: "detection", kind: SampleChangeKind.Update },
      ]);
    });

    it("tags list-label deletions with the element id", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { ground_truth: { detections: [makeDet("d1", "cat")] } },
      });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.deleteLabel("ground_truth", "d1");

      expect(listener).toHaveBeenCalledWith([
        { path: "ground_truth", labelId: "d1", kind: SampleChangeKind.Delete },
      ]);
    });

    it("emits the whole-sample reset sentinel for clear() and setData()", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.setData({ uuid: "b" });
      s.clear();

      expect(listener).toHaveBeenNthCalledWith(1, [
        { path: "", kind: SampleChangeKind.Reset },
      ]);
      expect(listener).toHaveBeenNthCalledWith(2, [
        { path: "", kind: SampleChangeKind.Reset },
      ]);
    });

    it("does not emit a change for a schema-only update, but bumps version", () => {
      const s = new Sample({ data: { uuid: "a" } });
      const listener = vi.fn();
      s.subscribeChanges(listener);
      const before = s.getVersion();

      s.setSchema(detectionsSchema);

      expect(listener).not.toHaveBeenCalled();
      expect(s.getVersion()).toBe(before + 1);
    });

    it("emits a per-path reset when reconcilePersisted releases a field", () => {
      const s = new Sample({
        schema: detectionsSchema,
        data: { detection: makeDet("d1", "cat") },
      });
      s.updateLabel("detection", { _id: "d1", mask: "m1" });
      const listener = vi.fn();
      s.subscribeChanges(listener);

      s.reconcilePersisted(s.getJsonPatch());

      expect(listener).toHaveBeenCalledWith([
        { path: "detection", kind: SampleChangeKind.Reset },
      ]);
    });

    it("stops delivering after unsubscribe", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const listener = vi.fn();
      const unsubscribe = s.subscribeChanges(listener);

      s.setField("uuid", "b");
      unsubscribe();
      s.setField("uuid", "c");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("still notifies bare display subscribers alongside change subscribers", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const display = vi.fn();
      const change = vi.fn();
      s.subscribe(display);
      s.subscribeChanges(change);

      s.setField("uuid", "b");

      expect(display).toHaveBeenCalledTimes(1);
      expect(change).toHaveBeenCalledTimes(1);
    });

    it("throws if a change subscriber writes back to Sample", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      s.subscribeChanges(() => {
        s.setField("uuid", "from-subscriber");
      });

      expect(() => s.setField("uuid", "x")).toThrow(/never write back/);
    });

    it("throws if a display subscriber writes back to Sample", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      s.subscribe(() => {
        s.setField("uuid", "from-display-subscriber");
      });

      expect(() => s.setField("uuid", "x")).toThrow(/never write back/);
    });

    it("recovers after a thrown reentrant write (dispatch flag reset)", () => {
      const s = new Sample({ schema: detectionsSchema, data: { uuid: "a" } });
      const unsubscribe = s.subscribeChanges(() => {
        throw new Error("boom");
      });

      expect(() => s.setField("uuid", "x")).toThrow("boom");
      unsubscribe();
      // The finally in notify() must have cleared `dispatching`.
      expect(() => s.setField("uuid", "y")).not.toThrow();
    });
  });
});
