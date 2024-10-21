import { Tooltip } from "@fiftyone/components";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
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
  const Arrow = isExpanded ? KeyboardArrowUp : KeyboardArrowDown;
  const theme = useTheme();
  const arrow = (
    <Arrow
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      style={{ margin: 0, color: theme.text.secondary }}
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
    <Arrow
      data-cy={`sidebar-field-arrow-enabled-${id}`}
      style={{
        cursor: "pointer",
        margin: 0,
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
    />
  );
};
