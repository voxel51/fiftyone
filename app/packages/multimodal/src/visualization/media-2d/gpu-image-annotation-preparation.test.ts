import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { ImageAnnotationsVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  IMAGE_ANNOTATION_PICK_KIND,
  prepareImageAnnotationHighlight,
  prepareImageAnnotations,
} from "./gpu-image-annotation-preparation";

describe("GPU image annotation preparation", () => {
  it("flattens visible shapes while retaining text only as metadata", () => {
    const prepared = prepareImageAnnotations([
      {
        frame: {
          ...emptyAnnotations(),
          circles: [
            {
              diameter: 20,
              fillColor: null,
              outlineColor: null,
              position: [40, 50],
              thickness: 2,
            },
          ],
          points: [
            {
              fillColor: null,
              outlineColor: null,
              outlineColors: [],
              points: [
                [10, 10],
                [20, 20],
              ],
              thickness: 3,
              type: "points",
            },
            {
              fillColor: null,
              outlineColor: null,
              outlineColors: [],
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
              ],
              thickness: 1,
              type: "line-strip",
            },
          ],
          texts: [
            {
              backgroundColor: null,
              fontSize: 12,
              position: [42, 52],
              text: "car",
              textColor: null,
            },
          ],
        },
        stream: "/annotations",
      },
    ]);

    expect(prepared.metadata).toHaveLength(3);
    expect(prepared.metadata[2]).toMatchObject({
      key: "c-0",
      label: "car",
      stream: "/annotations",
    });
    expect(prepared.points.count).toBe(3);
    expect(Array.from(prepared.points.kinds)).toEqual([0, 0, 1]);
    expect(prepared.segments.count).toBe(2);
    expect(
      Array.from(prepared.picks.kinds).filter(
        (kind) => kind === IMAGE_ANNOTATION_PICK_KIND.DISC,
      ),
    ).toHaveLength(3);
  });

  it("groups line lists into stable labeled primitives with interior picks", () => {
    const prepared = prepareImageAnnotations([
      {
        frame: {
          ...emptyAnnotations(),
          points: [
            {
              fillColor: null,
              outlineColor: null,
              outlineColors: [],
              points: [
                [0, 0],
                [10, 0],
                [10, 0],
                [10, 10],
                [20, 20],
                [30, 20],
                [30, 20],
                [30, 30],
              ],
              thickness: 1,
              type: "line-list",
            },
          ],
          texts: [text("car", 0, 0), text("truck", 20, 20)],
        },
        stream: "/boxes",
      },
    ]);

    expect(prepared.metadata.map(({ key, label }) => ({ key, label }))).toEqual(
      [
        { key: "pg-0-0-0|0|1|1", label: "car" },
        { key: "pg-0-1-1|1|1|1", label: "truck" },
      ],
    );
    expect(prepared.segments.count).toBe(4);
    expect(
      Array.from(prepared.picks.kinds).filter(
        (kind) => kind === IMAGE_ANNOTATION_PICK_KIND.RECT,
      ),
    ).toHaveLength(2);
  });

  it("adaptively tessellates nonlinear line work and withholds invalid paths", () => {
    const curved = prepareImageAnnotations(
      [
        {
          frame: {
            ...emptyAnnotations(),
            points: [
              {
                fillColor: null,
                outlineColor: null,
                outlineColors: [],
                points: [
                  [0, 0],
                  [100, 0],
                ],
                thickness: 1,
                type: "line-strip",
              },
            ],
          },
          stream: "/curve",
        },
      ],
      (x, y) => [x, y + (x * x) / 100],
    );

    expect(curved.segments.count).toBeGreaterThan(2);

    const invalid = prepareImageAnnotations(
      [
        {
          frame: {
            ...emptyAnnotations(),
            points: [
              {
                fillColor: null,
                outlineColor: null,
                outlineColors: [],
                points: [
                  [0, 0],
                  [100, 0],
                ],
                thickness: 1,
                type: "line-strip",
              },
            ],
          },
          stream: "/curve",
        },
      ],
      (x, y) => (x >= 40 && x <= 60 ? null : [x, y]),
    );

    expect(invalid.segments.count).toBe(0);
    expect(invalid.picks.count).toBe(0);
  });

  it("extracts selected geometry into a separate highlight batch", () => {
    const prepared = prepareImageAnnotations([
      {
        frame: {
          ...emptyAnnotations(),
          circles: [
            {
              diameter: 20,
              fillColor: null,
              outlineColor: null,
              position: [40, 50],
              thickness: 2,
            },
          ],
          points: [
            {
              fillColor: null,
              outlineColor: null,
              outlineColors: [],
              points: [
                [0, 0],
                [10, 0],
              ],
              thickness: 1,
              type: "line-strip",
            },
          ],
        },
        stream: "/annotations",
      },
    ]);

    const highlight = prepareImageAnnotationHighlight(prepared, new Set([1]));

    expect(highlight.points.count).toBe(1);
    expect(highlight.segments.count).toBe(0);
    expect(highlight.picks.count).toBe(0);
    const highlightColor = new THREE.Color("#ff7a18");
    expect(highlight.points.colors[0]).toBeCloseTo(highlightColor.r);
    expect(highlight.points.colors[1]).toBeCloseTo(highlightColor.g);
    expect(highlight.points.colors[2]).toBeCloseTo(highlightColor.b);
  });
});

function emptyAnnotations(): ImageAnnotationsVisualization {
  return {
    circles: [],
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    points: [],
    texts: [],
  };
}

function text(textValue: string, x: number, y: number) {
  return {
    backgroundColor: null,
    fontSize: 10,
    position: [x, y] as const,
    text: textValue,
    textColor: null,
  };
}
