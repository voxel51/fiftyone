import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalSamplePending } from "./ModalSamplePending";

const state = vi.hoisted(() => ({
  disabled: false,
  rendererLoading: true,
  sampleId: "a",
}));
vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: () => ({ datasetId: "dataset", name: "dataset" }),
  useNullableModalSampleId: () => state.sampleId,
  useSelectedMediaFieldModal: () => "filepath",
  useGridCustomRendererFailover: () => ({ isDisabled: state.disabled }),
}));
vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  useActivePlugins: () => [
    {
      name: "episode",
      sampleRendererOptions: {
        modal: state.rendererLoading
          ? {
              loadingComponent: ({ sampleId }: { sampleId: string }) => (
                <div>{sampleId}</div>
              ),
            }
          : {},
      },
    },
  ],
}));
afterEach(() => {
  cleanup();
  state.disabled = false;
  state.rendererLoading = true;
  state.sampleId = "a";
});

describe("pending modal sample", () => {
  it("reads the selected destination without requiring the sample query", () => {
    const { rerender } = render(<ModalSamplePending fallback={null} />);
    expect(screen.getByText("a")).toBeTruthy();
    state.sampleId = "b";
    rerender(<ModalSamplePending fallback={null} />);
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.queryByText("a")).toBeNull();
  });
  it("respects renderer failover", () => {
    state.disabled = true;
    render(<ModalSamplePending fallback="Pixelating..." />);
    expect(screen.getByText("Pixelating...")).toBeTruthy();
  });
  it("keeps the caller's fallback for renderers without loading UI", () => {
    state.rendererLoading = false;
    const { container } = render(<ModalSamplePending fallback={null} />);
    expect(container.textContent).toBe("");
  });
});
