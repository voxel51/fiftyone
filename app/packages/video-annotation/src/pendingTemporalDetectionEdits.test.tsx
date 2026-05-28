import { act, render } from "@testing-library/react";
import { Provider } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyTemporalDetectionEdits,
  parseTemporalDetectionEditKey,
  temporalDetectionEditKey,
  useClearTemporalDetectionEdits,
  useStageTemporalDetectionSupport,
  useTemporalDetectionPendingEdits,
} from "./pendingTemporalDetectionEdits";

function HookHost({
  onReady,
}: {
  onReady: (handles: {
    stage: ReturnType<typeof useStageTemporalDetectionSupport>;
    clear: ReturnType<typeof useClearTemporalDetectionEdits>;
    read: () => ReadonlyMap<string, [number, number]>;
  }) => void;
}) {
  const stage = useStageTemporalDetectionSupport();
  const clear = useClearTemporalDetectionEdits();
  const map = useTemporalDetectionPendingEdits();

  onReady({ stage, clear, read: () => map });

  return <div data-testid="size">{map.size}</div>;
}

function renderHost() {
  let handles!: {
    stage: ReturnType<typeof useStageTemporalDetectionSupport>;
    clear: ReturnType<typeof useClearTemporalDetectionEdits>;
    read: () => ReadonlyMap<string, [number, number]>;
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
    // First pipe terminates fieldPath; everything after is detectionId.
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

  it("stages an edit keyed by fieldPath + detectionId", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", [5, 15]);
    });
    const m = handles().read();
    expect(m.size).toBe(1);
    expect(m.get("events|a")).toEqual([5, 15]);
  });

  it("overwrites a prior edit on the same TD", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", [5, 15]);
    });
    act(() => {
      handles().stage("events", "a", [8, 20]);
    });
    expect(handles().read().get("events|a")).toEqual([8, 20]);
    expect(handles().read().size).toBe(1);
  });

  it("keeps edits for different TDs separate", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", [5, 15]);
      handles().stage("highlights", "a", [22, 28]);
    });
    const m = handles().read();
    expect(m.size).toBe(2);
    expect(m.get("events|a")).toEqual([5, 15]);
    expect(m.get("highlights|a")).toEqual([22, 28]);
  });

  it("clear drops every staged edit", () => {
    const { handles } = renderHost();
    act(() => {
      handles().stage("events", "a", [5, 15]);
      handles().stage("events", "b", [25, 35]);
    });
    expect(handles().read().size).toBe(2);
    act(() => {
      handles().clear();
    });
    expect(handles().read().size).toBe(0);
  });
});

describe("applyTemporalDetectionEdits", () => {
  const td = (id: string, support: [number, number]) => ({
    _cls: "TemporalDetection",
    _id: id,
    label: "x",
    support,
  });

  const field = (...detections: ReturnType<typeof td>[]) => ({
    _cls: "TemporalDetections" as const,
    detections,
  });

  it("returns the same reference when no edits are staged", () => {
    const sample = { events: field(td("a", [1, 5])) };
    expect(applyTemporalDetectionEdits(sample, new Map())).toBe(sample);
  });

  it("applies a single edit and clones the affected field's detections array", () => {
    const original = field(td("a", [1, 5]), td("b", [10, 20]));
    const sample = { events: original };
    const edits = new Map<string, [number, number]>([["events|a", [3, 7]]]);

    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { _id: string; support: [number, number] }[] };
    };

    expect(out.events.detections[0].support).toEqual([3, 7]);
    expect(out.events.detections[1].support).toEqual([10, 20]);
    // Detections array on the touched field is cloned.
    expect(out.events.detections).not.toBe(original.detections);
  });

  it("clones the top-level sample object so the original is not mutated", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["events|a", [3, 7] as [number, number]]])
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
      new Map([["events|a", [3, 7] as [number, number]]])
    ) as { other: typeof otherField };
    // `other` wasn't touched — same reference.
    expect(out.other).toBe(otherField);
  });

  it("groups edits per field so a single clone covers multiple TDs in that field", () => {
    const original = field(td("a", [1, 5]), td("b", [10, 20]));
    const sample = { events: original };
    const edits = new Map<string, [number, number]>([
      ["events|a", [3, 7]],
      ["events|b", [12, 18]],
    ]);
    const out = applyTemporalDetectionEdits(sample, edits) as {
      events: { detections: { _id: string; support: [number, number] }[] };
    };
    expect(out.events.detections[0].support).toEqual([3, 7]);
    expect(out.events.detections[1].support).toEqual([12, 18]);
  });

  it("silently skips edits for missing fields", () => {
    const sample = { events: field(td("a", [1, 5])) };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["ghost|a", [3, 7] as [number, number]]])
    );
    // No field touched ⇒ out is the spread clone but events ref is preserved.
    expect((out as typeof sample).events).toBe(sample.events);
  });

  it("silently skips edits for missing detections within a field", () => {
    const original = field(td("a", [1, 5]));
    const sample = { events: original };
    const out = applyTemporalDetectionEdits(
      sample,
      new Map([["events|ghost", [99, 100] as [number, number]]])
    ) as {
      events: { detections: { _id: string; support: [number, number] }[] };
    };
    // Field is cloned but detection support unchanged.
    expect(out.events.detections[0].support).toEqual([1, 5]);
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
      new Map([["events|x", [3, 7] as [number, number]]])
    ) as { events: { detections: { support: [number, number] }[] } };
    expect(out.events.detections[0].support).toEqual([3, 7]);
  });
});
