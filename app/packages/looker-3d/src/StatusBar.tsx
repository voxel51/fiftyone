import { IconButton, InfoIcon } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import CameraIcon from "@mui/icons-material/Videocam";
import Text from "@mui/material/Typography";
import { animated, useSpring } from "@react-spring/web";
import { Perf } from "r3f-perf";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { PerspectiveCamera, Vector3 } from "three";
import tunnel from "tunnel-rat";
import { StatusBarContainer } from "./containers";
import { activeNodeAtom, isStatusBarOnAtom } from "./state";

export const StatusTunnel = tunnel();

const CameraInfo = ({
  cameraRef,
}: {
  cameraRef: RefObject<PerspectiveCamera>;
}) => {
  const [cameraPosition, setCameraPosition] = useState<Vector3>();

  useEffect(() => {
    let animationId = -1;

    const updatePosition = () => {
      animationId = requestAnimationFrame(() => {
        updatePosition();
        if (cameraRef.current) {
          setCameraPosition(cameraRef.current.position.clone());
        }
      });
    };

    updatePosition();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [cameraRef]);

  if (!cameraPosition || !cameraRef.current) {
    return null;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", opacity: 0.5 }}>
      <CameraIcon fontSize="small" />
      <div style={{ marginLeft: "0.5em", marginTop: "-5px" }}>
        <Text variant="caption">
          {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)},{" "}
          {cameraPosition.z.toFixed(2)}
        </Text>
      </div>
    </div>
  );
};

export const StatusBar = ({
  cameraRef,
}: {
  cameraRef: RefObject<PerspectiveCamera>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPerfStatus, setShowPerfStatus] = useRecoilState(isStatusBarOnAtom);
  const setActiveNode = useSetRecoilState(activeNodeAtom);

  const springProps = useSpring({
    transform: showPerfStatus ? "translateY(10%)" : "translateY(0%)",
  });

  const onClickHandler = useCallback(() => {
    setShowPerfStatus((prev) => !prev);
    setActiveNode(null);
  }, []);

  return (
    <animated.div ref={containerRef} style={{ ...springProps }}>
      {!showPerfStatus && (
        <IconButton style={{ opacity: 0.5 }} onClick={onClickHandler}>
          <InfoIcon />
        </IconButton>
      )}

      {showPerfStatus && (
        <StatusBarContainer>
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "right",
              backgroundColor: "rgb(255 109 5 / 6%)",
            }}
          >
            <IconButton onClick={onClickHandler}>
              <Close />
            </IconButton>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              paddingLeft: "1em",
              justifyContent: "space-between",
              position: "relative",
              height: "100%",
              width: "100%",
              backgroundColor: "hsl(208.46deg 87% 53% / 20%)",
            }}
          >
            <CameraInfo cameraRef={cameraRef} />
            <StatusTunnel.In>
              <Perf style={{ position: "absolute", top: "4em" }} />
            </StatusTunnel.In>
          </div>
        </StatusBarContainer>
      )}
    </animated.div>
  );
};
