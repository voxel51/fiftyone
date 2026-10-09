/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ChevronLeftIcon, ChevronRightIcon } from "@voxel51/voodo";
import styles from "../ViewerHeader.module.css";
import type { ViewerStepper } from "../types";
import HeaderAction from "./HeaderAction";

/** Previous and next sample; the arrow keys do the same. */
const Stepper = ({
  hasNext,
  hasPrevious,
  stepper,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  stepper: ViewerStepper;
}) => {
  if (!hasNext && !hasPrevious) return null;

  return (
    <div className={styles.stepper}>
      <HeaderAction
        data-cy="nav-left-button"
        disabled={!hasPrevious}
        icon={ChevronLeftIcon}
        label="Previous sample"
        tooltip="Previous sample (←)"
        onClick={stepper.previous}
      />
      <HeaderAction
        data-cy="nav-right-button"
        disabled={!hasNext}
        icon={ChevronRightIcon}
        label="Next sample"
        tooltip="Next sample (→)"
        onClick={stepper.next}
      />
    </div>
  );
};

export default Stepper;
