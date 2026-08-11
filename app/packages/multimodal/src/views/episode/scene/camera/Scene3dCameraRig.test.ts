import { describe, expect, it, vi } from "vitest";
import {
  createScene3dCameraRigStore,
  type Scene3dCameraRigProps,
} from "./Scene3dCameraRig";

const PROPS: Scene3dCameraRigProps = {
  adoptAnchor: null,
  cameraEpoch: "source-a",
  mode: "free",
  onCommit: vi.fn(),
  onGestureStart: vi.fn(),
  onPoseSample: vi.fn(),
  sceneUpAxis: "z",
  targetFrameId: "base",
  targetResolution: { status: "pending" },
  worldFrameId: "map",
};

describe("Scene3dCameraRigStore", () => {
  it("publishes changed playback inputs without React state", () => {
    const store = createScene3dCameraRigStore(PROPS);
    const listener = vi.fn();
    store.subscribe(listener);

    store.publish(PROPS);
    expect(listener).not.toHaveBeenCalled();

    const callbacksUpdated = { ...PROPS, onCommit: vi.fn() };
    store.publish(callbacksUpdated);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(callbacksUpdated);

    const next = {
      ...callbacksUpdated,
      targetResolution: { status: "missing" },
    } as const;
    store.publish(next);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(next);
  });

  it("publishes source epochs even when frame ids and resolution are reused", () => {
    const store = createScene3dCameraRigStore(PROPS);
    const listener = vi.fn();
    store.subscribe(listener);

    store.publish({ ...PROPS, cameraEpoch: "source-b" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().cameraEpoch).toBe("source-b");
  });
});
