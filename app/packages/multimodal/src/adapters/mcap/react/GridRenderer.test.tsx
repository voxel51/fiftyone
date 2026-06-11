import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridRenderer } from "./GridRenderer";

const previewHarness = vi.hoisted(() => ({
  preview: {
    error: null,
    frame: null,
    hasImageTopics: false,
    imageTopic: null,
    pause: vi.fn(),
    play: vi.fn(),
    status: "idle",
  },
}));

vi.mock("./use-stable-mcap-source", () => ({
  useStableMcapSource: vi.fn(() => null),
}));

vi.mock("./use-mcap-grid-preview", () => ({
  useMcapGridPreview: vi.fn(() => previewHarness.preview),
}));

vi.mock("../../../visualization/panels/ImageAnnotationsOverlay", () => ({
  ImageAnnotationsOverlay: () => <div data-testid="annotations-overlay" />,
}));

vi.mock("../../../visualization/panels/image", () => ({
  ImagePanel: () => <div data-testid="image-panel" />,
}));

afterEach(() => {
  cleanup();
});

describe("GridRenderer", () => {
  it("shows idle as an empty no-source state without loading animation", () => {
    previewHarness.preview.status = "idle";
    previewHarness.preview.hasImageTopics = false;

    render(<GridRenderer ctx={{} as never} />);

    expect(screen.getByText("No camera streams")).toBeTruthy();
    expect(screen.queryByTestId("mcap-loading-ascii")).toBeNull();
  });
});
