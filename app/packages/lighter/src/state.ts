/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, type PrimitiveAtom } from "jotai";
import { Scene2D } from "./core/Scene2D";

/**
 * Atom to store the current lighter scene instance.
 * Assertion needed: without strictNullChecks, jotai's overload resolution incorrectly
 * picks the read-only `atom(read: Read<T>)` overload when the initial value is `null`.
 * At runtime, atom(null) always produces a writable atom (verified: has `write` property).
 */
export const lighterSceneAtom = atom<Scene2D | null>(
  null
) as unknown as PrimitiveAtom<Scene2D | null>;
