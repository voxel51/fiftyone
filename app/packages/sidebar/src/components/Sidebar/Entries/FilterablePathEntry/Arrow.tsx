import { KeyboardArrowDownIcon, KeyboardArrowUpIcon } from "@voxel51/voodo";
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
  const Arrow = isExpanded ? KeyboardArrowUpIcon : KeyboardArrowDownIcon;
  const theme = useTheme();
  const arrow = (
    <Arrow
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      size={24}
      color={theme.text.secondary}
    />
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
      <Arrow size={24} />
    </span>
  );
};
