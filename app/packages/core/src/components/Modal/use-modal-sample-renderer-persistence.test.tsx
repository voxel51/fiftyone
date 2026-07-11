import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useModalSampleRendererPersistenceKey,
  useRetainedModalSample,
} from "./use-modal-sample-renderer-persistence";

const harness = vi.hoisted(() => ({
  loadable: {
    contents: null as unknown,
    state: "hasValue" as "hasValue" | "loading" | "hasError",
    valueOrThrow: vi.fn(),
  },
}));

const registration = {
  name: "McapRenderer",
  sampleRendererOptions: { modal: { persistAcrossSamples: true } },
};

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  createSampleRendererRenderContext: () => ({ media: { url: "/a.mcap" } }),
  getComponent: () => () => null,
  getMatchingSampleRenderer: () => registration,
  isSampleRendererModalPersistent: () => true,
  useActivePlugins: () => [registration],
}));

vi.mock("@fiftyone/state", () => ({
  modalSample: "modal-sample",
  selectedMediaField: () => "selected-media-field",
  useCurrentDataset: () => ({ name: "dataset" }),
  useGridCustomRendererFailover: () => ({ isDisabled: false }),
  useModalSampleSchema: () => ({}),
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => "filepath",
  useRecoilValueLoadable: () => harness.loadable,
}));

describe("useModalSampleRendererPersistenceKey", () => {
  beforeEach(() => {
    harness.loadable = {
      contents: { sample: { id: "sample-a" } },
      state: "hasValue",
      valueOrThrow: vi.fn(() => ({ sample: { id: "sample-a" } })),
    };
  });

  afterEach(cleanup);

  it("retains the persistent renderer key while the target sample loads", () => {
    const { rerender, result } = renderHook(() =>
      useModalSampleRendererPersistenceKey(),
    );
    expect(result.current).toBe("renderer-McapRenderer");

    harness.loadable = {
      contents: Promise.resolve({ sample: { id: "sample-b" } }),
      state: "loading",
      valueOrThrow: vi.fn(),
    };
    rerender();

    expect(result.current).toBe("renderer-McapRenderer");
  });

  it("retains the settled sample and reports a persistent transition", () => {
    const sampleA = { sample: { id: "sample-a" } };
    harness.loadable = {
      contents: sampleA,
      state: "hasValue",
      valueOrThrow: vi.fn(() => sampleA),
    };
    const { rerender, result } = renderHook(() => useRetainedModalSample());
    expect(result.current).toEqual({
      persistenceKey: "renderer-McapRenderer",
      sample: sampleA,
      transitioning: false,
    });

    harness.loadable = {
      contents: new Promise(() => undefined),
      state: "loading",
      valueOrThrow: vi.fn(() => {
        throw new Error("persistent renderers must not suspend here");
      }),
    };
    rerender();

    expect(result.current).toEqual({
      persistenceKey: "renderer-McapRenderer",
      sample: sampleA,
      transitioning: true,
    });
  });
});
