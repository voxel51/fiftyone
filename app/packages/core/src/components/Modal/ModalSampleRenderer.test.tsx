import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalSampleRenderer } from "./ModalSampleRenderer";

const {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getRawComponent,
  getSampleRendererComponent,
  mockDataset,
  mockSchema,
  useCurrentDataset,
  useModalSampleSchema,
  useActivePlugins,
} = vi.hoisted(() => ({
  mockDataset: { name: "dataset" },
  mockSchema: { filepath: { ftype: "StringField" } },
  createSampleRendererRenderContext: vi.fn(),
  getMatchingSampleRenderer: vi.fn(),
  getRawComponent: vi.fn(),
  getSampleRendererComponent: vi.fn(),
  useCurrentDataset: vi.fn(),
  useModalSampleSchema: vi.fn(),
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
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  useModalSampleSchema: (...args: unknown[]) => useModalSampleSchema(...args),
}));

vi.mock("./MetadataLooker", () => ({
  MetadataLooker: ({ sample }: { sample: { sample: { id: string } } }) => (
    <div data-testid="metadata">{sample.sample.id}</div>
  ),
}));

const sample = {
  sample: {
    id: "sample-id",
    filepath: "/tmp/file.pdf",
    media_type: "unknown",
  },
} as any;

const ctx = {
  sample,
  media: {
    field: "filepath",
    path: "/tmp/file.pdf",
    url: "/media/file.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    mediaType: "unknown",
    isNative: false,
  },
  surface: "modal",
  dataset: mockDataset,
  schema: mockSchema,
};

const Renderer = ({ ctx }: { ctx: typeof ctx }) => (
  <div data-testid="renderer">{ctx.media.url}</div>
);

const registration = {
  name: "pdf-renderer",
  component: Renderer,
  sampleRendererOptions: {
    supports: { extensions: ["pdf"] },
  },
};

describe("ModalSampleRenderer", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useCurrentDataset.mockReturnValue(mockDataset);
    useModalSampleSchema.mockReturnValue(mockSchema);
    useActivePlugins.mockReturnValue([registration]);
    createSampleRendererRenderContext.mockReturnValue(ctx);
    getMatchingSampleRenderer.mockReturnValue(registration);
    getRawComponent.mockReturnValue(Renderer);
    getSampleRendererComponent.mockReturnValue(Renderer);
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("renders a matched sample renderer for non-native modal media", () => {
    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    expect(screen.getByTestId("renderer").textContent).toBe("/media/file.pdf");
    expect(screen.queryByTestId("metadata")).toBeNull();
    expect(createSampleRendererRenderContext).toHaveBeenCalledWith(
      sample,
      "filepath",
      mockDataset,
      mockSchema,
      "modal"
    );
  });

  it("falls back to MetadataLooker when no renderer matches", () => {
    getMatchingSampleRenderer.mockReturnValue(null);

    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    expect(screen.getByTestId("metadata").textContent).toBe("sample-id");
    expect(screen.queryByTestId("renderer")).toBeNull();
  });

  it("falls back cleanly when the sample renderer throws", async () => {
    const ThrowingRenderer = () => {
      throw new Error("boom");
    };

    getRawComponent.mockReturnValue(ThrowingRenderer);
    getSampleRendererComponent.mockReturnValue(ThrowingRenderer);

    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    await waitFor(() => {
      expect(screen.getByTestId("metadata").textContent).toBe("sample-id");
    });
    expect(screen.queryByTestId("renderer")).toBeNull();
  });
});
