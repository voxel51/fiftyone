import { KeyboardArrowDownIcon, KeyboardArrowRightIcon } from "@voxel51/voodo";
import { Tooltip } from "@fiftyone/components";
import { type ReverbState, useReverbState } from "@fiftyone/reverb";
import { useTheme } from "styled-components";
import { FRAME_FILTERING_DISABLED } from "@fiftyone/utilities";
import DisabledReason from "./DisabledReason";

export default ({
  id,
  disabled,
  expanded,
  frameFilterDisabledPath,
}: {
  id: string;
  color?: string;
  disabled?: boolean;
  expanded: ReverbState<boolean>;
  frameFilterDisabledPath?: boolean;
  unindexed?: boolean;
}) => {
  const [isExpanded, setExpanded] = useReverbState(expanded);
  const Arrow = isExpanded ? KeyboardArrowDownIcon : KeyboardArrowRightIcon;
  const theme = useTheme();
  const arrow = (
    <span
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      style={{ display: "flex" }}
    >
      <Arrow size={16} color={theme.text.secondary} />
    </span>
  );

  if (frameFilterDisabledPath) {
    return (
      <Tooltip
        text={
          <DisabledReason
            text={"frame filtering is disabled"}
            href={FRAME_FILTERING_DISABLED}
          />
        }
        placement="top-center"
      >
        {arrow}
      </Tooltip>
    );
  }

  if (disabled) {
    return arrow;
  }

  return (
    <span
      data-cy={`sidebar-field-arrow-enabled-${id}`}
      style={{
        cursor: "pointer",
        display: "flex",
        color: theme.text.secondary,
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded((v) => !v);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onMouseUp={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <Arrow size={16} />
    </span>
  );
};
