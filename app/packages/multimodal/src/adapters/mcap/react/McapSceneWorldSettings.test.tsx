import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Mcap3dViewSettingsProvider } from "./mcap-3d-view-settings-context";
import {
  McapSceneFramesProvider,
  useRegisterMcapSceneFrameControls,
  type McapSceneFrameControls,
} from "./mcap-scene-frames-context";
import McapSceneWorldSettings from "./McapSceneWorldSettings";

function expandWorldGroup() {
  fireEvent.click(screen.getByRole("button", { name: /World/ }));
}

afterEach(() => cleanup());

function RegisterFrameControls({
  controls,
}: {
  readonly controls: McapSceneFrameControls;
}) {
  useRegisterMcapSceneFrameControls("3d-1", controls);
  return null;
}

function renderWorldSettings({
  frameControls,
  setSceneUpAxis = vi.fn(),
}: {
  readonly frameControls?: McapSceneFrameControls;
  readonly setSceneUpAxis?: ReturnType<typeof vi.fn>;
} = {}) {
  render(
    <Mcap3dViewSettingsProvider
      defaultTrackingMode="free"
      preferredCameraTargetFrameId={null}
      preferredWorldFrameId={null}
      sceneUpAxis="z"
      setDefaultTrackingMode={vi.fn()}
      setPreferredCameraTargetFrameId={vi.fn()}
      setPreferredWorldFrameId={vi.fn()}
      setSceneUpAxis={setSceneUpAxis}
    >
      <McapSceneFramesProvider>
        {frameControls ? (
          <RegisterFrameControls controls={frameControls} />
        ) : null}
        <McapSceneWorldSettings />
      </McapSceneFramesProvider>
    </Mcap3dViewSettingsProvider>,
  );
}

describe("McapSceneWorldSettings", () => {
  it("renders nothing without a view-settings provider", () => {
    const { container } = render(<McapSceneWorldSettings />);

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
