import { describe, expect, it } from "vitest";
import { classifyLabelOps, isEmptyLabelOps } from "./labelOps";
import type { JSONDeltas } from "../types";

const sample = {
  _id: "smp1",
  ground_truth: {
    detections: [
      { _id: "n1", label: "car" },
      { _id: "n2", label: "car" },
      { _id: "n3", label: "bus" },
      { _id: "n4", label: "bike" },
      { _id: "n5", label: "car" },
    ],
  },
  weather: { classification: { _id: "w1", label: "sunny" } },
};

describe("classifyLabelOps", () => {
  it("groups multiple deep ops on one label as a single modify", () => {
    const deltas = [
      {
        op: "replace",
        path: "/ground_truth/detections/0/bounding_box/3",
        value: 1,
      },
      {
        op: "replace",
        path: "/ground_truth/detections/0/bounding_box/2",
        value: 2,
      },
      {
        op: "replace",
        path: "/ground_truth/detections/0/bounding_box/1",
        value: 3,
      },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: [],
        deleted: [],
        modified: ["n1"],
      }),
    );
  });

  it("classifies element removes as deletes with pre-patch ids", () => {
    const deltas = [
      { op: "remove", path: "/ground_truth/detections/4" },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: [],
        deleted: ["n5"],
        modified: [],
      }),
    );
  });

  it("classifies element adds from the op value, including appends", () => {
    const deltas = [
      { op: "add", path: "/ground_truth/detections/-", value: { _id: "n9" } },
      { op: "add", path: "/ground_truth/detections/5", value: { _id: "n8" } },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: ["n9", "n8"],
        deleted: [],
        modified: [],
      }),
    );
  });

  it("handles mixed patches and dedupes per label", () => {
    const deltas = [
      { op: "add", path: "/ground_truth/detections/-", value: { _id: "n9" } },
      {
        op: "replace",
        path: "/ground_truth/detections/1/label",
        value: "truck",
      },
      {
        op: "replace",
        path: "/ground_truth/detections/1/confidence",
        value: 0.9,
      },
      { op: "remove", path: "/ground_truth/detections/2" },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: ["n9"],
        deleted: ["n3"],
        modified: ["n2"],
      }),
    );
  });

  it("treats single-label fields as elements", () => {
    const deltas = [
      { op: "replace", path: "/weather/classification/label", value: "rain" },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: [],
        deleted: [],
        modified: ["w1"],
      }),
    );
  });

  it("uses the field-level fast path when labelId is supplied", () => {
    expect(
      classifyLabelOps({
        deltas: [
          { op: "remove", path: "/ground_truth/detections/0" },
        ] as JSONDeltas,
        preSample: sample,
        labelId: "n1",
        opType: "delete",
      }),
    ).toEqual(
      expect.objectContaining({ added: [], deleted: ["n1"], modified: [] }),
    );

    expect(
      classifyLabelOps({
        deltas: [
          {
            op: "add",
            path: "/ground_truth/detections/-",
            value: { _id: "n9" },
          },
        ] as JSONDeltas,
        preSample: sample,
        labelId: "n9",
        opType: "mutate",
      }),
    ).toEqual(
      expect.objectContaining({ added: ["n9"], deleted: [], modified: [] }),
    );

    expect(
      classifyLabelOps({
        deltas: [
          {
            op: "replace",
            path: "/ground_truth/detections/0/label",
            value: "x",
          },
        ] as JSONDeltas,
        preSample: sample,
        labelId: "n1",
        opType: "mutate",
      }),
    ).toEqual(
      expect.objectContaining({ added: [], deleted: [], modified: ["n1"] }),
    );
  });

  it("skips labels whose ids cannot be resolved", () => {
    const deltas = [
      { op: "remove", path: "/ground_truth/detections/99" },
      {
        op: "add",
        path: "/ground_truth/detections/-",
        value: { label: "no-id" },
      },
    ] as JSONDeltas;
    expect(classifyLabelOps({ deltas, preSample: sample })).toEqual(
      expect.objectContaining({
        added: [],
        deleted: [],
        modified: [],
      }),
    );
  });

  it("records the owning field per label", () => {
    const deltas = [
      { op: "replace", path: "/ground_truth/detections/0/label", value: "x" },
      { op: "remove", path: "/ground_truth/detections/4" },
    ] as JSONDeltas;
    const ops = classifyLabelOps({ deltas, preSample: sample });
    expect(ops.fieldOf).toEqual({ n1: "ground_truth", n5: "ground_truth" });
  });
});

