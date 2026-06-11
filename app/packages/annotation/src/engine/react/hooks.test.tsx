// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  useEngineSelector,
  useInteraction,
  useSurfaceActions,
  useTemporal,
} from "./hooks";
import { makeDet, makeEngine, ref } from "../testing/fixtures";

describe("useEngineSelector", () => {
  it("re-renders when the selected value changes", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });

    const { result } = renderHook(() =>
      useEngineSelector(engine, (e) => e.getLabel(ref("ground_truth", "d1")))
    );
    expect(result.current?.label).toBe("cat");

    act(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    });
    expect(result.current?.label).toBe("dog");
  });

  it("equality-checked selectors skip re-renders for unrelated changes", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    let renders = 0;

    const { result } = renderHook(() => {
      renders++;
      return useEngineSelector(
        engine,
        (e) => e.listLabels({ sample: "sample-1", path: "ground_truth" }).length
      );
    });
    expect(result.current).toBe(1);
    const before = renders;

    // value-irrelevant change: count stays 1, no re-render
    act(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    });
    expect(renders).toBe(before);

    act(() => {
      engine.createLabel("ground_truth", { label: "bird" });
    });
    expect(result.current).toBe(2);
  });

  it("selector changes (fresh props) take effect without a version bump", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useEngineSelector(
          engine,
          (e) => e.getLabel(ref("ground_truth", id))?.label
        ),
      { initialProps: { id: "d1" } }
    );
    expect(result.current).toBe("cat");

    rerender({ id: "d2" });
    expect(result.current).toBe("dog");
  });
});

describe("useInteraction", () => {
  it("derives the anchor reactively", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });

    const { result } = renderHook(() =>
      useInteraction(engine, (i) => i.getAnchor())
    );
    expect(result.current).toBeUndefined();

    act(() => {
      engine.interaction.setActive([ref("ground_truth", "d1")]);
    });
    expect(result.current).toEqual(ref("ground_truth", "d1"));
  });

  it("reflects GC: deleting the anchored label clears the derivation", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    const { result } = renderHook(() =>
      useInteraction(engine, (i) => i.getAnchor())
    );

    act(() => {
      engine.deleteLabel(ref("ground_truth", "d1"));
    });
    expect(result.current).toBeUndefined();
  });
});

describe("useTemporal", () => {
  it("derives presence (≡ pool when non-temporal)", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });

    const { result } = renderHook(() =>
      useTemporal(engine, (t) => t.getPresent().length)
    );
    expect(result.current).toBe(1);

    act(() => {
      engine.createLabel("ground_truth", { label: "bird" });
    });
    expect(result.current).toBe(2);
  });
});

describe("useSurfaceActions", () => {
  it("writes through the ambient sample scope", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });

    const { result } = renderHook(() => useSurfaceActions(engine, "sidebar"));

    act(() => {
      result.current.updateLabel(
        { path: "ground_truth", instanceId: "d1" },
        { label: "dog" }
      );
    });

    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("dog");
    expect(result.current.surface).toBe("sidebar");
  });

  it("is referentially stable across re-renders", () => {
    const { engine } = makeEngine();
    const { result, rerender } = renderHook(() =>
      useSurfaceActions(engine, "sidebar")
    );
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });
});
