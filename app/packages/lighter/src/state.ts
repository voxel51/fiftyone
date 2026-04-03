/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "jotai";
import { Scene2D } from "./core/Scene2D";

/**
 * Atom to store the current lighter scene instance
 */
export const lighterSceneAtom = atom<Scene2D | null>(null);

/**
 * Atom to store a Pixi/WebGL initialization error message, if any.
 * Null means no error.
 */
export const lighterInitErrorAtom = atom<string | null>(null);
