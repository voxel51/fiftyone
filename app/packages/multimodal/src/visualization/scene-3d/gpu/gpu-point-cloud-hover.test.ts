import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../ir";
import { buildPointCloudRenderPayload } from "../../../runtime/point-cloud-render-payload";
import type { PointCloudPanelLayer } from "../types";
import { resolveGpuPointCloudColor } from "./gpu-point-cloud-color";
import { resolveGpuPointCloudRenderedHover } from "./gpu-point-cloud-hover";

describe("GPU point-cloud rendered hover", () => {
  it("maps only the visible prefix of a decimated payload", () => {
    const payload = buildPointCloudRenderPayload({
      positions: Float32Array.from(
        { length: 8 * 3 },
        (_, component) => Math.floor(component / 3) * 10 + (component % 3),
      ),
    });
    const layer: PointCloudPanelLayer = {
      frame: {
        fields: [],
        kind: VISUALIZATION_KIND.POINT_CLOUD,
        pointCount: 8,
        positions: payload.positions,
        renderPayload: payload,
      },
      id: "/points",
    };
    const data = {
      color: resolveGpuPointCloudColor(payload, {
        colorBy: "uniform",
        uniformColor: "#336699",
      }),
      payload,
      renderedPointCount: 3,
    };

    expect(resolveGpuPointCloudRenderedHover(layer, data, 2)).toEqual({
      color: [0.2, 0.4, 0.6],
      pointIndex: payload.sourceIndices[2],
      sampleIndex: 2,
    });
    expect(resolveGpuPointCloudRenderedHover(layer, data, 3)).toBeNull();
  });
});
