import { Tooltip } from "@fiftyone/components";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import { useTheme } from "styled-components";

export default ({
  color,
  disabled,
  expanded,
  id,
}: {
  color?: string;
  disabled?: boolean;
  expanded: RecoilState<boolean>;
  id: string;
}) => {
  const [isExpanded, setExpanded] = useRecoilState(expanded);
  const Arrow = isExpanded ? KeyboardArrowUp : KeyboardArrowDown;
  const theme = useTheme();

  if (disabled) {
    return (
      <Tooltip text="disabled" placement="top-center">
        <Arrow
          data-cy={`sidebar-field-arrow-${id}`}
          style={{ margin: 0, color: theme.text.secondary }}
        />
      </Tooltip>
    );
  }

  return (
    <Arrow
      data-cy={`sidebar-field-arrow-${id}`}
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
