// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { useSurfaceBridge } from "./useSurfaceBridge";
import type { LabelKindAdapter, SurfaceBridge } from "../bridge/types";
import { makeDet, makeEngine, ref } from "../testing/fixtures";

type Handle = { id: string; path: string; label: unknown };
type Descriptor = Handle;

const makeSurface = () => {
  const handles = new Map<string, Handle>();

  const adapter: LabelKindAdapter<Handle, Descriptor> = {
    buildHandle: (r, label) => ({ id: r.instanceId, path: r.path, label }),
    updateHandle: (handle, label) => {
      handle.label = label;
    },
    toLabel: () => null,
  };

  const bridge: SurfaceBridge<Handle, Descriptor> = {
    surface: "fake",
    sample: "sample-1",
    resolveHandle: (r) => handles.get(r.instanceId),
    refOf: (handle) => ({ path: handle.path, instanceId: handle.id }),
    mount: (descriptor) => {
      handles.set(descriptor.id, descriptor);
      return descriptor;
    },
    unmount: (handle) => {
      handles.delete(handle.id);
    },
    clear: () => {
      handles.clear();
    },
  };

  return { handles, bridge, adapters: { [LabelType.Detections]: adapter } };
};

describe("useSurfaceBridge", () => {
  it("registers on mount, drives the read-half, unregisters on unmount", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const { handles, bridge, adapters } = makeSurface();

    const { result, unmount } = renderHook(() =>
      useSurfaceBridge({ engine, bridge, adapters }),
    );

    expect(handles.has("d1")).toBe(true);

    result.current.setActive([{ path: "ground_truth", instanceId: "d1" }]);
    expect(engine.interaction.isActive(ref("ground_truth", "d1"))).toBe(true);

    unmount();
    engine.createLabel("ground_truth", { label: "bird" });
    expect(handles.size).toBe(1); // no longer reconciling
  });

  it("returns a referentially-stable controller across re-renders", () => {
    const { engine } = makeEngine();
    const { bridge, adapters } = makeSurface();

    const { result, rerender } = renderHook(() =>
      useSurfaceBridge({ engine, bridge, adapters }),
    );
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });
});
