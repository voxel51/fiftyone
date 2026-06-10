/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Point containment levels for overlays. Lives in its own leaf module so
 * `BaseOverlay` can value-import it without re-entering the Scene2D ↔
 * BaseOverlay cycle that would otherwise leave subclasses extending
 * `undefined` at module-init time.
 */
export enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}
