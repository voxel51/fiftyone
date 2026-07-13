import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import McapViewpointSettings from "./McapViewpointSettings";
import {
  Mcap3dViewpointProvider,
  type Mcap3dViewpointController,
  useRegisterMcap3dViewpoint,
} from "./mcap-3d-viewpoint-context";
import { createMcap3dViewpointStore } from "./mcap-3d-viewpoint";

afterEach(() => cleanup());

describe("McapViewpointSettings", () => {
  it("starts collapsed and summarizes the live orbit", () => {
    renderSettings(createController());

    expect(screen.getByText(/Az 90° · El 45° · 14\.1 m/)).toBeTruthy();
    expect(screen.queryByLabelText("Azimuth (°)")).toBeNull();
  });

  it("edits position, target, orbit, and projection through the live controller", () => {
    const controller = createController();
    renderSettings(controller);
    fireEvent.click(screen.getByRole("button", { name: /Viewpoint/ }));

    expect(
      screen.getByRole("img", {
        name: /Relative preserves azimuth, elevation, and distance/,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("radio", { name: "Absolute coordinates" }),
    );
    expect(controller.setCameraNavigationMode).toHaveBeenCalledWith("absolute");

    const positionX = screen.getByLabelText("Position X");
    fireEvent.focus(positionX);
    fireEvent.change(positionX, { target: { value: "5" } });
    fireEvent.blur(positionX);
    expect(vi.mocked(controller.setPose)).toHaveBeenLastCalledWith({
      position: [5, 10, 10],
      target: [0, 0, 0],
    });
    expect(inputValue("Distance")).toBe("15");

    const targetX = screen.getByLabelText("Target X");
    fireEvent.focus(targetX);
    fireEvent.change(targetX, { target: { value: "5" } });
    fireEvent.blur(targetX);
    const editedPose = vi.mocked(controller.setPose).mock.lastCall?.[0];
    expect(editedPose?.target).toEqual([5, 0, 0]);
    expect(editedPose?.position[0]).toBeCloseTo(10);
    expect(editedPose?.position[1]).toBeCloseTo(10);
    expect(editedPose?.position[2]).toBeCloseTo(10);

    const azimuth = screen.getByLabelText("Azimuth (°)");
    fireEvent.focus(azimuth);
    fireEvent.change(azimuth, { target: { value: "0" } });
    fireEvent.blur(azimuth);
    const orbitEditedPose = vi.mocked(controller.setPose).mock.lastCall?.[0];
    expect(orbitEditedPose?.target).toEqual([5, 0, 0]);
    expect(orbitEditedPose?.position[0]).toBeCloseTo(16.18034);
    expect(orbitEditedPose?.position[1]).toBeCloseTo(0);
    expect(orbitEditedPose?.position[2]).toBeCloseTo(10);

    const fov = screen.getByLabelText("FOV (°)");
    fireEvent.focus(fov);
    fireEvent.change(fov, { target: { value: "70" } });
    fireEvent.blur(fov);
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 10000,
      fovDegrees: 70,
      near: 0.01,
    });

    fireEvent.focus(fov);
    fireEvent.change(fov, { target: { value: "200" } });
    fireEvent.blur(fov);
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 10000,
      fovDegrees: 150,
      near: 0.01,
    });
  });

  it("updates position and orbit immediately when the live camera moves", () => {
    const controller = createController();
    renderSettings(controller);
    fireEvent.click(screen.getByRole("button", { name: /Viewpoint/ }));

    act(() => {
      controller.publish({
        pose: { position: [10, 0, 0], target: [0, 0, 0] },
      });
    });

    expect(inputValue("Position X")).toBe("10");
    expect(inputValue("Position Y")).toBe("0");
    expect(inputValue("Position Z")).toBe("0");
    expect(inputValue("Azimuth (°)")).toBe("0");
    expect(inputValue("Elevation (°)")).toBe("0");
    expect(inputValue("Distance")).toBe("10");
  });

  it("normalizes near and far projection commits at both bounds", () => {
    const controller = createController();
    renderSettings(controller);
    fireEvent.click(screen.getByRole("button", { name: /Viewpoint/ }));

    commitNumber("Near", "-1");
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 10000,
      fovDegrees: 50,
      near: 0.0001,
    });

    commitNumber("Near", "1000000000");
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 500500000,
      fovDegrees: 50,
      near: 500000000,
    });

    commitNumber("Far", "-1");
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 500500000,
      fovDegrees: 50,
      near: 500000000,
    });

    commitNumber("Far", "2000000000");
    expect(controller.setProjection).toHaveBeenLastCalledWith({
      far: 1000000000,
      fovDegrees: 50,
      near: 500000000,
    });
  });
});

function inputValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

function commitNumber(label: string, value: string): void {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function renderSettings(controller: Mcap3dViewpointController) {
  return render(
    <Mcap3dViewpointProvider>
      <RegisterViewpoint controller={controller} />
      <McapViewpointSettings preferredTileId="3d-1" />
    </Mcap3dViewpointProvider>,
  );
}

function RegisterViewpoint({
  controller,
}: {
  readonly controller: Mcap3dViewpointController;
}) {
  useRegisterMcap3dViewpoint("3d-1", controller);
  return null;
}

function createController(): Mcap3dViewpointController {
  const store = createMcap3dViewpointStore({
    cameraNavigationMode: "relative",
    pose: { position: [0, 10, 10], target: [0, 0, 0] },
    projection: { far: 10000, fovDegrees: 50, near: 0.01 },
    sceneUpAxis: "z",
  });
  return {
    ...store,
    setCameraNavigationMode: vi.fn((cameraNavigationMode) =>
      store.publish({ cameraNavigationMode }),
    ),
    setPose: vi.fn((pose) => store.publish({ pose })),
    setProjection: vi.fn((projection) => store.publish({ projection })),
  };
}
