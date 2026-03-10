import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridSampleRendererItem } from "./GridSampleRendererItem";
import { useGridSampleRendererItem } from "./useGridSampleRendererItem";

const {
  createSampleRendererRenderContext,
  datasetToken,
  getMatchingSampleRenderer,
  getRawComponent,
  getSampleRendererComponent,
  mockDataset,
  mockSchema,
  mockSelectedMediaField,
  schemaToken,
  selectedMediaFieldToken,
  useActivePlugins,
} = vi.hoisted(() => ({
  datasetToken: Symbol("dataset"),
  schemaToken: Symbol("schema"),
  selectedMediaFieldToken: Symbol("selectedMediaField"),
  mockDataset: { name: "dataset" },
  mockSchema: { filepath: { ftype: "StringField" } },
  mockSelectedMediaField: "filepath",
  createSampleRendererRenderContext: vi.fn(),
  getMatchingSampleRenderer: vi.fn(),
  getRawComponent: vi.fn(),
  getSampleRendererComponent: vi.fn(),
  useActivePlugins: vi.fn(),
}));

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  createSampleRendererRenderContext: (...args: unknown[]) =>
    createSampleRendererRenderContext(...args),
  getMatchingSampleRenderer: (...args: unknown[]) =>
    getMatchingSampleRenderer(...args),
  getRawComponent: (...args: unknown[]) => getRawComponent(...args),
  getSampleRendererComponent: (...args: unknown[]) =>
    getSampleRendererComponent(...args),
  useActivePlugins: (...args: unknown[]) => useActivePlugins(...args),
}));

vi.mock("@fiftyone/state", () => ({
  dataset: datasetToken,
  State: { SPACE: { SAMPLE: "sample" } },
  fieldSchema: vi.fn(() => schemaToken),
  selectedMediaField: vi.fn(() => selectedMediaFieldToken),
}));

vi.mock("recoil", () => ({
  useRecoilBridgeAcrossReactRoots_UNSTABLE: vi.fn(
    () =>
      ({ children }: React.PropsWithChildren) =>
        <>{children}</>
  ),
  useRecoilValue: vi.fn((selector) => {
    if (selector === datasetToken) {
      return mockDataset;
    }

    if (selector === schemaToken) {
      return mockSchema;
    }

    return mockSelectedMediaField;
  }),
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
    createSampleRendererRenderContext.mockReturnValue(ctx);
    getMatchingSampleRenderer.mockReturnValue(registration);
    getRawComponent.mockReturnValue(Renderer);
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

    expect(result.current.shouldOverrideRender(sampleResult)).toBe(true);

    const looker = result.current.createItemWithSampleRenderer(
      sampleResult,
      { description: "sample-id" } as any,
      12
    );

    expect(looker).toBeInstanceOf(GridSampleRendererItem);
  });

  it("stays on the default path when no sample renderer matches", () => {
    const createDefaultLooker = {
      current: vi.fn(),
    } as any;
    const { result } = renderHook(() =>
      useGridSampleRendererItem(createDefaultLooker)
    );

    getMatchingSampleRenderer.mockReturnValue(null);

    expect(result.current.shouldOverrideRender(sampleResult)).toBe(false);
    expect(() =>
      result.current.createItemWithSampleRenderer(
        sampleResult,
        { description: "sample-id" } as any,
        12
      )
    ).toThrow("matching sample renderer");
  });
});
