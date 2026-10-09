import {
  cssVar,
  KeyboardArrowDownIcon,
  KeyboardArrowRightIcon,
  TextColor,
  Tooltip,
} from "@voxel51/voodo";
import { type ReverbState, useReverbState } from "@fiftyone/reverb";
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
  const arrow = (
    <span
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      style={{ display: "flex" }}
    >
      <Arrow size={16} color={TextColor.Secondary} />
    </span>
  );

  if (frameFilterDisabledPath) {
    return (
      <Tooltip
        interactive
        content={
          <DisabledReason
            text={"frame filtering is disabled"}
            href={FRAME_FILTERING_DISABLED}
          />
        }
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
        color: cssVar.color.text.secondary,
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