describe("sequential index replay", () => {
  it("attributes sequential removes through the index shift", () => {
    // RFC-6902 applies ops in order: removing index 1 twice deletes the
    // ORIGINAL n2 then n3 (which shifted into slot 1).
    const pre = {
      ground_truth: {
        detections: [{ _id: "n1" }, { _id: "n2" }, { _id: "n3" }],
      },
    };
    const ops = classifyLabelOps({
      deltas: [
        { op: "remove", path: "/ground_truth/detections/1" },
        { op: "remove", path: "/ground_truth/detections/1" },
      ],
      preSample: pre,
    });
    expect(ops.deleted.sort()).toEqual(["n2", "n3"]);
    expect(ops.added).toEqual([]);
    expect(ops.modified).toEqual([]);
  });

  it("attributes labels nested under video frames", () => {
    const pre = {
      frames: {
        "1": {
          detections: { detections: [{ _id: "f1" }, { _id: "f2" }] },
        },
      },
    };
    const ops = classifyLabelOps({
      deltas: [
        { op: "remove", path: "/frames/1/detections/detections/0" },
        {
          op: "replace",
          path: "/frames/1/detections/detections/0/label",
          value: "bus",
        },
      ],
      preSample: pre,
    });
    // Sequential shift: the remove takes f1; the replace then edits f2
    // (which shifted into slot 0).
    expect(ops.deleted).toEqual(["f1"]);
    expect(ops.modified).toEqual(["f2"]);
  });
});

describe("whole-field ops (FOEPD-4344)", () => {
  it("counts a whole-field classification add via the container value", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "add",
          path: "/my_tags",
          value: { classifications: [{ _id: "c1", label: "cat" }] },
        },
      ] as JSONDeltas,
      preSample: { _id: "smp1" },
    });
    expect(ops.added).toEqual(["c1"]);
    expect(ops.deleted).toEqual([]);
    expect(ops.fieldOf.c1).toBe("my_tags");
  });

  it("counts a replace of an empty single-label field as an add", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/weather2",
          value: { _id: "c2", label: "rainy" },
        },
      ] as JSONDeltas,
      preSample: { _id: "smp1", weather2: null },
    });
    expect(ops.added).toEqual(["c2"]);
    expect(ops.modified).toEqual([]);
  });

  it("counts a same-id whole-field replace as a modify", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/weather",
          value: { classification: { _id: "w1", label: "cloudy" } },
        },
      ] as JSONDeltas,
      preSample: sample,
    });
    expect(ops.modified).toEqual(["w1"]);
    expect(ops.added).toEqual([]);
    expect(ops.deleted).toEqual([]);
  });

  it("diffs a whole-field replace that swaps the label", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/weather",
          value: { classification: { _id: "w9", label: "hail" } },
        },
      ] as JSONDeltas,
      preSample: sample,
    });
    expect(ops.added).toEqual(["w9"]);
    expect(ops.deleted).toEqual(["w1"]);
  });

  it("counts every contained label on a whole-field remove", () => {
    const ops = classifyLabelOps({
      deltas: [{ op: "remove", path: "/ground_truth" }] as JSONDeltas,
      preSample: sample,
    });
    expect([...ops.deleted].sort()).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  });

  it("treats a same-patch remove+add of one label as a move, not a delete", () => {
    const ops = classifyLabelOps({
      deltas: [
        { op: "remove", path: "/ground_truth/detections/0" },
        {
          op: "add",
          path: "/my_field/detections/-",
          value: { _id: "n1", label: "car" },
        },
      ] as JSONDeltas,
      preSample: sample,
    });
    expect(ops.added).toEqual(["n1"]);
    expect(ops.deleted).toEqual([]);
  });

  it("fast path: whole-field set of an absent label counts as added", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/new_tag",
          value: { _id: "c7", label: "dog" },
        },
      ] as JSONDeltas,
      preSample: { _id: "smp1" },
      labelId: "c7",
      opType: "mutate",
    });
    expect(ops.added).toEqual(["c7"]);
    expect(ops.modified).toEqual([]);
  });

  it("fast path: whole-field set of a pre-existing label stays a modify", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/weather",
          value: { classification: { _id: "w1", label: "fog" } },
        },
      ] as JSONDeltas,
      preSample: sample,
      labelId: "w1",
      opType: "mutate",
    });
    expect(ops.modified).toEqual(["w1"]);
    expect(ops.added).toEqual([]);
  });
});

