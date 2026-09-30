import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LookerPreview from "./LookerPreview";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  destroy: vi.fn(),
  resize: vi.fn(),
  updateOptions: vi.fn(),
  options: { activePaths: ["ground_truth"] },
  mediaField: "filepath",
}));
const createLooker = vi.hoisted(() => ({ current: vi.fn(() => mocks) }));

vi.mock("@fiftyone/state", () => ({
  useLookerOptions: () => mocks.options,
  useSelectedMediaFieldGrid: () => mocks.mediaField,
  useCreateLooker: () => createLooker,
}));

const node = {
  id: "scene",
  sample: { _id: "scene", filepath: "/scene.fo3d" },
  urls: [{ field: "filepath", url: "/scene.fo3d" }],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.options = { activePaths: ["ground_truth"] };
  mocks.mediaField = "filepath";
});

describe("LookerPreview", () => {
  it("keeps grid overlays, disables interaction, and releases the looker", () => {
    const { container, unmount } = render(
      <LookerPreview node={node} width={106} />,
    );
    expect(createLooker.current).toHaveBeenCalledWith(
      expect.objectContaining(node),
    );
    expect(mocks.attach).toHaveBeenCalledWith(container.firstChild);
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(true);
    expect(mocks.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        activePaths: ["ground_truth"],
        selected: false,
        inSelectionMode: false,
        shouldHandleKeyEvents: false,
      }),
    );
    expect(mocks.resize).toHaveBeenCalledWith([106, 106]);
    unmount();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("updates labels and size without recreating the looker", () => {
    const { rerender } = render(<LookerPreview node={node} width={106} />);
    mocks.options = { activePaths: [] };
    rerender(<LookerPreview node={node} width={208} />);
    expect(createLooker.current).toHaveBeenCalledOnce();
    expect(mocks.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ activePaths: [] }),
    );
    expect(mocks.resize).toHaveBeenLastCalledWith([208, 106]);
  });

  it("replaces the looker when the selected media field changes", () => {
    const { rerender } = render(<LookerPreview node={node} width={106} />);
    mocks.mediaField = "thumbnail";
    rerender(<LookerPreview node={node} width={106} />);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(createLooker.current).toHaveBeenCalledTimes(2);
  });
});
