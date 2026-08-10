import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraTargetResolution } from "./scene-3d-camera";
import {
  Scene3dCameraRigController,
  RIG_COMMIT_DEBOUNCE_MS,
  type Scene3dCameraRigInputs,
} from "./scene-3d-camera-rig-core";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Scene3dCameraRigController follow composition", () => {
  it("derives the initial anchor from the live camera without moving it", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);

    controller.sync(rigInputs({ targetResolution: resolvedTarget(0, 0, 0) }));

    expect(controller.getAnchor()).toMatchObject({
      mode: "position",
      relativePosition: [5, 0, 10],
      relativeTarget: [5, 0, 0],
    });
    expect(scene.cameraPose()).toEqual({
      position: [5, 0, 10],
      target: [5, 0, 0],
    });
    expect(scene.callbacks.onPoseSample).toHaveBeenCalledTimes(1);
  });

  it("recomposes camera = anchor ∘ target on each resolved target update", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(0, 0, 0) }));

    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));

    expect(scene.cameraPose()).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(scene.invalidate).toHaveBeenCalled();
    // Composition's own controls.update() dispatches `change`; the
    // self-write guard must keep it from re-basing (exactly one sample per
    // sync: the compose sample, not an external-write sample on top).
    expect(scene.callbacks.onPoseSample).toHaveBeenCalledTimes(2);
  });

  it("freezes the camera while target resolution is pending or missing", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));
    const frozen = scene.cameraPose();

    controller.sync(rigInputs({ targetResolution: { status: "pending" } }));
    expect(scene.cameraPose()).toEqual(frozen);

    controller.sync(rigInputs({ targetResolution: { status: "missing" } }));
    expect(scene.cameraPose()).toEqual(frozen);
  });

  it("clears the anchor in free mode and leaves the camera alone", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(0, 0, 0) }));
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));

    controller.sync(
      rigInputs({ mode: "free", targetResolution: resolvedTarget(20, 0, 0) }),
    );

    expect(controller.getAnchor()).toBeNull();
    expect(scene.cameraPose()).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
  });

  it("re-derives the anchor under a new mode without moving the camera", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));
    const held = scene.cameraPose();

    controller.sync(
      rigInputs({ mode: "pose", targetResolution: resolvedTarget(10, 0, 0) }),
    );

    expect(controller.getAnchor()).toMatchObject({ mode: "pose" });
    expect(scene.cameraPose()).toEqual(held);
  });
});

describe("Scene3dCameraRigController external-write protocol", () => {
  it("re-bases the anchor from any change it did not write itself", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));

    // External write with NO gesture bracket around it — the zoom-floor
    // pushback and shell-applied pose commands land exactly like this.
    scene.setCamera([100, 0, 10], [100, 0, 0]);
    scene.emit("change");

    controller.sync(rigInputs({ targetResolution: resolvedTarget(12, 0, 0) }));

    // The next follow tick composes from the re-based anchor: the external
    // write survives instead of being snapped back over.
    expect(scene.cameraPose()).toEqual({
      position: [102, 0, 10],
      target: [102, 0, 0],
    });
  });

  it("marks the anchor dirty on external writes while pending, then re-bases before composing", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));

    controller.sync(rigInputs({ targetResolution: { status: "pending" } }));
    scene.setCamera([7, 0, 10], [7, 0, 0]);
    scene.emit("change");

    // Resolution resumes: the dirty anchor re-bases from the live camera
    // first, so this tick must not move the camera...
    controller.sync(rigInputs({ targetResolution: resolvedTarget(10, 0, 0) }));
    expect(scene.cameraPose()).toEqual({
      position: [7, 0, 10],
      target: [7, 0, 0],
    });

    // ...and the next tick follows from the re-based offset.
    controller.sync(rigInputs({ targetResolution: resolvedTarget(20, 0, 0) }));
    expect(scene.cameraPose()).toEqual({
      position: [17, 0, 10],
      target: [17, 0, 0],
    });
  });

  it("samples pose and anchor on every external write, in and out of follow", () => {
    const scene = createScene();
    const controller = createController(scene);
    controller.sync(rigInputs({ mode: "free" }));
    scene.callbacks.onPoseSample.mockClear();

    scene.setCamera([3, 0, 10], [3, 0, 0]);
    scene.emit("change");

    expect(scene.callbacks.onPoseSample).toHaveBeenCalledWith({
      anchor: null,
      pose: { position: [3, 0, 10], target: [3, 0, 0] },
    });
    expect(controller.getAnchor()).toBeNull();
  });
});

