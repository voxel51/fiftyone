import { act, render } from "@testing-library/react";
import { Provider } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyTemporalDetectionEdits,
  firstTemporalDetectionFieldPath,
  parseTemporalDetectionEditKey,
  temporalDetectionEditKey,
  useClearTemporalDetectionEdits,
  useStageTemporalDetectionEdit,
  useTemporalDetectionPendingEdits,
  type TemporalDetectionEditFields,
} from "./pendingTemporalDetectionEdits";

function HookHost({
  onReady,
}: {
  onReady: (handles: {
    stage: ReturnType<typeof useStageTemporalDetectionEdit>;
    clear: ReturnType<typeof useClearTemporalDetectionEdits>;
    read: () => ReadonlyMap<string, TemporalDetectionEditFields>;
  }) => void;
}) {
  const stage = useStageTemporalDetectionEdit();
  const clear = useClearTemporalDetectionEdits();
  const map = useTemporalDetectionPendingEdits();

  onReady({ stage, clear, read: () => map });

  return <div data-testid="size">{map.size}</div>;
}

function renderHost() {
  let handles!: {
    stage: ReturnType<typeof useStageTemporalDetectionEdit>;
    clear: ReturnType<typeof useClearTemporalDetectionEdits>;
    read: () => ReadonlyMap<string, TemporalDetectionEditFields>;
  };
  const utils = render(
    <Provider>
      <HookHost
        onReady={(h) => {
          handles = h;
        }}
      />
    </Provider>
  );
  return { ...utils, handles: () => handles };
}

describe("temporalDetectionEditKey / parseTemporalDetectionEditKey", () => {
  it("round-trips fieldPath + detectionId", () => {
    const key = temporalDetectionEditKey("events", "a");
    expect(key).toBe("events|a");
    expect(parseTemporalDetectionEditKey(key)).toEqual({
      fieldPath: "events",
      detectionId: "a",
    });
  });

  it("keeps fieldPath and detectionId disambiguated across fields", () => {
    expect(temporalDetectionEditKey("events", "a")).not.toBe(
      temporalDetectionEditKey("highlights", "a")
    );
  });

  it("preserves detectionIds that contain a pipe character", () => {
    const key = temporalDetectionEditKey("events", "a|b|c");
    expect(parseTemporalDetectionEditKey(key)).toEqual({
      fieldPath: "events",
      detectionId: "a|b|c",
    });
  });
});

describe("pending TD edits store", () => {
  it("starts empty", () => {
    const { handles } = renderHost();
    expect(handles().read().size).toBe(0);
  });

  it("stages a support edit", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { support: [5, 15] });
    });
    const m = handles().read();
    expect(m.size).toBe(1);
    expect(m.get("events|a")).toEqual({ support: [5, 15] });
  });

  it("stages a label edit", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { label: "renamed" });
    });
    expect(handles().read().get("events|a")).toEqual({ label: "renamed" });
  });

  it("merges per-field on re-stage so a later label edit preserves an earlier support", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { support: [5, 15] });
    });
    act(() => {
      handles().stage("events", "a", { label: "renamed" });
    });
    expect(handles().read().get("events|a")).toEqual({
      support: [5, 15],
      label: "renamed",
    });
  });

  it("merges attributes per key on re-stage", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { attributes: { foo: "bar" } });
    });
    act(() => {
      handles().stage("events", "a", { attributes: { baz: 42 } });
    });
    expect(handles().read().get("events|a")).toEqual({
      attributes: { foo: "bar", baz: 42 },
    });
  });

  it("keeps edits for different TDs separate", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { support: [5, 15] });
      handles().stage("highlights", "a", { support: [22, 28] });
    });
    const m = handles().read();
    expect(m.size).toBe(2);
    expect(m.get("events|a")).toEqual({ support: [5, 15] });
    expect(m.get("highlights|a")).toEqual({ support: [22, 28] });
  });

  it("clear drops every staged edit", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", { support: [5, 15] });
      handles().stage("events", "b", { label: "x" });
    });
    expect(handles().read().size).toBe(2);
    act(() => {
      handles().clear();
    });
    expect(handles().read().size).toBe(0);
  });
});

