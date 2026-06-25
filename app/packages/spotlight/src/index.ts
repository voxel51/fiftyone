/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// The measured, cursor-paginated Spotlight grid engine has been retired in favor
// of the spine-driven engine (app/packages/core/src/components/Grid/useGridEngine).
// This package now provides only the shared grid types/events the engine + modal
// still use (and which are externalized to plugins). The former engine modules —
// section/row/tile/createScrollReader/iter/closest/utilities/constants +
// styles.module.css (and closest.test/tile.test) — are orphaned and safe to delete.
export { Load, Rejected, RowChange } from "./events";
export * from "./types";
