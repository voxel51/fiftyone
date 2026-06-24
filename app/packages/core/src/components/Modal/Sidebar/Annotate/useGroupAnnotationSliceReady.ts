/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, useAtom } from "jotai";

// whether the group annotation slice has been resolved and
// applied so as to avoid a flash of the 2D annotation tools
const groupAnnotationSliceReadyAtom = atom(false);

export const useGroupAnnotationSliceReady = () =>
  useAtom(groupAnnotationSliceReadyAtom);
