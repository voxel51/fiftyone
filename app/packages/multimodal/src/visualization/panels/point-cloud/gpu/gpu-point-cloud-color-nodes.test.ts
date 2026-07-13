import * as THREE from "three";
import * as TSL from "three/tsl";
import { afterEach, describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../../../decoders";
import { createGpuPointCloudColorNode } from "./gpu-point-cloud-color-nodes";
import { resolveGpuPointCloudColor } from "./gpu-point-cloud-color";
import {
  gpuPointCloudColormapTextureStats,
  releaseGpuPointCloudColormapTextures,
} from "./gpu-point-cloud-colormap-texture";

afterEach(() => releaseGpuPointCloudColormapTextures());

describe("GPU pointcloud color nodes", () => {
  it("builds rgb and uniform nodes without a lookup texture", () => {
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([1, 0, 0]),
      positions: new Float32Array([0, 0, 1]),
    });
    const attributes = attributesForPayload(payload);

    expect(
      createGpuPointCloudColorNode(
        resolveGpuPointCloudColor(payload, { colorBy: "rgb" }),
        attributes,
      ),
    ).toBeTruthy();
    expect(
      createGpuPointCloudColorNode(
        resolveGpuPointCloudColor(payload, {
          colorBy: "uniform",
          uniformColor: "#123456",
        }),
        attributes,
      ),
    ).toBeTruthy();
    expect(gpuPointCloudColormapTextureStats().entryCount).toBe(0);
  });

  it("shares one lookup texture across height and scalar ramps", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([0, 0, 1, 0, 0, 2]),
      scalarFields: [{ name: "intensity", values: new Float32Array([10, 20]) }],
    });
    const attributes = attributesForPayload(payload);

    const heightNode = createGpuPointCloudColorNode(
      resolveGpuPointCloudColor(payload, { colorBy: "height" }),
      attributes,
    );
    expect(heightNode).toBeTruthy();
    expect(
      createGpuPointCloudColorNode(
        resolveGpuPointCloudColor(payload, { colorBy: "intensity" }),
        attributes,
      ),
    ).toBeTruthy();
    expect(gpuPointCloudColormapTextureStats().entryCount).toBe(1);

    const constants = nodeConstantValues(heightNode);
    // Sample t at texel centers so linear GPU filtering matches the CPU LUT's
    // t * (size - 1) interpolation, including exact endpoint colors.
    expect(constants).toEqual(expect.arrayContaining([255, 0.5, 256]));
  });

  it("accepts caller-indexed nodes for storage-buffer sampling", () => {
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([1, 0, 0]),
      positions: new Float32Array([0, 0, 1]),
    });
    const attributes = attributesForPayload(payload);
    const colorNode = TSL.vec3(0.1, 0.2, 0.3);

    expect(
      createGpuPointCloudColorNode(
        resolveGpuPointCloudColor(payload, { colorBy: "rgb" }),
        { ...attributes, colorNode },
      ),
    ).toBe(colorNode);
  });
});

function nodeConstantValues(node: TSL.Node): unknown[] {
  const serialized = (node as unknown as { toJSON(): unknown }).toJSON() as {
    readonly nodes?: readonly {
      readonly type?: string;
      readonly value?: unknown;
    }[];
  };
  return (serialized.nodes ?? [])
    .filter((candidate) => candidate.type === "ConstNode")
    .map((candidate) => candidate.value);
}

function attributesForPayload(
  payload: ReturnType<typeof buildPointCloudRenderPayload>,
) {
  const position = new THREE.InstancedBufferAttribute(payload.positions, 3);
  return {
    color: payload.colors
      ? new THREE.InstancedBufferAttribute(payload.colors, 3)
      : null,
    positionNode: TSL.instancedBufferAttribute(position, "vec3"),
    scalar: new Map(
      payload.scalarFields.map((field) => [
        field.name,
        new THREE.InstancedBufferAttribute(field.values, 1),
      ]),
    ),
  };
}
