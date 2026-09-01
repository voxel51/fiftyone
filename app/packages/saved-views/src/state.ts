/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { atom } from "recoil";

export const viewSearchTerm = atom<string>({
  key: "viewSearchTerm",
  default: "",
});

export const viewDialogOpen = atom<boolean>({
  key: "viewDialogOpen",
  default: false,
});

export interface ViewDialogContent {
  name: string;
  description: string;
  color: string;
  /** Creating a new view, vs. editing an existing one. */
  isCreating: boolean;
}

export const viewDialogContent = atom<ViewDialogContent>({
  key: "viewDialogContent",
  default: {
    name: "",
    description: "",
    color: fos.constants.DEFAULT_COLOR,
    isCreating: true,
  },
});

export interface DatasetView {
  id: string;
  name: string;
  slug: string;
  datasetId: string;
  color: string | null;
  description: string | null;
  viewStages: readonly string[];
}
