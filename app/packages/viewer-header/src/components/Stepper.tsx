/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ChevronLeftStrokeIcon,
  ChevronRightStrokeIcon,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { ModalPosition } from "@fiftyone/state";
import styles from "../ViewerHeader.module.css";
import type { ViewerStepper } from "../types";
import HeaderAction from "./HeaderAction";

/**
 * Previous and next sample, and where it is: "n / total", or "n of many
 * samples" when counting the total timed out.
 */
const Stepper = ({
  hasNext,
  hasPrevious,
  position,
  stepper,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  position: ModalPosition | null;
  stepper: ViewerStepper;
}) => {
  if (!hasNext && !hasPrevious) return null;

  return (
    <div className={styles.stepper}>
      <HeaderAction
        data-cy="nav-left-button"
        disabled={!hasPrevious}
        icon={ChevronLeftStrokeIcon}
        label="Previous sample"
        tooltip="Previous sample (←)"
        onClick={stepper.previous}
      />
      {position && (
        <Text
          className={styles.position}
          color={TextColor.Tertiary}
          data-cy="viewer-header-position"
          variant={TextVariant.CodePrimary}
        >
          <Text color={TextColor.Secondary} variant={TextVariant.CodePrimary}>
            {position.index.toLocaleString()}
          </Text>
          {position.total === null ? (
            " of many samples"
          ) : (
            <>
              <span className={styles.slash}>/</span>
              {position.total.toLocaleString()}
            </>
          )}
        </Text>
      )}
      <HeaderAction
        data-cy="nav-right-button"
        disabled={!hasNext}
        icon={ChevronRightStrokeIcon}
        label="Next sample"
        tooltip="Next sample (→)"
        onClick={stepper.next}
      />
    </div>
  );
};

export default Stepper;
