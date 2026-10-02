/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "jotai";

/**
 * The number of App clients connected to the server, as last reported over
 * the event stream, or `null` while this client is not connected.
 *
 * The initial value carries its type rather than `atom<number | null>(null)`:
 * a bare `null` matches jotai's read-only `atom(read)` overload under this
 * project's non-strict null checks.
 */
export const appCountAtom = atom(null as number | null);
