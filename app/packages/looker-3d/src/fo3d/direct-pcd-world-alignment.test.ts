import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { GroupStaticTransformResponse } from "../frustum/types";
import {
  resolveDirectPcdWorldAlignment,
  transformCuboidToNativeFrame,
} from "./direct-pcd-world-alignment";

describe("resolveDirectPcdWorldAlignment", () => {
  it("preserves identity behavior when no transforms are configured", () => {
    expect(
      resolveDirectPcdWorldAlignment(
        response(false, {
          lidar_top: { staticTransform: null },
        }),
        ["lidar_top"],
      ),
    ).toEqual({
      transformsBySlice: {},
      unresolvedSlices: [],
    });
  });

  it("accepts only each requested native frame resolved to world", () => {
    const alignment = resolveDirectPcdWorldAlignment(
      response(true, {
        lidar_left: {
          staticTransform: {
            translation: [-2, 0, 0],
            quaternion: [0, 0, 0, 2],
            source_frame: "lidar_left",
            target_frame: "world",
          },
        },
        lidar_right: {
          staticTransform: {
            translation: [2, 0, 0],
            quaternion: [0, 0, 0, 1],
            source_frame: "lidar_right",
            target_frame: "world",
          },
        },
      }),
      ["lidar_left", "lidar_right"],
    );

    expect(alignment.unresolvedSlices).toEqual([]);
    expect(alignment.transformsBySlice.lidar_left).toEqual({
      translation: [-2, 0, 0],
      quaternion: [0, 0, 0, 1],
      source_frame: "lidar_left",
      target_frame: "world",
    });
  });

  it("rejects missing, ambiguous, or wrong-target results", () => {
    const alignment = resolveDirectPcdWorldAlignment(
      response(true, {
        ambiguous: { staticTransform: null },
        failed: { error: "multiple paths" },
        wrong_target: {
          staticTransform: {
            translation: [0, 0, 0],
            quaternion: [0, 0, 0, 1],
            source_frame: "wrong_target",
            target_frame: "ego",
          },
        },
      }),
      ["ambiguous", "failed", "missing", "wrong_target"],
    );

    expect(alignment.transformsBySlice).toEqual({});
    expect(alignment.unresolvedSlices).toEqual([
      "ambiguous",
      "failed",
      "missing",
      "wrong_target",
    ]);
  });
});

describe("transformCuboidToNativeFrame", () => {
  it("inverse-transforms center and orientation while preserving dimensions", () => {
    const frameQuaternion = new Quaternion().setFromEuler(
      new Euler(0, 0, Math.PI / 2),
    );
    const nativeQuaternion = new Quaternion().setFromEuler(
      new Euler(Math.PI / 3, 0, 0),
    );
    const nativeLocation = new Vector3(1, 2, 3);
    const translation = new Vector3(10, -4, 2);
    const worldLocation = nativeLocation
      .clone()
      .applyQuaternion(frameQuaternion)
      .add(translation);
    const worldQuaternion = frameQuaternion.clone().multiply(nativeQuaternion);

    const native = transformCuboidToNativeFrame(
      {
        location: worldLocation.toArray(),
        dimensions: [4, 5, 6],
        quaternion: worldQuaternion.toArray(),
      },
      {
        translation: translation.toArray(),
        quaternion: frameQuaternion.toArray(),
        source_frame: "lidar_top",
        target_frame: "world",
      },
    );

    expect(native.location).toEqual(expectCloseToTuple([1, 2, 3]));
    expect(native.dimensions).toEqual([4, 5, 6]);
    expect(native.quaternion).toEqual(
      expectCloseToTuple(nativeQuaternion.toArray()),
    );
  });
});

const response = (
  hasStaticTransforms: boolean,
  results: GroupStaticTransformResponse["results"],
): GroupStaticTransformResponse => ({
  group_id: "group-id",
  has_static_transforms: hasStaticTransforms,
  target_frame: "world",
  results,
});

const expectCloseToTuple = (values: readonly number[]) =>
  values.map((value) => expect.closeTo(value, 10));
