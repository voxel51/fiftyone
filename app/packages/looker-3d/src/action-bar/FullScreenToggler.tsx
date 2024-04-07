import { fullscreen, fullscreenExit } from "@fiftyone/looker/src/icons";
import * as fos from "@fiftyone/state";
import { IconButton } from "@mui/material";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilState } from "recoil";
import { ActionItem } from "../containers";

const FullScreenIcon = ({ exit }: { exit: boolean }) => {
  const ref = useRef<HTMLDivElement>();

  useEffect(() => {
    if (ref) {
      ref.current.innerHTML = "";
      ref.current.appendChild(exit ? fullscreenExit : fullscreen);
    }
  }, [exit]);

  return <div style={{ display: "flex" }} ref={ref} />;
};

export const FullScreenToggler = () => {
  const [isFullScreen, setIsFullScreen] = useRecoilState(fos.fullscreen);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  return (
    <ActionItem title="Toggle Fullscreen">
      <IconButton onClick={toggleFullScreen} sx={{ fontSize: 24, padding: 0 }}>
        {isFullScreen ? (
          <FullScreenIcon exit />
        ) : (
          <FullScreenIcon exit={false} />
        )}
      </IconButton>
    </ActionItem>
  );
};
