import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA_POSITION } from "../../constants";
import {
  type CameraConfigSources,
  type ViewConfigSources,
  resolveCameraConfig,
  resolveConfiguredUpVector,
  resolveUpVector,
  resolveViewConfig,
} from "../camera-init";

const makeSources = (
  overrides: Partial<CameraConfigSources> = {}
): CameraConfigSources => ({
  savedState: null,
  overriddenCameraPosition: null,
  scenePosition: null,
  sceneLookAt: null,
  pluginSettings: null,
  boundingBox: null,
  upVector: null,
  ...overrides,
});

const finiteBbox = new Box3(new Vector3(-2, -3, -4), new Vector3(2, 3, 4));

describe("resolveCameraConfig", () => {
  it("returns fallback when no sources are available", () => {
    const result = resolveCameraConfig(makeSources());
    expect(result.source).toBe("fallback");
    expect(result.target.toArray()).toEqual([0, 0, 0]);
    const defaultPos = DEFAULT_CAMERA_POSITION();
    expect(result.position.x).toBeCloseTo(defaultPos.x);
    expect(result.position.y).toBeCloseTo(defaultPos.y);
    expect(result.position.z).toBeCloseTo(defaultPos.z);
  });

  it("returns savedState when available (highest priority)", () => {
    const result = resolveCameraConfig(
      makeSources({
        savedState: {
          position: [10, 20, 30],
          target: [1, 2, 3],
        },
        overriddenCameraPosition: [99, 99, 99],
        scenePosition: [50, 50, 50],
      })
    );
    expect(result.source).toBe("savedState");
    expect(result.position.toArray()).toEqual([10, 20, 30]);
    expect(result.target.toArray()).toEqual([1, 2, 3]);
  });

  it("returns operatorOverride when no savedState (second priority)", () => {
    const result = resolveCameraConfig(
      makeSources({
        overriddenCameraPosition: [5, 10, 15],
        scenePosition: [50, 50, 50],
      })
    );
    expect(result.source).toBe("operatorOverride");
    expect(result.position.toArray()).toEqual([5, 10, 15]);
  });

  it("operatorOverride resolves target from sceneLookAt", () => {
    const result = resolveCameraConfig(
      makeSources({
        overriddenCameraPosition: [5, 10, 15],
        sceneLookAt: [1, 2, 3],
      })
    );
    expect(result.source).toBe("operatorOverride");
    expect(result.target.toArray()).toEqual([1, 2, 3]);
  });

  it("operatorOverride resolves target from bbox center when no sceneLookAt", () => {
    const result = resolveCameraConfig(
      makeSources({
        overriddenCameraPosition: [5, 10, 15],
        boundingBox: finiteBbox,
        upVector: new Vector3(0, 1, 0),
      })
    );
    expect(result.source).toBe("operatorOverride");
    expect(result.target.toArray()).toEqual([0, 0, 0]);
  });

  it("operatorOverride resolves target to origin when no sceneLookAt and no bbox", () => {
    const result = resolveCameraConfig(
      makeSources({
        overriddenCameraPosition: [5, 10, 15],
      })
    );
    expect(result.source).toBe("operatorOverride");
    expect(result.target.toArray()).toEqual([0, 0, 0]);
  });

  it("returns scenePosition when no savedState or operator override", () => {
    const result = resolveCameraConfig(
      makeSources({
        scenePosition: [100, 200, 300],
        sceneLookAt: [10, 20, 30],
      })
    );
    expect(result.source).toBe("scenePosition");
    expect(result.position.toArray()).toEqual([100, 200, 300]);
    expect(result.target.toArray()).toEqual([10, 20, 30]);
  });

  it("returns pluginSettings when no higher-priority sources", () => {
    const result = resolveCameraConfig(
      makeSources({
        pluginSettings: {
          defaultCameraPosition: new Vector3(7, 8, 9),
          useLegacyCoordinates: false,
          defaultUp: [0, 1, 0],
        },
      })
    );
    expect(result.source).toBe("pluginSettings");
    expect(result.position.toArray()).toEqual([7, 8, 9]);
  });

  it("returns computedFromBbox when bbox and upVector are available", () => {
    const result = resolveCameraConfig(
      makeSources({
        boundingBox: finiteBbox,
        upVector: new Vector3(0, 1, 0),
      })
    );
    expect(result.source).toBe("computedFromBbox");
    // Target should be bbox center
    expect(result.target.toArray()).toEqual([0, 0, 0]);
    // Position should be above the center (Y-up, "top" view)
    expect(result.position.y).toBeGreaterThan(0);
  });

  it("skips computedFromBbox when upVector is null", () => {
    const result = resolveCameraConfig(
      makeSources({
        boundingBox: finiteBbox,
        upVector: null,
      })
    );
    expect(result.source).toBe("fallback");
  });

  it("skips computedFromBbox for infinite bbox", () => {
    const infiniteBbox = new Box3(
      new Vector3(
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NEGATIVE_INFINITY
      ),
      new Vector3(
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY
      )
    );
    const result = resolveCameraConfig(
      makeSources({
        boundingBox: infiniteBbox,
        upVector: new Vector3(0, 1, 0),
      })
    );
    expect(result.source).toBe("fallback");
  });

  it("returns fallback while bbox is still computing (null), then computedFromBbox once ready", () => {
    const upVector = new Vector3(0, 1, 0);

    // Phase 1: bbox is null (still computing) — no other sources available
    const duringCompute = resolveCameraConfig(
      makeSources({ boundingBox: null, upVector })
    );
    expect(duringCompute.source).toBe("fallback");

    // This is what the init effect checks:
    // config.source === "fallback" && isComputingSceneBoundingBox → skip, wait for bbox

    // Phase 2: bbox computation finishes (e.g. after 3 seconds)
    const afterCompute = resolveCameraConfig(
      makeSources({ boundingBox: finiteBbox, upVector })
    );
    expect(afterCompute.source).toBe("computedFromBbox");
    expect(afterCompute.target.toArray()).toEqual([0, 0, 0]);
    expect(afterCompute.position.y).toBeGreaterThan(0);
  });

  it("handles Z-up scenes correctly", () => {
    const result = resolveCameraConfig(
      makeSources({
        boundingBox: finiteBbox,
        upVector: new Vector3(0, 0, 1),
      })
    );
    expect(result.source).toBe("computedFromBbox");
    // Position should be above the center (Z-up)
    expect(result.position.z).toBeGreaterThan(0);
  });

  it("always resolves both position and target together", () => {
    // Previously scenePosition without lookAt would only set position,
    // leaving target undefined. Now both are always resolved.
    const result = resolveCameraConfig(
      makeSources({
        scenePosition: [100, 200, 300],
        // no sceneLookAt, no bbox
      })
    );
    expect(result.source).toBe("scenePosition");
    expect(result.position).toBeDefined();
    expect(result.target).toBeDefined();
    expect(result.target.toArray()).toEqual([0, 0, 0]);
  });
});

