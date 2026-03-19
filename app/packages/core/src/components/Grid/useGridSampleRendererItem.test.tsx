import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridSampleRendererItem } from "./GridSampleRendererItem";
import { useGridSampleRendererItem } from "./useGridSampleRendererItem";

const {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getComponent,
  getSampleRendererComponent,
  mockDataset,
  mockSelectedMediaField,
  mockSchema,
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
  useCurrentDataset: vi.fn(),
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
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  useSampleSchema: (...args: unknown[]) => useSampleSchema(...args),
  useSelectedMediaFieldGrid: (...args: unknown[]) =>
    useSelectedMediaFieldGrid(...args),
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

describe("useGridSampleRendererItem", () => {
  beforeEach(() => {
    useCurrentDataset.mockReturnValue(mockDataset);
    useSampleSchema.mockReturnValue(mockSchema);
    useSelectedMediaFieldGrid.mockReturnValue(mockSelectedMediaField);
    createSampleRendererRenderContext.mockReturnValue(ctx);
    getMatchingSampleRenderer.mockReturnValue(registration);
    getComponent.mockReturnValue(Renderer);
    getSampleRendererComponent.mockReturnValue(Renderer);
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
      useGridSampleRendererItem(createDefaultLooker)
    );

    const item = result.current.current.createItem(
      sampleResult,
      { description: "sample-id" } as any,
      12
    );

    expect(item).toBeInstanceOf(GridSampleRendererItem);
    expect(createDefaultLooker.current).not.toHaveBeenCalled();
  });

  it("stays on the default path when no sample renderer matches", () => {
    const fallbackItem = {
      addEventListener: vi.fn(),
      attach: vi.fn(),
    };
    const createDefaultItem = {
      current: vi.fn(() => fallbackItem),
    } as any;
    const { result } = renderHook(() =>
      useGridSampleRendererItem(createDefaultItem)
    );
    const symbol = { description: "sample-id" } as any;

    getMatchingSampleRenderer.mockReturnValue(null);

    const looker = result.current.current.createItem(sampleResult, symbol, 12);

    expect(looker).toBe(fallbackItem);
    expect(createDefaultItem.current).toHaveBeenCalledWith(
      expect.objectContaining({
        sample: sampleResult.sample,
        symbol,
      }),
      { fontSize: 12 }
    );
  });
});
