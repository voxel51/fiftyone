/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ModalGroupsModeController,
  useModalContext,
  useModalModeSwitch,
} from "@fiftyone/core";
import { ViewerHeader, type ViewerStepper } from "@fiftyone/viewer-header";
import { useMemo } from "react";
import { useProduct } from "../product";

/** The sample page's header, with the modal's navigation and mode handed in. */
export default function SamplePageHeader() {
  const dataset = useProduct().useDatasetDisplayName();
  const { activeLookerRef, stepperRef } = useModalContext();
  const { annotate, annotating, explore, groups, shown } = useModalModeSwitch();

  const stepper = useMemo<ViewerStepper>(
    () => ({
      next: () => stepperRef?.current?.next(),
      previous: () => stepperRef?.current?.previous(),
    }),
    [stepperRef],
  );

  return (
    <>
      {groups && <ModalGroupsModeController />}
      <ViewerHeader
        datasetName={dataset}
        lookerRef={activeLookerRef}
        mode={shown ? { annotate, annotating, explore } : undefined}
        stepper={stepper}
      />
    </>
  );
}
