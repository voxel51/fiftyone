/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ModalMode } from "@fiftyone/state";
import { InspectIcon, PencilIcon, RichButtonGroup } from "@voxel51/voodo";
import type { HTMLAttributes } from "react";
import type { ViewerModeSwitch } from "../types";

// the switch keeps the selectors the sidebar's old tabs had
const testId = (id: string): HTMLAttributes<HTMLDivElement> =>
  ({ "data-cy": id }) as HTMLAttributes<HTMLDivElement>;

/** Inspect or Annotate the sample. */
const ModeSwitch = ({ annotate, annotating, explore }: ViewerModeSwitch) => (
  <RichButtonGroup
    exclusive
    buttons={[
      {
        id: ModalMode.EXPLORE,
        data: {
          ...testId(ModalMode.EXPLORE),
          active: !annotating,
          icon: InspectIcon,
          label: "Inspect",
          onClick: explore,
        },
      },
      {
        id: ModalMode.ANNOTATE,
        data: {
          ...testId(ModalMode.ANNOTATE),
          active: annotating,
          icon: PencilIcon,
          label: "Annotate",
          onClick: annotate,
        },
      },
    ]}
  />
);

export default ModeSwitch;
