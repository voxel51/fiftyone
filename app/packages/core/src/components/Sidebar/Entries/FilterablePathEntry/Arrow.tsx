import { Tooltip } from "@fiftyone/components";
import useLightningUnlocked from "@fiftyone/state/src/hooks/useLightningUnlocked";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import { useTheme } from "styled-components";
import AddIndex from "./AddIndex";

export default ({
  id,
  color,
  disabled,
  expanded,
  unindexed,
}: {
  id: string;
  color?: string;
  disabled?: boolean;
  expanded: RecoilState<boolean>;
  unindexed?: boolean;
}) => {
  const [isExpanded, setExpanded] = useRecoilState(expanded);
  const Arrow = isExpanded ? KeyboardArrowUp : KeyboardArrowDown;
  const theme = useTheme();
  const unlocked = useLightningUnlocked();
  const arrow = (
    <Arrow
      data-cy={`sidebar-field-arrow-disabled-${id}`}
      style={{ margin: 0, color: theme.text.secondary }}
    />
  );

  if (disabled) {
    return arrow;
  }

  if (unindexed && !unlocked) {
    return (
      <Tooltip text={<AddIndex />} placement="top-center">
        {arrow}
      </Tooltip>
    );
  }

  return (
    <Arrow
      data-cy={`sidebar-field-arrow-enabled-${id}`}
      style={{
        cursor: "pointer",
        margin: 0,
        color: color ?? theme.text.primary,
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
