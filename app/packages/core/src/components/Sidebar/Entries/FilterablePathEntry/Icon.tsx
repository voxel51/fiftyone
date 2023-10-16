import * as fos from "@fiftyone/state";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { pathIsExpanded } from "../utils";

const Icon = ({
  disabled,
  modal,
  path,
}: {
  disabled: boolean;
  modal: boolean;
  path: string;
}) => {
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const [expanded, setExpanded] = useRecoilState(
    pathIsExpanded({ modal, path: expandedPath })
  );

  if (!disabled) {
    const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
    <Arrow
      key="arrow"
      data-cy={`sidebar-field-arrow-${path}`}
      style={{ cursor: "pointer", margin: 0 }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(!expanded);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onMouseUp={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    />;
  }
};

export default Icon;
