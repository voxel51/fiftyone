import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { Episode3dViewSettingsProvider } from "../../spatial/view-settings-context";
import {
  EpisodeSceneFramesProvider,
  useRegisterEpisodeSceneFrameControls,
  type EpisodeSceneFrameControls,
} from "../../spatial/frame-transforms/scene-frame-controls";
import EpisodeSceneWorldSettings from "./SceneWorldSettings";

function expandWorldGroup() {
  fireEvent.click(screen.getByRole("button", { name: /World/ }));
}

afterEach(() => cleanup());

function RegisterFrameControls({
  controls,
}: {
  readonly controls: EpisodeSceneFrameControls;
}) {
  useRegisterEpisodeSceneFrameControls("3d-1", controls);
  return null;
}

function renderWorldSettings({
  frameControls,
  setSceneUpAxis = vi.fn(),
}: {
  readonly frameControls?: EpisodeSceneFrameControls;
  readonly setSceneUpAxis?: Mock<
    ComponentProps<typeof Episode3dViewSettingsProvider>["setSceneUpAxis"]
  >;
} = {}) {
  render(
    <Episode3dViewSettingsProvider
      defaultTrackingMode="free"
      preferredCameraTargetFrameId={null}
      preferredWorldFrameId={null}
      sceneUpAxis="z"
      setDefaultTrackingMode={vi.fn()}
      setPreferredCameraTargetFrameId={vi.fn()}
      setPreferredWorldFrameId={vi.fn()}
      setSceneUpAxis={setSceneUpAxis}
    >
      <EpisodeSceneFramesProvider>
        {frameControls ? (
          <RegisterFrameControls controls={frameControls} />
        ) : null}
        <EpisodeSceneWorldSettings />
      </EpisodeSceneFramesProvider>
    </Episode3dViewSettingsProvider>,
  );
}

describe("EpisodeSceneWorldSettings", () => {
  it("renders nothing without a view-settings provider", () => {
    const { container } = render(<EpisodeSceneWorldSettings />);

    expect(container.firstChild).toBeNull();
  });

  it("starts collapsed and summarizes the world selection", () => {
    renderWorldSettings({
      frameControls: {
        activeComponentFrameIds: ["base_link", "map"],
        authorityTileId: "tile-1",
        frameIds: ["base_link", "map"],
        omittedFrameIds: [],
        omittedSourceIds: [],
        referenceTransition: null,
        updateWorldFrameId: vi.fn(),
        useRecommendedWorldFrame: vi.fn(),
        worldFrameId: "map",
        worldFrameSelectionSource: "auto-stable",
      },
    });

    expect(screen.getByText("map · up Z")).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: /^Reference Frame/ }),
    ).toBeNull();
  });

  it("hints at adding a 3D panel while no frame controls exist", () => {
    renderWorldSettings();
    expandWorldGroup();

    expect(
      screen.getByText("Add a 3D panel to choose the reference frame."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: /^Reference Frame/ }),
    ).toBeNull();
    // Up axis renders as a radio group: every option stays visible.
    expect(screen.getByRole("radio", { name: "Z" })).toBeTruthy();
  });

  it("edits the scene world frame through the registered 3D controls", () => {
    const updateWorldFrameId = vi.fn();
    renderWorldSettings({
      frameControls: {
        activeComponentFrameIds: ["base_link", "map"],
        authorityTileId: "tile-1",
        frameIds: ["base_link", "map"],
        omittedFrameIds: [],
        omittedSourceIds: [],
        referenceTransition: null,
        updateWorldFrameId,
        useRecommendedWorldFrame: vi.fn(),
        worldFrameId: "map",
        worldFrameSelectionSource: "auto-stable",
      },
    });

    expandWorldGroup();
    const select = screen.getByRole("combobox", { name: /^Reference Frame/ });

    fireEvent.focus(select);
    fireEvent.change(select, { target: { value: "base_link" } });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "Enter" });

    expect(updateWorldFrameId).toHaveBeenCalledWith("base_link");
  });

  it("lets an explicit reference return to the deterministic recommendation", () => {
    const useRecommendedWorldFrame = vi.fn();
    renderWorldSettings({
      frameControls: {
        activeComponentFrameIds: ["base_link", "map"],
        authorityTileId: "tile-1",
        frameIds: ["base_link", "map"],
        omittedFrameIds: [],
        omittedSourceIds: [],
        referenceTransition: null,
        updateWorldFrameId: vi.fn(),
        useRecommendedWorldFrame,
        worldFrameId: "base_link",
        worldFrameSelectionSource: "user",
      },
    });

    expandWorldGroup();
    fireEvent.click(
      screen.getByRole("button", { name: "Use recommended frame" }),
    );
    expect(useRecommendedWorldFrame).toHaveBeenCalledTimes(1);
  });

  it("edits the scene up axis through the modal view settings", () => {
    const setSceneUpAxis = vi.fn();
    renderWorldSettings({ setSceneUpAxis });

    expandWorldGroup();
    fireEvent.click(screen.getByRole("radio", { name: "Y" }));

    expect(setSceneUpAxis).toHaveBeenCalledWith("y");
  });
});
