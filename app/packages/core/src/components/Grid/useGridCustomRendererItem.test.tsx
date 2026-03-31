import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridCustomRendererItem } from "./GridCustomRendererItem";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";

const {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getComponent,
  getSampleRendererComponent,
  isGridCustomRendererFailOpen,
  mockDataset,
  mockSelectedMediaField,
  mockSchema,
  trackEvent,
  useGridCustomRendererFailover,
  useCurrentDataset,
  useSampleSchema,
  useSelectedMediaFieldGrid,
  useActivePlugins,
} = vi.hoisted(() => ({
  mockDataset: { name: "dataset" },
  mockSchema: { filepath: { ftype: "StringField" } },
  mockSelectedMediaField: "filepath",
  createSampleRendererRenderContext: vi.fn(),
  getMatchingSampleRenderer: vi.fn(),
  getComponent: vi.fn(),
  getSampleRendererComponent: vi.fn(),
  isGridCustomRendererFailOpen: vi.fn(),
  trackEvent: vi.fn(),
  useCurrentDataset: vi.fn(),
  useGridCustomRendererFailover: vi.fn(),
  useSampleSchema: vi.fn(),
  useSelectedMediaFieldGrid: vi.fn(),
  useActivePlugins: vi.fn(),
}));

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  createSampleRendererRenderContext: (...args: unknown[]) =>
    createSampleRendererRenderContext(...args),
  getMatchingSampleRenderer: (...args: unknown[]) =>
    getMatchingSampleRenderer(...args),
  getComponent: (...args: unknown[]) => getComponent(...args),
  getSampleRendererComponent: (...args: unknown[]) =>
    getSampleRendererComponent(...args),
  useActivePlugins: (...args: unknown[]) => useActivePlugins(...args),
}));

vi.mock("@fiftyone/state", () => ({
  isGridCustomRendererFailOpen: (...args: unknown[]) =>
    isGridCustomRendererFailOpen(...args),
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  useGridCustomRendererFailover: (...args: unknown[]) =>
    useGridCustomRendererFailover(...args),
  useSampleSchema: (...args: unknown[]) => useSampleSchema(...args),
  useSelectedMediaFieldGrid: (...args: unknown[]) =>
    useSelectedMediaFieldGrid(...args),
}));

vi.mock("@fiftyone/analytics", () => ({
  useTrackEvent: () => trackEvent,
}));

vi.mock("recoil", () => ({
  useRecoilBridgeAcrossReactRoots_UNSTABLE: vi.fn(
    () =>
      ({ children }: React.PropsWithChildren) =>
        <>{children}</>
  ),
}));

const Renderer = ({ ctx }: { ctx: { media: { url: string | null } } }) => (
  <div>{ctx.media.url}</div>
);

const registration = {
  name: "pdf-renderer",
  component: Renderer,
  sampleRendererOptions: {
    supports: { extensions: ["pdf"] },
    grid: { enabled: true },
  },
};

const ctx = {
  sample: { sample: { id: "sample-id", filepath: "/tmp/file.pdf" } },
  media: {
    field: "filepath",
    path: "/tmp/file.pdf",
    url: "/media/file.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    mediaType: "unknown",
    isNative: false,
  },
  surface: "grid",
  dataset: mockDataset,
  schema: mockSchema,
};

const sampleResult = {
  sample: {
    id: "sample-id",
    filepath: "/tmp/file.pdf",
  },
} as any;

describe("useGridCustomRendererItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentDataset.mockReturnValue(mockDataset);
    useGridCustomRendererFailover.mockReturnValue({
      dismissBanner: vi.fn(),
      failure: null,
      hasAnyFailures: false,
      isBannerVisible: false,
      isDisabled: false,
    });
    useSampleSchema.mockReturnValue(mockSchema);
    useSelectedMediaFieldGrid.mockReturnValue(mockSelectedMediaField);
    createSampleRendererRenderContext.mockReturnValue(ctx);
    getMatchingSampleRenderer.mockReturnValue(registration);
    getComponent.mockReturnValue(Renderer);
    getSampleRendererComponent.mockReturnValue(Renderer);
    isGridCustomRendererFailOpen.mockReturnValue(false);
    useActivePlugins.mockReturnValue([registration]);
  });

  it("creates a grid sample renderer item when a renderer matches", () => {
    const createDefaultLooker = {
      current: vi.fn(() => ({
        addEventListener: vi.fn(),
        attach: vi.fn(),
      })),
    } as any;
    const { result } = renderHook(() =>
      useGridCustomRendererItem(createDefaultLooker)
    );

    const looker = result.current.createItem(
      sampleResult,
      { description: "sample-id" } as any,
      12
    );

    expect(looker).toBeInstanceOf(GridCustomRendererItem);
    expect(createDefaultLooker.current).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("grid_custom_renderer_used");
  });

  it("stays on the default path when no sample renderer matches", () => {
    const fallbackLooker = {
      addEventListener: vi.fn(),
      attach: vi.fn(),
    };
    const createDefaultLooker = {
      current: vi.fn(() => fallbackLooker),
    } as any;
    const { result } = renderHook(() =>
      useGridCustomRendererItem(createDefaultLooker)
    );
    const symbol = { description: "sample-id" } as any;

    getMatchingSampleRenderer.mockReturnValue(null);

    const looker = result.current.createItem(sampleResult, symbol, 12);

    expect(looker).toBe(fallbackLooker);
    expect(createDefaultLooker.current).toHaveBeenCalledWith(
      expect.objectContaining({
        sample: sampleResult.sample,
        symbol,
      }),
      { fontSize: 12 }
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("stays on the default path when the dataset renderer is fail-open", () => {
    const fallbackLooker = {
      addEventListener: vi.fn(),
      attach: vi.fn(),
    };
    const createDefaultLooker = {
      current: vi.fn(() => fallbackLooker),
    } as any;
    useGridCustomRendererFailover.mockReturnValue({
      dismissBanner: vi.fn(),
      failure: {
        datasetName: mockDataset.name,
        failedAt: Date.now(),
        rendererName: registration.name,
      },
      hasAnyFailures: true,
      isBannerVisible: true,
      isDisabled: true,
    });
    const { result } = renderHook(() =>
      useGridCustomRendererItem(createDefaultLooker)
    );
    const symbol = { description: "sample-id" } as any;

    const looker = result.current.createItem(sampleResult, symbol, 12);

    expect(looker).toBe(fallbackLooker);
    expect(createSampleRendererRenderContext).not.toHaveBeenCalled();
    expect(createDefaultLooker.current).toHaveBeenCalledWith(
      expect.objectContaining({
        sample: sampleResult.sample,
        symbol,
      }),
      { fontSize: 12 }
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
