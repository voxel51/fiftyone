import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_SAVED_EVENT } from "../../constants";
import { saveCameraStateIfMoved } from "../utils";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

const KEY = "ds-fo3d-camera-position";

describe("saveCameraStateIfMoved", () => {
  beforeEach(() => {
    dispatch.mockClear();
    localStorage.clear();
  });

  it("saves and announces a pose only when it differs from the last saved", () => {
    const first = saveCameraStateIfMoved("ds", [1, 2, 3], [0, 0, 0], null);
    const same = saveCameraStateIfMoved("ds", [1, 2, 3], [0, 0, 0], first);
    const moved = saveCameraStateIfMoved("ds", [4, 5, 6], [0, 0, 0], same);

    const pose = (position: number[]) =>
      JSON.stringify({ position, target: [0, 0, 0] });
    expect([first, same, moved]).toEqual([
      pose([1, 2, 3]),
      pose([1, 2, 3]),
      pose([4, 5, 6]),
    ]);
    expect(dispatch.mock.calls).toEqual([
      [CAMERA_SAVED_EVENT, { pose: pose([1, 2, 3]) }],
      [CAMERA_SAVED_EVENT, { pose: pose([4, 5, 6]) }],
    ]);
    expect(localStorage.getItem(KEY)).toBe(pose([4, 5, 6]));
  });
});
