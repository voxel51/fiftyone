import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalSamplePending } from "./ModalSamplePending";

const state = vi.hoisted(() => ({ sampleId: "a", disabled: false }));
vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: () => ({ datasetId: "dataset", name: "dataset" }),
  useNullableModalSampleId: () => state.sampleId,
  useSelectedMediaFieldModal: () => "filepath",
  useGridCustomRendererFailover: () => ({ isDisabled: state.disabled }),
}));
vi.mock("@fiftyone/components", () => ({
  Loading: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  useActivePlugins: () => [
    {
      name: "episode",
      sampleRendererOptions: {
        modal: {
          loadingComponent: ({ sampleId }: { sampleId: string }) => (
            <div>{sampleId}</div>
          ),
        },
      },
    },
  ],
}));
afterEach(() => {
  cleanup();
  state.disabled = false;
  state.sampleId = "a";
});

describe("pending modal sample", () => {
  it("reads the selected destination without requiring the sample query", () => {
    const { rerender } = render(<ModalSamplePending />);
    expect(screen.getByText("a")).toBeTruthy();
    state.sampleId = "b";
    rerender(<ModalSamplePending />);
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.queryByText("a")).toBeNull();
  });
  it("respects renderer failover", () => {
    state.disabled = true;
    render(<ModalSamplePending />);
    expect(screen.getByText("Pixelating...")).toBeTruthy();
  });
});
