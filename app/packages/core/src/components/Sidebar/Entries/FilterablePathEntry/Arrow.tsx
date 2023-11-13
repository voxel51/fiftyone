import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import React from "react";
import { RecoilState, useRecoilState } from "recoil";

export default ({
  color,
  expanded,
  id,
}: {
  color?: string;
  expanded: RecoilState<boolean>;
  id: string;
}) => {
  const [isExpanded, setExpanded] = useRecoilState(expanded);
  const Arrow = isExpanded ? KeyboardArrowUp : KeyboardArrowDown;
  return (
    <Arrow
      key="arrow"
      data-cy={`sidebar-field-arrow-${id}`}
      style={{ cursor: "pointer", margin: 0, color }}
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
