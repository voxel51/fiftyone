/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { atom } from "jotai";
import { Scene2D } from "./core/Scene2D";

/**
 * Atom to store the current lighter scene instance
 */
export const lighterSceneAtom = atom<Scene2D | null>(null);
