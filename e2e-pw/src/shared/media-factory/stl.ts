/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "node:fs";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";

/**
 * What to write into an ASCII STL mesh; every field has a default.
 */
export interface StlSpec {
  /**
   * Edge length of the cube, which spans `[0, size]` on each axis.
   * @default 10
   */
  size?: number;
}

export type StlOptions = MediaOptions & StlSpec;

type Vertex = [number, number, number];

/** Two triangles per cube face, wound outward, with the face normal. */
const cubeFacets = (size: number): [Vertex, Vertex[]][] => {
  const s = size;
  return [
    [
      [0, 0, 1],
      [
        [0, 0, s],
        [s, 0, s],
        [0, s, s],
      ],
    ],
    [
      [0, 0, 1],
      [
        [s, s, s],
        [0, s, s],
        [s, 0, s],
      ],
    ],
    [
      [1, 0, 0],
      [
        [s, 0, s],
        [s, 0, 0],
        [s, s, s],
      ],
    ],
    [
      [1, 0, 0],
      [
        [s, s, 0],
        [s, s, s],
        [s, 0, 0],
      ],
    ],
    [
      [0, 0, -1],
      [
        [s, 0, 0],
        [0, 0, 0],
        [s, s, 0],
      ],
    ],
    [
      [0, 0, -1],
      [
        [0, s, 0],
        [s, s, 0],
        [0, 0, 0],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [0, 0, 0],
        [0, 0, s],
        [0, s, 0],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [0, s, s],
        [0, s, 0],
        [0, 0, s],
      ],
    ],
    [
      [0, 1, 0],
      [
        [0, s, s],
        [s, s, s],
        [0, s, 0],
      ],
    ],
    [
      [0, 1, 0],
      [
        [s, s, 0],
        [0, s, 0],
        [s, s, s],
      ],
    ],
    [
      [0, -1, 0],
      [
        [s, 0, s],
        [0, 0, s],
        [s, 0, 0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [0, 0, 0],
        [s, 0, 0],
        [0, 0, s],
      ],
    ],
  ];
};

const format = (vertex: Vertex) =>
  vertex.map((value) => value.toExponential(6)).join(" ");

/**
 * Writes an ASCII STL cube at `outputPath`.
 *
 * @example
 * createStl({ outputPath: "/tmp/cube.stl", size: 10 });
 */
export const createStl = (options: StlOptions): void => {
  const facets = cubeFacets(options.size ?? 10).map(
    ([normal, vertices]) =>
      `facet normal ${format(normal)}\n  outer loop\n${vertices
        .map((vertex) => `    vertex ${format(vertex)}\n`)
        .join("")}  endloop\nendfacet\n`,
  );

  generateOnce("Stl", options, () => {
    fs.writeFileSync(
      options.outputPath,
      `solid cube\n${facets.join("")}endsolid cube\n`,
    );
  });
};