describe("skeleton adds resolved from the post state (FOEPD-4344)", () => {
  it("classifies a skeleton add + per-property sets as one added label", () => {
    // The engine emits a NEW classification as an id-less skeleton add
    // followed by property sets — no single op carries the label id.
    const ops = classifyLabelOps({
      deltas: [
        { op: "add", path: "/lanny_tag", value: { _cls: "Classification" } },
        { op: "replace", path: "/lanny_tag/label", value: "cat" },
        { op: "replace", path: "/lanny_tag/confidence", value: 0.9 },
      ] as JSONDeltas,
      preSample: { _id: "smp1" },
      postSample: {
        _id: "smp1",
        lanny_tag: { _id: "c9", _cls: "Classification", label: "cat" },
      },
    });
    expect(ops.added).toEqual(["c9"]);
    expect(ops.modified).toEqual([]);
  });

  it("classifies deep sets on a pre-existing label as modified, not added", () => {
    const ops = classifyLabelOps({
      deltas: [
        { op: "replace", path: "/weather/classification/label", value: "fog" },
      ] as JSONDeltas,
      preSample: sample,
      postSample: sample,
    });
    expect(ops.modified).toEqual(["w1"]);
    expect(ops.added).toEqual([]);
  });

  it("resolves a whole-field replace via the post state when the op value is a skeleton", () => {
    const ops = classifyLabelOps({
      deltas: [
        { op: "replace", path: "/new_tag", value: { _cls: "Classification" } },
      ] as JSONDeltas,
      preSample: { _id: "smp1", new_tag: null },
      postSample: {
        _id: "smp1",
        new_tag: { _id: "c10", _cls: "Classification", label: "dog" },
      },
    });
    expect(ops.added).toEqual(["c10"]);
  });
});

describe("per-property add shape (FOEPD-4344, captured from the wire)", () => {
  it("classifies four per-property adds as ONE added label via the post state", () => {
    // The exact payload the app sends for a fresh classification tag —
    // no single op touches the element path, and no op value carries a
    // resolvable label object.
    const ops = classifyLabelOps({
      deltas: [
        { op: "add", path: "/lanny_tag/_cls", value: "Classification" },
        {
          op: "add",
          path: "/lanny_tag/_id",
          value: "6a75fda06f51230f8949c0f0",
        },
        { op: "add", path: "/lanny_tag/is_fun", value: false },
        { op: "add", path: "/lanny_tag/label", value: "a" },
      ] as JSONDeltas,
      preSample: { _id: "smp", lanny_tag: null },
      postSample: {
        _id: "smp",
        lanny_tag: {
          _id: { $oid: "6a75fda06f51230f8949c0f0" },
          _cls: "Classification",
          label: "a",
          is_fun: false,
        },
      },
    });
    expect(ops.added).toEqual(["6a75fda06f51230f8949c0f0"]);
    expect(ops.modified).toEqual([]);
    expect(ops.fieldOf["6a75fda06f51230f8949c0f0"]).toBe("lanny_tag");
  });
});

