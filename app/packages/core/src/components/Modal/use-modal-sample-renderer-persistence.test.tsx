import { cleanup, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useModalSampleRendererPersistenceKey,
  useRetainedModalSample,
} from "./use-modal-sample-renderer-persistence";

const { harness, registration } = vi.hoisted(() => ({
  harness: {
    loadable: {
      contents: null as unknown,
      getValue: vi.fn(),
      state: "hasValue" as "hasValue" | "loading" | "hasError",
    },
  },
  registration: {
    name: "McapRenderer",
    sampleRendererOptions: { modal: { persistAcrossSamples: true } },
  },
}));

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  createSampleRendererRenderContext: () => ({ media: { url: "/a.mcap" } }),
  getComponent: () => () => null,
  getMatchingSampleRenderer: () => registration,
  hasSampleRendererSource: (media: {
    mediaReference?: unknown;
    url?: string | null;
  }) => Boolean(media.url || media.mediaReference),
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
      getValue: vi.fn(() => ({ sample: { id: "sample-a" } })),
      state: "hasValue",
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
      getValue: vi.fn(),
      state: "loading",
    };
    rerender();

    expect(result.current).toBe("renderer-McapRenderer");
  });

  it("retains the settled sample and reports a persistent transition", () => {
    const sampleA = { sample: { id: "sample-a" } };
    harness.loadable = {
      contents: sampleA,
      getValue: vi.fn(() => sampleA),
      state: "hasValue",
    };
    const { rerender, result } = renderHook(() => useRetainedModalSample());
    expect(result.current).toEqual({
      persistenceKey: "renderer-McapRenderer",
      sample: sampleA,
      transitioning: false,
    });

    harness.loadable = {
      contents: new Promise(() => undefined),
      getValue: vi.fn(() => {
        throw new Error("persistent renderers must not suspend here");
      }),
      state: "loading",
    };
    rerender();

    expect(result.current).toEqual({
      persistenceKey: "renderer-McapRenderer",
      sample: sampleA,
      transitioning: true,
    });
  });

  it("suspends while the first modal sample resolves", () => {
    const pending = new Promise(() => undefined);
    harness.loadable = {
      contents: pending,
      getValue: vi.fn(() => {
        throw pending;
      }),
      state: "loading",
    };

    render(
      <React.Suspense fallback={<div data-testid="fallback" />}>
        <RetainedSampleProbe />
      </React.Suspense>,
    );

    expect(screen.getByTestId("fallback")).toBeTruthy();
  });
});

function RetainedSampleProbe() {
  useRetainedModalSample();
  return <div data-testid="sample" />;
}
