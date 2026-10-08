/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export class DefaultValue {}

/**
 * One instance for the process. A reset can be inspected after the write that
 * carried it has returned, so this must not be a per-write token.
 */
export const DEFAULT_VALUE = new DefaultValue();
