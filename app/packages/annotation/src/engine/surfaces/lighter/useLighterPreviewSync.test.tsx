import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { encodeEntityId } from "../../identity/entityId";
import { LABEL_PATCH_SIGNAL } from "../../signals/labelPatch";
import { makeEngine, ref } from "../../testing/fixtures";
import { useLighterPreviewSync } from "./useLighterPreviewSync";

const overlay = (label: Record<string, unknown>) => ({
  label,
  applyLabel: vi.fn(),
});

const scene = (overlays: Record<string, ReturnType<typeof overlay>>) =>
  ({ getOverlay: (id: string) => overlays[id] } as never);

const publish = (
  engine: ReturnType<typeof makeEngine>["engine"],
  instanceId: string,
  patch: Record<string, unknown>,
  sample = "sample-1",
  dataset = "ds"
) =>
  engine.publishSignal(
    LABEL_PATCH_SIGNAL,
    encodeEntityId(dataset, ref("ground_truth", instanceId, sample)),
    patch
  );

describe("useLighterPreviewSync", () => {
  it("merges a published patch onto the matching overlay (render-only)", () => {
    const { engine } = makeEngine();
    const d1 = overlay({ _id: "d1", label: "car", confidence: 0.2 });
    renderHook(() =>
      useLighterPreviewSync(engine, "ds", "sample-1", scene({ d1 }))
    );

    publish(engine, "d1", { confidence: 0.9 });

    expect(d1.applyLabel).toHaveBeenCalledWith({
      _id: "d1",
      label: "car",
      confidence: 0.9,
    });
  });

  it("ignores a patch for a different sample", () => {
    const { engine } = makeEngine();
    const d1 = overlay({ _id: "d1" });
    renderHook(() =>
      useLighterPreviewSync(engine, "ds", "sample-1", scene({ d1 }))
    );

    publish(engine, "d1", { confidence: 0.9 }, "other-sample");

    expect(d1.applyLabel).not.toHaveBeenCalled();
  });

  it("ignores a patch from a different dataset", () => {
    const { engine } = makeEngine();
    const d1 = overlay({ _id: "d1" });
    renderHook(() =>
      useLighterPreviewSync(engine, "ds", "sample-1", scene({ d1 }))
    );

    publish(engine, "d1", { confidence: 0.9 }, "sample-1", "other-dataset");

    expect(d1.applyLabel).not.toHaveBeenCalled();
  });

  it("no-ops when the scene has no matching overlay", () => {
    const { engine } = makeEngine();
    renderHook(() =>
      useLighterPreviewSync(engine, "ds", "sample-1", scene({}))
    );

    expect(() => publish(engine, "absent", { confidence: 0.9 })).not.toThrow();
  });

  it("stops applying after unmount", () => {
    const { engine } = makeEngine();
    const d1 = overlay({ _id: "d1" });
    const { unmount } = renderHook(() =>
      useLighterPreviewSync(engine, "ds", "sample-1", scene({ d1 }))
    );

    unmount();
    publish(engine, "d1", { confidence: 0.9 });

    expect(d1.applyLabel).not.toHaveBeenCalled();
  });
});
