import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";

import type {
  CameraFrustumPanelLayer,
  PointCloudPanelLayer,
} from "../../../visualization/scene-3d";
import { VISUALIZATION_KIND } from "../../../visualization/visualization-registry";
import type { HoveredPointEcho } from "../interaction/point-hover/hover-echo";
import { resolveProjectionCorrespondence } from "./projection-correspondence";

describe("projection correspondence", () => {
  it("connects the displayed frustum apex to the displayed point in world space", () => {
    const frustumLayer = frustum(transform("camera", "map", [10, 0, 0]));
    const pointLayer = pointCloud(
      42n,
      transform(
        "lidar",
        "map",
        [0, 20, 0],
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
      ),
    );

    const result = resolveProjectionCorrespondence({
      frustumLayers: [frustumLayer],
      hover: projectionHover(),
      pointCloudLayers: [pointLayer],
      worldFrameId: "map",
    });

    expect(result).toMatchObject({
      id: "projection-correspondence:/camera/image:/lidar:42",
      role: "projection-correspondence",
      start: [10, 0, 0],
    });
    expect(result?.end[0]).toBeCloseTo(0);
    expect(result?.end[1]).toBeCloseTo(21);
    expect(result?.end[2]).toBeCloseTo(0);
    expect(result?.frameTransform).toBeUndefined();
  });

  it("uses local coordinates only when both displayed frames are the world frame", () => {
    const hover = projectionHover({ position: [1, 2, 3] });
    const result = resolveProjectionCorrespondence({
      frustumLayers: [frustum(undefined, "map")],
      hover: {
        ...hover,
        source: hover.source
          ? { ...hover.source, cameraFrameId: "map" }
          : undefined,
      },
      pointCloudLayers: [pointCloud(42n, undefined, "map")],
      worldFrameId: "map",
    });

    expect(result).toMatchObject({
      end: [1, 2, 3],
      start: [0, 0, 0],
    });
  });

  it("ignores hovers that did not originate from an image projection", () => {
    expect(
      resolveProjectionCorrespondence({
        frustumLayers: [frustum(transform("camera", "map"))],
        hover: { ...projectionHover(), source: undefined },
        pointCloudLayers: [pointCloud(42n, transform("lidar", "map"))],
        worldFrameId: "map",
      }),
    ).toBeNull();
  });

  it("withholds stale point frames", () => {
    expect(
      resolveProjectionCorrespondence({
        frustumLayers: [frustum(transform("camera", "map"))],
        hover: projectionHover(),
        pointCloudLayers: [pointCloud(43n, transform("lidar", "map"))],
        worldFrameId: "map",
      }),
    ).toBeNull();
  });

  it("requires the matching camera frustum to be displayed", () => {
    expect(
      resolveProjectionCorrespondence({
        frustumLayers: [],
        hover: projectionHover(),
        pointCloudLayers: [pointCloud(42n, transform("lidar", "map"))],
        worldFrameId: "map",
      }),
    ).toBeNull();
  });

  it("requires both displayed artifacts to be placed in the world frame", () => {
    expect(
      resolveProjectionCorrespondence({
        frustumLayers: [frustum(undefined)],
        hover: projectionHover(),
        pointCloudLayers: [pointCloud(42n, transform("lidar", "map"))],
        worldFrameId: "map",
      }),
    ).toBeNull();

    expect(
      resolveProjectionCorrespondence({
        frustumLayers: [frustum(transform("camera", "map"))],
        hover: projectionHover(),
        pointCloudLayers: [pointCloud(42n, undefined)],
        worldFrameId: "map",
      }),
    ).toBeNull();
  });
});

function projectionHover(
  overrides: Partial<HoveredPointEcho> = {},
): HoveredPointEcho {
  return {
    color: [1, 0, 0],
    contentTimeNs: 42n,
    fields: {},
    kind: "point",
    pointIndex: 0,
    position: [1, 0, 0],
    source: {
      cameraFrameId: "camera",
      imageContentTimeNs: 21n,
      imageStream: "/camera/image",
      kind: "image-projection",
    },
    stream: "/lidar",
    ...overrides,
  };
}

function pointCloud(
  contentTimeNs: bigint,
  frameTransform?: PointCloudPanelLayer["frameTransform"],
  coordinateFrameId = "lidar",
): PointCloudPanelLayer {
  return {
    contentTimeNs,
    frame: {
      coordinateFrameId,
      fields: [],
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount: 1,
      positions: new Float32Array([1, 0, 0]),
    },
    frameTransform,
    id: "/lidar",
  };
}

function frustum(
  frameTransform?: CameraFrustumPanelLayer["frameTransform"],
  coordinateFrameId = "camera",
): CameraFrustumPanelLayer {
  return {
    frame: {
      coordinateFrameId,
      height: 10,
      K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      width: 10,
    },
    frameTransform,
    id: "/camera/info",
    imageStream: "/camera/image",
  };
}

function transform(
  sourceFrameId: string,
  targetFrameId: string,
  translation: readonly [number, number, number] = [0, 0, 0],
  rotation = new Quaternion(),
) {
  return {
    rotation,
    sourceFrameId,
    targetFrameId,
    translation: new Vector3(...translation),
  };
}