describe("applyTemporalDetectionEdits", () => {
  const td = (
    id: string,
    support: [number, number],
    extra: Record<string, unknown> = {}
  ) => ({
    _cls: "TemporalDetection",
    _id: id,
    label: "x",
    support,
    ...extra,
  });

  const field = (...detections: ReturnType<typeof td>[]) => ({
    _cls: "TemporalDetections" as const,
    detections,
  });

  it("returns the same reference when no edits are staged", () => {
    const sample = { events: field(td("a", [1, 5])) };
    expect(applyTemporalDetectionEdits(sample, new Map())).toBe(sample);
  });

  it("applies a support edit", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const edits = new Map<string, TemporalDetectionEditFields>([
      ["events|a", { support: [3, 7] }],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { support: [number, number] }[] };
    };
    expect(out.events.detections[0].support).toEqual([3, 7]);
  });

  it("applies a label edit", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const edits = new Map<string, TemporalDetectionEditFields>([
      ["events|a", { label: "renamed" }],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { label: string; support: [number, number] }[] };
    };
    expect(out.events.detections[0].label).toBe("renamed");
    expect(out.events.detections[0].support).toEqual([1, 5]);
  });

  it("applies a confidence edit", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const edits = new Map<string, TemporalDetectionEditFields>([
      ["events|a", { confidence: 0.42 }],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { confidence: number }[] };
    };
    expect(out.events.detections[0].confidence).toBe(0.42);
  });

  it("sets dynamic attributes from `attributes`", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const edits = new Map<string, TemporalDetectionEditFields>([
      ["events|a", { attributes: { foo: "bar", n: 7 } }],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { foo: string; n: number }[] };
    };
    expect(out.events.detections[0].foo).toBe("bar");
    expect(out.events.detections[0].n).toBe(7);
  });

  it("removes a dynamic attribute when value is null", () => {
    const sample = {
      events: field(td("a", [1, 5], { foo: "bar" })),
    };
    const edits = new Map<string, TemporalDetectionEditFields>([
      ["events|a", { attributes: { foo: null } }],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: Record<string, unknown>[] };
    };
    expect("foo" in out.events.detections[0]).toBe(false);
  });

  it("combines multiple fields in one edit", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const edits = new Map<string, TemporalDetectionEditFields>([
      [
        "events|a",
        {
          support: [3, 7],
          label: "renamed",
          confidence: 0.9,
          attributes: { reviewed: true },
        },
      ],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: {
        detections: {
          support: [number, number];
          label: string;
          confidence: number;
          reviewed: boolean;
        }[];
      };
    };
    expect(out.events.detections[0]).toMatchObject({
      support: [3, 7],
      label: "renamed",
      confidence: 0.9,
      reviewed: true,
    });
  });

  it("clones the top-level sample object so the original is not mutated", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["events|a", { support: [3, 7] }]])
    );
    expect(out).not.toBe(sample);
    expect(sample.events.detections[0].support).toEqual([1, 5]);
  });

  it("leaves untouched top-level fields referentially stable", () => {
    const otherField = field(td("z", [99, 100]));
    const sample = {
      events: field(td("a", [1, 5])),
      other: otherField,
    };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["events|a", { support: [3, 7] }]])
    ) as { other: typeof otherField };
    expect(out.other).toBe(otherField);
  });

  it("silently skips edits for missing fields", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["ghost|a", { support: [3, 7] }]])
    );
    expect((out as typeof sample).events).toBe(sample.events);
  });

  it("falls back to `id` when `_id` is missing on the detection", () => {
    const sample = {
      events: {
        _cls: "TemporalDetections" as const,
        detections: [
          {
            _cls: "TemporalDetection",
            id: "x",
            support: [1, 5] as [number, number],
          },
        ],
      },
    };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["events|x", { support: [3, 7] }]])
    ) as { events: { detections: { support: [number, number] }[] } };
    expect(out.events.detections[0].support).toEqual([3, 7]);
  });

  describe("create-via-edit: appending synthetic TDs", () => {
    it("appends a synthetic TD when the staged `_id` isn't on the sample", () => {
      const sample = { events: field(td("a", [1, 5])) };
      const out = applyTemporalDetectionEdits(
        sample,
        new Map([
          [
            "events|new-id",
            { support: [20, 40] as [number, number], label: "fresh" },
          ],
        ])
      ) as {
        events: {
          detections: {
            _id: string;
            support: [number, number];
            label: string;
          }[];
        };
      };

      expect(out.events.detections).toHaveLength(2);
      expect(out.events.detections[1]).toMatchObject({
        _cls: "TemporalDetection",
        _id: "new-id",
        support: [20, 40],
        label: "fresh",
      });
    });

    it("skips an append when the staged entry has no support", () => {
      const sample = { events: field(td("a", [1, 5])) };
      const out = applyTemporalDetectionEdits(
        sample,
        new Map([["events|new-id", { label: "label-only" }]])
      ) as { events: { detections: unknown[] } };
      // Existing TD untouched; synthetic skipped (malformed).
      expect(out.events.detections).toHaveLength(1);
    });

    it("includes optional fields + attributes on the synthetic TD", () => {
      const sample = { events: field(td("a", [1, 5])) };
      const out = applyTemporalDetectionEdits(
        sample,
        new Map([
          [
            "events|new-id",
            {
              support: [10, 20] as [number, number],
              confidence: 0.7,
              attributes: { reviewed: true, dropped: null },
            },
          ],
        ])
      ) as { events: { detections: Record<string, unknown>[] } };

      expect(out.events.detections[1]).toMatchObject({
        confidence: 0.7,
        reviewed: true,
      });
      // null attributes are not present on the synthetic doc.
      expect("dropped" in out.events.detections[1]).toBe(false);
    });

    it("can append AND edit existing TDs in the same field in one pass", () => {
      const sample = { events: field(td("a", [1, 5])) };
      const out = applyTemporalDetectionEdits(
        sample,
        new Map([
          ["events|a", { support: [2, 6] as [number, number] }],
          ["events|new-id", { support: [50, 60] as [number, number] }],
        ])
      ) as {
        events: {
          detections: { _id: string; support: [number, number] }[];
        };
      };

      expect(out.events.detections).toHaveLength(2);
      expect(out.events.detections[0].support).toEqual([2, 6]);
      expect(out.events.detections[1]._id).toBe("new-id");
    });

    it("skips appends targeting a missing or non-TD field", () => {
      const sample = {
        events: field(td("a", [1, 5])),
        other: { _cls: "Detections", detections: [] },
      };
      const out = applyTemporalDetectionEdits(
        sample,
        new Map([
          ["ghost|n1", { support: [1, 2] as [number, number] }],
          ["other|n2", { support: [3, 4] as [number, number] }],
        ])
      );
      expect((out as typeof sample).events).toBe(sample.events);
      expect((out as typeof sample).other).toBe(sample.other);
    });
  });
});

describe("firstTemporalDetectionFieldPath", () => {
  it("returns null for an empty / null / undefined sample", () => {
    expect(firstTemporalDetectionFieldPath(null)).toBeNull();
    expect(firstTemporalDetectionFieldPath(undefined)).toBeNull();
    expect(firstTemporalDetectionFieldPath({})).toBeNull();
  });

  it("returns the first key whose value is a TemporalDetections wrapper", () => {
    const sample = {
      foo: "string",
      events: { _cls: "TemporalDetections", detections: [] },
      highlights: { _cls: "TemporalDetections", detections: [] },
    };
    expect(firstTemporalDetectionFieldPath(sample)).toBe("events");
  });

  it("ignores Detections / Classifications / plain objects", () => {
    const sample = {
      detections: { _cls: "Detections", detections: [] },
      classifications: { _cls: "Classifications", classifications: [] },
      metadata: { width: 100 },
    };
    expect(firstTemporalDetectionFieldPath(sample)).toBeNull();
  });
});
