import { useCurrentDatasetPermission, useMutation } from "@fiftyone/hooks";
import { Pin } from "@fiftyone/teams-components";
import { CAN_PIN_UNPIN_RUN, runsPinMutation } from "@fiftyone/teams-state";
import useRefresher, { PINNED_RUNS_REFRESHER_ID } from "../utils/useRefresher";
import { PinPropsType } from "@fiftyone/teams-components/src/Pin";

export default function RunsPin(props: RunsPinPropsType) {
  const { id, pinned, isHovering, onToggle, pinProps = {} } = props;
  const [togglePin, togglingPin] = useMutation(runsPinMutation);
  const [refresh] = useRefresher(PINNED_RUNS_REFRESHER_ID);
  const canPinUnpin = useCurrentDatasetPermission([CAN_PIN_UNPIN_RUN]);

  if (!canPinUnpin) return null;

  return (
    <Pin
      pinned={pinned}
      isHovering={isHovering}
      handleTogglePin={(e, pinned) => {
        togglePin({
          variables: { operationId: id, pinned },
          successMessage: `Successfully ${pinned ? "pinned" : "unpinned"} run`,
          errorMessage: "Failed to pin run",
          onSuccess: () => {
            if (onToggle) onToggle();
            if (refresh) refresh();
          },
        });
      }}
      loading={togglingPin}
      resource="run"
      styles={{ cursor: "pointer" }}
      {...pinProps}
    />
  );
}

type RunsPinPropsType = {
  id: string;
  pinned: boolean;
  isHovering?: boolean;
  onToggle?: () => void;
  pinProps?: PinPropsType;
};
