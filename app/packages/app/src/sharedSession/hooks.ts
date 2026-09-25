/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useSetAtom } from "jotai";
import { appCountAtom } from "./model/atoms";

/** Records the App count the server reported, or `null` once disconnected. */
export const useSetAppCount = () => useSetAtom(appCountAtom);