const makeViewSources = (
  overrides: Partial<ViewConfigSources> = {}
): ViewConfigSources => ({
  boundingBox: finiteBbox,
  upVector: new Vector3(0, 1, 0),
  overriddenCameraPosition: null,
  scenePosition: null,
  pluginSettings: null,
  ...overrides,
});

describe("resolveViewConfig", () => {
  describe("top view", () => {
    it("positions camera above bbox center for top view", () => {
      const result = resolveViewConfig("top", makeViewSources());
      expect(result.target.toArray()).toEqual([0, 0, 0]);
      // With Y-up, camera should be above center
      expect(result.position.y).toBeGreaterThan(0);
    });

    it("uses bbox center as target for top view", () => {
      const offsetBbox = new Box3(
        new Vector3(10, 0, 10),
        new Vector3(20, 5, 20)
      );
      const result = resolveViewConfig(
        "top",
        makeViewSources({ boundingBox: offsetBbox })
      );
      expect(result.target.x).toBeCloseTo(15);
      expect(result.target.z).toBeCloseTo(15);
    });
  });

  describe("precedence", () => {
    it("operator override takes priority over scene position in pov", () => {
      const result = resolveViewConfig(
        "pov",
        makeViewSources({
          overriddenCameraPosition: [1, 1, 1],
          scenePosition: [9, 9, 9],
        })
      );
      expect(result.position.toArray()).toEqual([1, 1, 1]);
    });

    it("scene position takes priority over plugin settings in pov", () => {
      const result = resolveViewConfig(
        "pov",
        makeViewSources({
          scenePosition: [4, 5, 6],
          pluginSettings: {
            defaultCameraPosition: new Vector3(7, 8, 9),
            useLegacyCoordinates: false,
            defaultUp: [0, 1, 0],
          },
        })
      );
      expect(result.position.toArray()).toEqual([4, 5, 6]);
    });
  });
});

describe("up-vector resolution", () => {
  it("resolveConfiguredUpVector prefers scene-configured axis", () => {
    const result = resolveConfiguredUpVector({
      sceneUpAxis: "-Y",
      pluginDefaultUp: [0, 0, 1],
    });

    expect(result.toArray()).toEqual([0, -1, 0]);
  });

  it("resolveConfiguredUpVector falls back to plugin default when scene axis is absent", () => {
    const result = resolveConfiguredUpVector({
      sceneUpAxis: null,
      pluginDefaultUp: [1, 0, 0],
    });

    expect(result.toArray()).toEqual([1, 0, 0]);
  });

  it("resolveConfiguredUpVector falls back to Z-up when scene and plugin defaults are unusable", () => {
    const result = resolveConfiguredUpVector({
      sceneUpAxis: "NOT_AN_AXIS",
      pluginDefaultUp: [0.5, 0.5, 0],
    });

    expect(result.toArray()).toEqual([0, 0, 1]);
  });

  it("resolveUpVector overrides stored value when scene axis is provided", () => {
    const result = resolveUpVector({
      sceneUpAxis: "X",
      pluginDefaultUp: [0, 0, 1],
      storedUpVector: new Vector3(0, 1, 0),
    });

    expect(result.toArray()).toEqual([1, 0, 0]);
  });

  it("resolveUpVector preserves stored value when no scene axis is provided", () => {
    const stored = new Vector3(0, -1, 0);
    const result = resolveUpVector({
      sceneUpAxis: null,
      pluginDefaultUp: [0, 0, 1],
      storedUpVector: stored,
    });

    expect(result).toBe(stored);
  });

  it("resolveUpVector initializes from configured defaults when storage is empty", () => {
    const result = resolveUpVector({
      sceneUpAxis: null,
      pluginDefaultUp: [0, 1, 0],
      storedUpVector: null,
    });

    expect(result.toArray()).toEqual([0, 1, 0]);
  });
});
