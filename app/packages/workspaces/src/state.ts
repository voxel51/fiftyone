/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { atom } from "recoil";

const { COLOR_OPTIONS } = fos.constants;

export const workspaceEditorStateAtom = atom({
  key: "workspaceEditorState",
  default: {
    open: false,
    old_name: "",
    name: "",
    description: "",
    color: COLOR_OPTIONS[0].color,
    edit: false,
  },
});

export interface Workspace {
  description: string;
  color: string;
  name: string;
}

export const savedWorkspacesAtom = atom({
  key: "savedWorkspacesAtom",
  default: {
    initialized: false,
    workspaces: [] as Workspace[],
    dataset: "",
  },
});
