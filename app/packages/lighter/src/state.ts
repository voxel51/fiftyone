/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { atom } from "jotai";
import type { Scene2D } from "./core/Scene2D";

/**
 * Atom to store the default lighter scene instance
 */
export const defaultLighterSceneAtom = atom<Scene2D | null>(null);

export type SceneAtom = typeof defaultLighterSceneAtom;
