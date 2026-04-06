import { Tooltip } from "@fiftyone/components";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import React from "react";
import type { RecoilState } from "recoil";
import { useRecoilState } from "recoil";
import { useTheme } from "styled-components";
import { FRAME_FILTERING_DISABLED } from "../../../../utils/links";
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
  expanded: RecoilState<boolean>;
  frameFilterDisabledPath?: boolean;
  unindexed?: boolean;
}) => {
  const [isExpanded, setExpanded] = useRecoilState(expanded);
  const theme = useTheme();

  const iconStyle = {
    margin: 0,
    color: theme.text.secondary,
    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
    transition: "transform 200ms ease",
  };

  const arrow = (
    <KeyboardArrowDown
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      style={iconStyle}
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
    <KeyboardArrowDown
      data-cy={`sidebar-field-arrow-enabled-${id}`}
      style={{ cursor: "pointer", ...iconStyle }}
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
    />
  );
};
