import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Mcap3dViewSettingsProvider } from "./mcap-3d-view-settings-context";
import {
  McapSceneFramesProvider,
  useRegisterMcapSceneFrameControls,
  type McapSceneFrameControls,
} from "./mcap-scene-frames-context";
import McapSceneWorldSettings from "./McapSceneWorldSettings";

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

  it("hints at adding a 3D panel while no frame controls exist", () => {
    renderWorldSettings();

    expect(
      screen.getByText("Add a 3D panel to choose the world frame."),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "World Frame" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Up Axis" })).toBeTruthy();
  });

  it("edits the scene world frame through the registered 3D controls", () => {
    const updateWorldFrameId = vi.fn();
    renderWorldSettings({
      frameControls: {
        frameIds: ["base_link", "map"],
        updateWorldFrameId,
        worldFrameId: "map",
      },
    });

    const select = screen.getByRole("combobox", {
      name: "World Frame",
    }) as HTMLSelectElement;
    expect(select.value).toBe("map");

    fireEvent.change(select, { target: { value: "base_link" } });

    expect(updateWorldFrameId).toHaveBeenCalledWith("base_link");
  });

  it("edits the scene up axis through the modal view settings", () => {
    const setSceneUpAxis = vi.fn();
    renderWorldSettings({ setSceneUpAxis });

    fireEvent.change(screen.getByRole("combobox", { name: "Up Axis" }), {
      target: { value: "y" },
    });

    expect(setSceneUpAxis).toHaveBeenCalledWith("y");
  });
});
