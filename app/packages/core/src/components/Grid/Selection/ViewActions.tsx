import type {
  GridSelectionAction,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { useSetView } from "@fiftyone/state";
import {
  FilterAltIcon,
  FilterAltOffIcon,
  type IconInput,
} from "@voxel51/voodo";
import ActionEntry from "./ActionEntry";

type Stage = "Select" | "Exclude";

function ViewAction({
  context,
  disabledReason,
  surface = "toolbar",
  stage,
  label,
  icon,
}: GridSelectionActionProps & {
  stage: Stage;
  label: string;
  icon: IconInput;
}) {
  const setView = useSetView();
  const entry = (
    <ActionEntry
      label={label}
      icon={icon}
      surface={surface}
      disabledReason={disabledReason}
      onClick={() => {
        setView((current = []) => [
          ...current,
          {
            _cls: `fiftyone.core.stages.${stage}`,
            kwargs: [
              ["sample_ids", context.groups.map((group) => group.episodeId)],
            ],
          },
        ]);
      }}
    />
  );
  return entry;
}

const base = {
  placement: "more",
  supports: () => true,
  scope: "explicit",
  memberKinds: ["episode", "segment"],
} satisfies Partial<GridSelectionAction>;

/** Narrow the grid to the selected parents; the selection itself is kept. */
export const showOnlySelectedAction: GridSelectionAction = {
  ...base,
  id: "fiftyone:show-only-selected",
  order: 30,
  label: "Show only selected",
  Component: (props) => (
    <ViewAction
      {...props}
      stage="Select"
      label="Show only selected"
      icon={FilterAltIcon}
    />
  ),
};

/** Hide the selected parents from the grid; the selection itself is kept. */
export const hideSelectedAction: GridSelectionAction = {
  ...base,
  id: "fiftyone:hide-selected",
  order: 31,
  label: "Hide selected",
  Component: (props) => (
    <ViewAction
      {...props}
      stage="Exclude"
      label="Hide selected"
      icon={FilterAltOffIcon}
    />
  ),
};
