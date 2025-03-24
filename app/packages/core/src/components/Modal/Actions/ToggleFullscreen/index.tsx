import { PillButton } from "@fiftyone/components";
import { fullscreen } from "@fiftyone/state";
import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import React from "react";
import { useRecoilState } from "recoil";

const ToggleFullscreen = () => {
  const [fullScreen, setFullScreen] = useRecoilState(fullscreen);

  return (
    <PillButton
      icon={fullScreen ? <FullscreenExit /> : <Fullscreen />}
      open={fullScreen}
      highlight={fullScreen}
      onClick={() => setFullScreen(!fullScreen)}
      tooltipPlacement="bottom"
      title={fullScreen ? "Exit fullscreen (f)" : "Enter fullscreen (f)"}
      data-cy="action-toggle-fullscreen"
    />
  );
};

export default ToggleFullscreen;
