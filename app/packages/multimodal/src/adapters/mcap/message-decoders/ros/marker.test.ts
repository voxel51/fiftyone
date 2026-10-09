import { describe, expect, it } from "vitest";
import { markerRecord } from "../ros.test-helpers";
import { decodeRosMarkerRecord } from "./marker";

describe("ROS mesh resource URLs", () => {
  it.each([
    "gs://bucket/robot.glb",
    "s3://bucket/robot.gltf",
    "az://bucket/robot.glb",
    "https://example.com/robot.glb?version=1",
    "data:model/gltf-binary;base64,AAAA",
  ])("retains supported model %s for the renderer", (meshResource) => {
    const output = decodeRosMarkerRecord(
      markerRecord({ id: 1, ns: "robot", type: 10, meshResource }),
      {},
    );
    expect(output.visualization).toMatchObject({
      entities: [{ models: [{ url: meshResource }] }],
    });
    expect(output.attributes).toMatchObject({ unsupportedMarkerCount: 0 });
  });

  it.each(["package://robot/mesh.dae", "s3://bucket/robot.stl"])(
    "keeps unsupported format %s explicit",
    (meshResource) => {
      const output = decodeRosMarkerRecord(
        markerRecord({ id: 1, ns: "robot", type: 10, meshResource }),
        {},
      );
      expect(output.attributes).toMatchObject({ unsupportedMarkerCount: 1 });
    },
  );
});
