/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "jotai";
import { Scene2D } from "./core/Scene2D";

// Without strictNullChecks a bare `null` matches jotai's read-only
// `atom(read)` overload, so type the initial value to select the primitive,
// writable overload.

/**
 * Atom to store the current lighter scene instance
 */
export const lighterSceneAtom = atom<Scene2D | null>(null as Scene2D | null);

/**
 * Atom to store a Pixi/WebGL initialization error message, if any.
 * Null means no error.
 */
export const lighterInitErrorAtom = atom<string | null>(null as string | null);
