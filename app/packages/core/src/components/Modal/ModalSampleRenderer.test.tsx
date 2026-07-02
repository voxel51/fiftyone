import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalSampleRenderer } from "./ModalSampleRenderer";

const {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getComponent,
  getSampleRendererComponent,
  mockDataset,
  mockSchema,
  useCurrentDataset,
  useGridCustomRendererFailover,
  useModalSampleSchema,
  useActivePlugins,
} = vi.hoisted(() => ({
  mockDataset: { name: "dataset" },
  mockSchema: { filepath: { ftype: "StringField" } },
  createSampleRendererRenderContext: vi.fn(),
  getMatchingSampleRenderer: vi.fn(),
  getComponent: vi.fn(),
  getSampleRendererComponent: vi.fn(),
  useCurrentDataset: vi.fn(),
  useGridCustomRendererFailover: vi.fn(),
  useModalSampleSchema: vi.fn(),
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
  isSampleRendererModalPersistent: (registration: {
    sampleRendererOptions?: { modal?: { persistAcrossSamples?: boolean } };
  }) =>
    registration?.sampleRendererOptions?.modal?.persistAcrossSamples === true,
  useActivePlugins: (...args: unknown[]) => useActivePlugins(...args),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  useGridCustomRendererFailover: (...args: unknown[]) =>
    useGridCustomRendererFailover(...args),
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

type TestCtx = typeof ctx;

const Renderer = ({ ctx }: { ctx: TestCtx }) => (
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
    useGridCustomRendererFailover.mockReturnValue({
      dismissBanner: vi.fn(),
      failure: null,
      forcedSubscription: null,
      hasAnyFailures: false,
      isBannerVisible: false,
      isDisabled: false,
    });
    useModalSampleSchema.mockReturnValue(mockSchema);
    useActivePlugins.mockReturnValue([registration]);
    createSampleRendererRenderContext.mockReturnValue(ctx);
    getMatchingSampleRenderer.mockReturnValue(registration);
    getComponent.mockReturnValue(Renderer);
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
      "modal",
    );
  });

  it("falls back to MetadataLooker when no renderer matches", () => {
    getMatchingSampleRenderer.mockReturnValue(null);

    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    expect(screen.getByTestId("metadata").textContent).toBe("sample-id");
    expect(screen.queryByTestId("renderer")).toBeNull();
  });

  it("falls back to MetadataLooker when the dataset renderer is fail-open", () => {
    useGridCustomRendererFailover.mockReturnValue({
      dismissBanner: vi.fn(),
      failure: {
        datasetName: mockDataset.name,
        failedAt: Date.now(),
        rendererName: registration.name,
      },
      forcedSubscription: "failopen-1",
      hasAnyFailures: true,
      isBannerVisible: true,
      isDisabled: true,
    });

    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    expect(screen.getByTestId("metadata").textContent).toBe("sample-id");
    expect(screen.queryByTestId("renderer")).toBeNull();
    expect(getMatchingSampleRenderer).not.toHaveBeenCalled();
  });

  it("falls back cleanly when the sample renderer throws", async () => {
    const ThrowingRenderer = () => {
      throw new Error("boom");
    };

    getComponent.mockReturnValue(ThrowingRenderer);
    getSampleRendererComponent.mockReturnValue(ThrowingRenderer);

    render(<ModalSampleRenderer sample={sample} modalMediaField="filepath" />);

    await waitFor(() => {
      expect(screen.getByTestId("metadata").textContent).toBe("sample-id");
    });
    expect(screen.queryByTestId("renderer")).toBeNull();
  });

  it("remounts a non-persistent renderer when the sample changes", () => {
    const mountSpy = vi.fn();
    const TrackedRenderer = ({ ctx }: { ctx: TestCtx }) => {
      React.useEffect(() => mountSpy(), []);
      return <div data-testid="renderer">{ctx.sample.sample.id}</div>;
    };
    getComponent.mockReturnValue(TrackedRenderer);
    getSampleRendererComponent.mockReturnValue(TrackedRenderer);
    createSampleRendererRenderContext.mockImplementation(
      (nextSample: typeof sample) => ({ ...ctx, sample: nextSample }),
    );

    const { rerender } = render(
      <ModalSampleRenderer sample={sample} modalMediaField="filepath" />,
    );
    rerender(
      <ModalSampleRenderer
        sample={sampleWithId("sample-b")}
        modalMediaField="filepath"
      />,
    );

    expect(screen.getByTestId("renderer").textContent).toBe("sample-b");
    expect(mountSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps a persistent renderer mounted across sample navigation", () => {
    const mountSpy = vi.fn();
    const TrackedRenderer = ({ ctx }: { ctx: TestCtx }) => {
      React.useEffect(() => mountSpy(), []);
      return <div data-testid="renderer">{ctx.sample.sample.id}</div>;
    };
    usePersistentRegistration(TrackedRenderer);
    createSampleRendererRenderContext.mockImplementation(
      (nextSample: typeof sample) => ({ ...ctx, sample: nextSample }),
    );

    const { rerender } = render(
      <ModalSampleRenderer sample={sample} modalMediaField="filepath" />,
    );
    rerender(
      <ModalSampleRenderer
        sample={sampleWithId("sample-b")}
        modalMediaField="filepath"
      />,
    );

    expect(screen.getByTestId("renderer").textContent).toBe("sample-b");
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it("gives the next sample a fresh chance after a persistent renderer error", async () => {
    const FlakyRenderer = ({ ctx }: { ctx: TestCtx }) => {
      if (ctx.sample.sample.id === "sample-bad") {
        throw new Error("boom");
      }
      return <div data-testid="renderer">{ctx.sample.sample.id}</div>;
    };
    usePersistentRegistration(FlakyRenderer);
    createSampleRendererRenderContext.mockImplementation(
      (nextSample: typeof sample) => ({ ...ctx, sample: nextSample }),
    );

    const { rerender } = render(
      <ModalSampleRenderer
        sample={sampleWithId("sample-bad")}
        modalMediaField="filepath"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("metadata").textContent).toBe("sample-bad");
    });

    rerender(
      <ModalSampleRenderer
        sample={sampleWithId("sample-good")}
        modalMediaField="filepath"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("renderer").textContent).toBe("sample-good");
    });
    expect(screen.queryByTestId("metadata")).toBeNull();
  });
});

function sampleWithId(id: string) {
  return { sample: { ...sample.sample, id } } as typeof sample;
}

function usePersistentRegistration(
  component: React.FunctionComponent<{ ctx: TestCtx }>,
) {
  const persistentRegistration = {
    ...registration,
    component,
    sampleRendererOptions: {
      ...registration.sampleRendererOptions,
      modal: { persistAcrossSamples: true },
    },
  };
  useActivePlugins.mockReturnValue([persistentRegistration]);
  getMatchingSampleRenderer.mockReturnValue(persistentRegistration);
  getComponent.mockReturnValue(component);
  getSampleRendererComponent.mockReturnValue(component);
}
