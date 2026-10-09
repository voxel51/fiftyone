/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ModalMode } from "@fiftyone/state";
import { PenLineIcon, ScanEyeIcon, Size, ToggleSwitch } from "@voxel51/voodo";
import type { ViewerModeSwitch } from "../types";
import styles from "../ViewerHeader.module.css";

const ICON_SIZE = 14;

// the labels keep the selectors the sidebar's old tabs had
const ModeLabel = ({
  icon: Icon,
  id,
  label,
}: {
  icon: typeof ScanEyeIcon;
  id: string;
  label: string;
}) => (
  <span className={styles.mode} data-cy={id}>
    <Icon size={ICON_SIZE} />
    <span className={styles.modeLabel}>{label}</span>
  </span>
);

/** Inspect or Annotate the sample. */
const ModeSwitch = ({ annotate, annotating, explore }: ViewerModeSwitch) => (
  <ToggleSwitch
    className={styles.modeSwitch}
    index={annotating ? 1 : 0}
    onChange={(index) => (index ? annotate() : explore())}
    size={Size.Sm}
    tabPanelClassName={styles.hidden}
    tabs={[
      {
        id: ModalMode.EXPLORE,
        data: {
          content: null,
          label: (
            <ModeLabel
              icon={ScanEyeIcon}
              id={ModalMode.EXPLORE}
              label="Inspect"
            />
          ),
        },
      },
      {
        id: ModalMode.ANNOTATE,
        data: {
          content: null,
          label: (
            <ModeLabel
              icon={PenLineIcon}
              id={ModalMode.ANNOTATE}
              label="Annotate"
            />
          ),
        },
      },
    ]}
  />
);

export default ModeSwitch;
