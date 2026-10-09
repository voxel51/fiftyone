/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Lookers } from "@fiftyone/state";
import type { MutableRefObject, ReactNode } from "react";

/** Steps between samples. The host's navigation owns paging and debouncing. */
export interface ViewerStepper {
  next: () => void;
  previous: () => void;
}

/** The Inspect/Annotate switch. The host decides whether annotating is offered. */
export interface ViewerModeSwitch {
  annotating: boolean;
  annotate: () => void;
  explore: () => void;
}

export interface ViewerHeaderProps {
  /** The dataset's display name, for the breadcrumb */
  datasetName: string;
  stepper: ViewerStepper;
  /** Omitted when the sample cannot be annotated, which hides the switch */
  mode?: ViewerModeSwitch;
  /** The renderer's looker, which label tagging and selection act on */
  lookerRef?: MutableRefObject<Lookers | undefined>;
  /** A host's own sample utilities, docked beside copy link */
  utilities?: ReactNode;
}
