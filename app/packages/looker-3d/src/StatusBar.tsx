import { IconButton, InfoIcon } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import CameraIcon from "@mui/icons-material/Videocam";
import Text from "@mui/material/Typography";
import { animated, useSpring } from "@react-spring/web";
import { Perf } from "r3f-perf";
import { RefObject, useEffect, useRef, useState } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import tunnel from "tunnel-rat";
import { StatusBarContainer } from "./containers";

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
        <Text variant="caption">
          {cameraRef.current.rotation.x.toFixed(2)},{" "}
          {cameraRef.current.rotation.y.toFixed(2)},{" "}
          {cameraRef.current.rotation.z.toFixed(2)}
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
  const [showStatus, setShowStatus] = useState(false);

  const springProps = useSpring({
    transform: showStatus ? "translateY(10%)" : "translateY(0%)",
  });

  return (
    <animated.div ref={containerRef} style={{ ...springProps }}>
      {!showStatus && (
        <IconButton
          style={{ opacity: 0.5 }}
          onClick={() => {
            setShowStatus(true);
          }}
        >
          <InfoIcon />
        </IconButton>
      )}

      {showStatus && (
        <StatusBarContainer>
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "right",
              backgroundColor: "rgb(255 109 5 / 6%)",
            }}
          >
            <IconButton
              onClick={() => {
                setShowStatus(false);
              }}
            >
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
