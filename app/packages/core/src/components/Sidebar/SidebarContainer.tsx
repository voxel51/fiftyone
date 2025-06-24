import { Resizable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { unstable_createMuiStrictModeTheme } from "@mui/material";
import React from "react";
import { useRecoilState, useResetRecoilState } from "recoil";

const SidebarContainer = ({ modal, children }) => {
  const [width, setWidth] = useRecoilState(fos.sidebarWidth(modal));
  const resetWidth = useResetRecoilState(fos.sidebarWidth(modal));
  const muiTheme = unstable_createMuiStrictModeTheme();

  return (
    <Resizable
      data-cy="sidebar"
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      direction={modal ? "left" : "right"}
      onResizeStop={(e, direction, ref, { width: delta }) => {
        setWidth(width + delta);
      }}
      onResizeReset={resetWidth}
      style={{
        borderTopRightRadius: 8,
        zIndex: modal ? muiTheme.zIndex.tooltip + 1 : undefined,
      }}
    >
      {children}
    </Resizable>
  );
};

export default SidebarContainer;