describe("Scene3dCameraRigController gesture commits", () => {
  it("commits once per gesture with the live pose and anchor", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(rigInputs({ targetResolution: resolvedTarget(0, 0, 0) }));

    scene.emit("start");
    scene.setCamera([8, 0, 10], [8, 0, 0]);
    scene.emit("change");
    scene.emit("end");
    expect(scene.callbacks.onCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS);
    expect(scene.callbacks.onCommit).toHaveBeenCalledTimes(1);
    expect(scene.callbacks.onCommit).toHaveBeenCalledWith(
      { position: [8, 0, 10], target: [8, 0, 0] },
      controller.getAnchor(),
    );
  });

  it("coalesces a wheel burst of start/end micro-gestures into one commit", () => {
    const scene = createScene();
    const controller = createController(scene);
    controller.sync(rigInputs({ mode: "free" }));

    for (let index = 0; index < 3; index += 1) {
      scene.emit("start");
      scene.emit("change");
      scene.emit("end");
      vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS / 2);
    }
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS);

    expect(scene.callbacks.onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending commit when a new gesture starts", () => {
    const scene = createScene();
    const controller = createController(scene);
    controller.sync(rigInputs({ mode: "free" }));

    scene.emit("start");
    scene.emit("end");
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS / 2);
    scene.emit("start");
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS * 2);

    expect(scene.callbacks.onCommit).not.toHaveBeenCalled();
    expect(scene.callbacks.onGestureStart).toHaveBeenCalledTimes(2);
  });

  it("cancels an outgoing source commit inside the debounce window", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(
      rigInputs({
        cameraEpoch: "source-a",
        targetResolution: resolvedTarget(0, 0, 0),
      }),
    );

    scene.emit("start");
    scene.emit("end");
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS / 2);
    controller.sync(
      rigInputs({
        cameraEpoch: "source-b",
        // Reused semantic frame ids must not make A's timer or anchor valid.
        targetFrameId: "base_link",
        targetResolution: resolvedTarget(100, 0, 0),
        worldFrameId: "map",
      }),
    );
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS);

    expect(scene.callbacks.onCommit).not.toHaveBeenCalled();
    expect(controller.getAnchor()).toMatchObject({
      relativePosition: [-95, 0, 10],
      targetFrameId: "base_link",
      worldFrameId: "map",
    });
  });

  it("cancels a pending commit on dispose — the unmount recorder owns the final write", () => {
    const scene = createScene();
    const controller = createController(scene);
    controller.sync(rigInputs({ mode: "free" }));

    scene.emit("start");
    scene.emit("end");
    controller.dispose();
    vi.advanceTimersByTime(RIG_COMMIT_DEBOUNCE_MS * 2);

    expect(scene.callbacks.onCommit).not.toHaveBeenCalled();
  });

  it("stops observing controls events after dispose", () => {
    const scene = createScene();
    const controller = createController(scene);
    controller.sync(rigInputs({ mode: "free" }));
    scene.callbacks.onPoseSample.mockClear();

    controller.dispose();
    scene.emit("start");
    scene.emit("change");

    expect(scene.callbacks.onGestureStart).not.toHaveBeenCalled();
    expect(scene.callbacks.onPoseSample).not.toHaveBeenCalled();
  });
});

