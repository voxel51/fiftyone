import type { ImageTextureMesh } from "../../../visualization/panels/base-2d-scene";
import {
  projectEpisodeCameraPoint,
  unprojectEpisodeCameraPixel,
  type EpisodeCameraModel,
  type EpisodePinholeCameraModel,
} from "./episode-camera-model";

const TARGET_CELL_SIZE_PX = 16;
const MIN_GRID_SEGMENTS = 16;
const MAX_GRID_SEGMENTS = 256;

export type EpisodeImagePixelTransform = (
  u: number,
  v: number,
) => readonly [number, number] | null;

/** Cached mapping from recorded image pixels into a rectified display. */
export interface EpisodeRectifiedImageDisplay {
  readonly height: number;
  readonly pixelTransform: EpisodeImagePixelTransform;
  readonly textureMesh: ImageTextureMesh;
  /** Full R/P model used for geometry projected onto the rectified display. */
  readonly projectionModel: EpisodePinholeCameraModel;
  readonly width: number;
}

const rectificationCache = new WeakMap<
  EpisodeCameraModel,
  WeakMap<EpisodePinholeCameraModel, EpisodeRectifiedImageDisplay | null>
>();

/**
 * Builds a reusable target-pixel -> source-UV mesh plus the forward annotation
 * mapping. The target's P translation is kept for 3D projection but excluded
 * from image remapping, matching OpenCV/ROS rectification-map semantics.
 */
export function episodeRectifiedImageDisplay(
  sourceModel: EpisodeCameraModel,
  rectifiedModel: EpisodeCameraModel,
): EpisodeRectifiedImageDisplay | null {
  if (
    sourceModel.space !== "original" ||
    rectifiedModel.kind !== "pinhole" ||
    rectifiedModel.space !== "rectified"
  ) {
    return null;
  }

  let targets = rectificationCache.get(sourceModel);
  if (!targets) {
    targets = new WeakMap();
    rectificationCache.set(sourceModel, targets);
  }
  const cached = targets.get(rectifiedModel);
  if (cached !== undefined) {
    return cached;
  }

  const imageModel = rectifiedImageModel(rectifiedModel);
  const textureMesh = createRectificationTextureMesh(sourceModel, imageModel);
  const result: EpisodeRectifiedImageDisplay | null = textureMesh
    ? {
        height: imageModel.height,
        pixelTransform: (u: number, v: number) => {
          const ray = unprojectEpisodeCameraPixel(sourceModel, u, v);
          if (!ray) {
            return null;
          }
          const projected = projectEpisodeCameraPoint(imageModel, ray);
          return projected ? ([projected.u, projected.v] as const) : null;
        },
        projectionModel: rectifiedModel,
        textureMesh,
        width: imageModel.width,
      }
    : null;
  targets.set(rectifiedModel, result);
  return result;
}

function createRectificationTextureMesh(
  sourceModel: EpisodeCameraModel,
  targetModel: EpisodePinholeCameraModel,
): ImageTextureMesh | null {
  const columns = gridSegments(targetModel.width);
  const rows = gridSegments(targetModel.height);
  const vertexCount = (columns + 1) * (rows + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const valid = new Uint8Array(vertexCount);
  const sourceWidthDenominator = Math.max(1, sourceModel.width - 1);
  const sourceHeightDenominator = Math.max(1, sourceModel.height - 1);

  for (let row = 0; row <= rows; row++) {
    const rowFraction = row / rows;
    const targetV = (targetModel.height - 1) * rowFraction;
    for (let column = 0; column <= columns; column++) {
      const columnFraction = column / columns;
      const targetU = (targetModel.width - 1) * columnFraction;
      const vertex = row * (columns + 1) + column;
      const positionOffset = vertex * 3;
      positions[positionOffset] = columnFraction - 0.5;
      positions[positionOffset + 1] = 0.5 - rowFraction;
      positions[positionOffset + 2] = 0;

      const ray = unprojectEpisodeCameraPixel(targetModel, targetU, targetV);
      const source = ray ? projectEpisodeCameraPoint(sourceModel, ray) : null;
      if (
        !source ||
        source.u < 0 ||
        source.v < 0 ||
        source.u > sourceModel.width - 1 ||
        source.v > sourceModel.height - 1
      ) {
        continue;
      }
      const uvOffset = vertex * 2;
      uvs[uvOffset] = source.u / sourceWidthDenominator;
      uvs[uvOffset + 1] = 1 - source.v / sourceHeightDenominator;
      valid[vertex] = 1;
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      appendTriangle(indices, valid, topLeft, bottomLeft, topRight);
      appendTriangle(indices, valid, topRight, bottomLeft, bottomRight);
    }
  }

  return indices.length > 0
    ? {
        displayHeight: targetModel.height,
        displayWidth: targetModel.width,
        indices: Uint32Array.from(indices),
        positions,
        uvs,
      }
    : null;
}

function rectifiedImageModel(
  model: EpisodePinholeCameraModel,
): EpisodePinholeCameraModel {
  const projection = [...model.projection];
  projection[3] = 0;
  projection[7] = 0;
  projection[11] = 0;
  return { ...model, projection };
}

function gridSegments(length: number): number {
  return Math.min(
    MAX_GRID_SEGMENTS,
    Math.max(MIN_GRID_SEGMENTS, Math.ceil(length / TARGET_CELL_SIZE_PX)),
  );
}

function appendTriangle(
  indices: number[],
  valid: Uint8Array,
  first: number,
  second: number,
  third: number,
): void {
  if (valid[first] && valid[second] && valid[third]) {
    indices.push(first, second, third);
  }
}