describe("video temporal labels identify by instance (FOEPD-4344 follow-up)", () => {
  const inst = { _id: { $oid: "aaaa000011112222aaaa0001" }, _cls: "Instance" };
  const frameDet = (id: string, frame: number) => ({
    op: "add",
    path: `/frames/${frame}/dets/detections/-`,
    value: { _id: id, label: "car", instance: inst },
  });

  it("keeps per-frame label ids and maps each to the shared instance", () => {
    const ops = classifyLabelOps({
      deltas: [
        frameDet("f1", 1),
        frameDet("f2", 2),
        frameDet("f3", 3),
      ] as JSONDeltas,
      preSample: { _id: "smp", frames: [] },
    });
    expect([...ops.added].sort()).toEqual(["f1", "f2", "f3"]);
    expect(ops.instanceOf).toEqual({
      f1: "aaaa000011112222aaaa0001",
      f2: "aaaa000011112222aaaa0001",
      f3: "aaaa000011112222aaaa0001",
    });
    expect(ops.fieldOf.f1).toBe("dets");
  });

  it("falls back to field+index identity for tracking-style labels", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "add",
          path: "/frames/1/dets/detections/-",
          value: { _id: "f1", label: "car", index: 7 },
        },
        {
          op: "add",
          path: "/frames/2/dets/detections/-",
          value: { _id: "f2", label: "car", index: 7 },
        },
      ] as JSONDeltas,
      preSample: { _id: "smp", frames: [] },
    });
    expect(ops.instanceOf).toEqual({ f1: "dets#track7", f2: "dets#track7" });
  });

  it("maps no instance when a frame label has no tracking identity", () => {
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "add",
          path: "/frames/1/dets/detections/-",
          value: { _id: "f1", label: "car" },
        },
        {
          op: "add",
          path: "/frames/2/dets/detections/-",
          value: { _id: "f2", label: "car" },
        },
      ] as JSONDeltas,
      preSample: { _id: "smp", frames: [] },
    });
    expect([...ops.added].sort()).toEqual(["f1", "f2"]);
    expect(ops.instanceOf).toEqual({});
  });

  it("edits of one instance across frames map both frame ids to it", () => {
    const pre = {
      _id: "smp",
      frames: [
        null,
        { dets: { detections: [{ _id: "f1", label: "car", instance: inst }] } },
        { dets: { detections: [{ _id: "f2", label: "car", instance: inst }] } },
      ],
    };
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/frames/1/dets/detections/0/label",
          value: "bus",
        },
        {
          op: "replace",
          path: "/frames/2/dets/detections/0/label",
          value: "bus",
        },
      ] as JSONDeltas,
      preSample: pre,
    });
    expect([...ops.modified].sort()).toEqual(["f1", "f2"]);
    expect(ops.instanceOf.f1).toBe("aaaa000011112222aaaa0001");
    expect(ops.instanceOf.f2).toBe("aaaa000011112222aaaa0001");
  });

  it("attributes a whole-frame-field replace to the frame's field", () => {
    const pre = {
      _id: "smp",
      frames: [
        null,
        { weather: { _id: "w1", label: "sunny", instance: inst } },
      ],
    };
    const ops = classifyLabelOps({
      deltas: [
        {
          op: "replace",
          path: "/frames/1/weather",
          value: { _id: "w1", label: "rain", instance: inst },
        },
      ] as JSONDeltas,
      preSample: pre,
    });
    expect(ops.modified).toEqual(["w1"]);
    expect(ops.fieldOf.w1).toBe("weather");
    expect(ops.instanceOf.w1).toBe("aaaa000011112222aaaa0001");
  });
});

describe("isEmptyLabelOps", () => {
  it("is true when no operations were classified", () => {
    expect(
      isEmptyLabelOps(classifyLabelOps({ deltas: [], preSample: sample })),
    ).toBe(true);
    expect(
      isEmptyLabelOps({
        added: [],
        deleted: [],
        modified: [],
        fieldOf: {},
        instanceOf: {},
      }),
    ).toBe(true);
  });

  it("is false when any operation set is populated", () => {
    expect(
      isEmptyLabelOps({
        added: [],
        deleted: ["n1"],
        modified: [],
        fieldOf: { n1: "ground_truth" },
        instanceOf: {},
      }),
    ).toBe(false);
    expect(
      isEmptyLabelOps(
        classifyLabelOps({
          deltas: [
            { op: "remove", path: "/ground_truth/detections/0" },
          ] as JSONDeltas,
          preSample: sample,
        }),
      ),
    ).toBe(false);
  });
});
