import { Resizable } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useTheme as useMUITheme } from "@mui/material";
import type { ReactNode } from "react";
import { useReverbState, useResetReverbState } from "@fiftyone/reverb";

const SidebarContainer = ({
  children,
  modal,
}: {
  children: ReactNode;
  modal: boolean;
}) => {
  const [width, setWidth] = useReverbState(fos.sidebarWidth(modal));
  const resetWidth = useResetReverbState(fos.sidebarWidth(modal));
  const muiTheme = useMUITheme();

  return (
    <Resizable
      data-cy="sidebar"
      size={{ height: "100%", width }}
      minWidth={260}
      maxWidth={600}
      direction={modal ? "left" : "right"}
      onResizeStop={(_e, _direction, _ref, { width: delta }) => {
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