describe("Scene3dCameraRigController anchor adoption", () => {
  it("adopts a matching restore anchor and composes the restored view", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    const adopt = {
      mode: "position",
      relativePosition: [1, 2, 3],
      relativeTarget: [1, 2, 0],
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      worldFrameId: "map",
    } as const;

    controller.sync(
      rigInputs({
        adoptAnchor: adopt,
        targetResolution: resolvedTarget(10, 0, 0),
      }),
    );

    expect(controller.getAnchor()).toBe(adopt);
    expect(scene.cameraPose()).toEqual({
      position: [11, 2, 3],
      target: [11, 2, 0],
    });
  });

  it("adopts one-shot per object: a later re-base is not overridden", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    const adopt = {
      mode: "position",
      relativePosition: [1, 2, 3],
      relativeTarget: [1, 2, 0],
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      worldFrameId: "map",
    } as const;
    controller.sync(
      rigInputs({
        adoptAnchor: adopt,
        targetResolution: resolvedTarget(10, 0, 0),
      }),
    );

    // The user re-orients: an external write re-bases the anchor.
    scene.setCamera([50, 0, 10], [50, 0, 0]);
    scene.emit("change");
    const rebased = controller.getAnchor();
    expect(rebased).not.toBe(adopt);

    // The stale adoptAnchor value is still in the inputs; it must not win.
    controller.sync(
      rigInputs({
        adoptAnchor: adopt,
        targetResolution: resolvedTarget(12, 0, 0),
      }),
    );
    expect(controller.getAnchor()).toBe(rebased);
  });

  it("ignores an anchor whose frames mismatch the effective inputs", () => {
    const scene = createScene();
    const controller = createController(scene);
    const adopt = {
      mode: "position",
      relativePosition: [1, 2, 3],
      relativeTarget: [1, 2, 0],
      sceneUpAxis: "z",
      targetFrameId: "other",
      worldFrameId: "map",
    } as const;

    controller.sync(
      rigInputs({
        adoptAnchor: adopt,
        targetResolution: resolvedTarget(10, 0, 0),
      }),
    );

    expect(controller.getAnchor()).not.toBe(adopt);
  });

  it("drops a reused-frame anchor on an incompatible source epoch", () => {
    const scene = createScene();
    scene.setCamera([5, 0, 10], [5, 0, 0]);
    const controller = createController(scene);
    controller.sync(
      rigInputs({
        cameraEpoch: "source-a",
        targetResolution: resolvedTarget(0, 0, 0),
      }),
    );
    const outgoingAnchor = controller.getAnchor();

    controller.sync(
      rigInputs({
        cameraEpoch: "source-b",
        targetFrameId: "base_link",
        targetResolution: resolvedTarget(100, 0, 0),
        worldFrameId: "map",
      }),
    );

    expect(controller.getAnchor()).not.toBe(outgoingAnchor);
    expect(scene.cameraPose()).toEqual({
      position: [5, 0, 10],
      target: [5, 0, 0],
    });
  });

  it("re-applies a compatible gate-checked carry after an epoch reset", () => {
    const scene = createScene();
    const controller = createController(scene);
    const carried = {
      mode: "position",
      relativePosition: [1, 2, 3],
      relativeTarget: [1, 2, 0],
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      worldFrameId: "map",
    } as const;
    controller.sync(
      rigInputs({
        adoptAnchor: carried,
        cameraEpoch: "source-a",
        targetResolution: resolvedTarget(10, 0, 0),
      }),
    );

    controller.sync(
      rigInputs({
        adoptAnchor: carried,
        cameraEpoch: "source-b",
        targetResolution: resolvedTarget(20, 0, 0),
      }),
    );

    expect(controller.getAnchor()).toBe(carried);
    expect(scene.cameraPose()).toEqual({
      position: [21, 2, 3],
      target: [21, 2, 0],
    });
  });
});

interface FakeVectorHandle {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => void;
}

function fakeVector(): FakeVectorHandle {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

function createScene() {
  const listeners: Record<string, Array<() => void>> = {};
  const camera = { position: fakeVector() };
  const emit = (type: string) => {
    for (const listener of [...(listeners[type] ?? [])]) {
      listener();
    }
  };
  const controls = {
    addEventListener: (type: string, listener: () => void) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(
        (existing) => existing !== listener,
      );
    },
    target: fakeVector(),
    // Mirrors OrbitControls: update() dispatches `change`, so the rig's
    // self-write guard is exercised by every composition.
    update: () => emit("change"),
  };

  return {
    callbacks: {
      onCommit: vi.fn(),
      onGestureStart: vi.fn(),
      onPoseSample: vi.fn(),
    },
    camera,
    cameraPose: () => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    }),
    controls,
    emit,
    invalidate: vi.fn(),
    setCamera(position: readonly number[], target: readonly number[]) {
      camera.position.set(position[0], position[1], position[2]);
      controls.target.set(target[0], target[1], target[2]);
    },
  };
}

function createController(scene: ReturnType<typeof createScene>) {
  return new Scene3dCameraRigController(
    scene.camera,
    scene.controls,
    scene.invalidate,
    scene.callbacks,
    rigInputs({ targetResolution: { status: "pending" } }),
  );
}

function rigInputs(
  overrides: Partial<Scene3dCameraRigInputs> = {},
): Scene3dCameraRigInputs {
  return {
    adoptAnchor: null,
    cameraEpoch: "source-a",
    mode: "position",
    sceneUpAxis: "z",
    targetFrameId: "base_link",
    targetResolution: resolvedTarget(0, 0, 0),
    worldFrameId: "map",
    ...overrides,
  };
}

function resolvedTarget(
  x: number,
  y: number,
  z: number,
): CameraTargetResolution {
  return {
    pose: {
      rotation: new Quaternion(),
      translation: new Vector3(x, y, z),
    },
    status: "resolved",
  };
}
