import { IconButton, InfoIcon } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import CameraIcon from "@mui/icons-material/Videocam";
import Text from "@mui/material/Typography";
import { animated, useSpring } from "@react-spring/web";
import { getPerf, PerfHeadless } from "r3f-perf";
import {
  CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import type { PerspectiveCamera, Vector3 } from "three";
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

const PerfStats = () => {
  const [perfStats, setPerfStats] = useState({
    fps: 0,
    calls: 0,
    triangles: 0,
    points: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  });

  useEffect(() => {
    const updateStats = () => {
      const perfState = getPerf() as any;
      if (!perfState) return;

      setPerfStats({
        fps: perfState.log?.fps || 0,
        calls: perfState.gl?.info?.render?.calls || 0,
        triangles: perfState.gl?.info?.render?.triangles || 0,
        points: perfState.gl?.info?.render?.points || 0,
        geometries: perfState.gl?.info?.memory?.geometries || 0,
        textures: perfState.gl?.info?.memory?.textures || 0,
        programs: perfState.gl?.info?.programs?.length || 0,
      });
    };

    const interval = setInterval(updateStats, 500);
    return () => clearInterval(interval);
  }, []);

  const statStyle: CSSProperties = {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#ffffff",
    margin: "2px 0",
    textShadow: "1px 1px 1px rgba(0,0,0,0.5)",
  };

  const containerStyle: CSSProperties = {
    position: "fixed",
    bottom: "0",
    right: "2em",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: "4px",
    padding: "8px 12px",
    minWidth: "180px",
  };

  return (
    <div style={containerStyle}>
      <div style={statStyle}>FPS: {perfStats.fps.toFixed(1)}</div>
      <div style={statStyle}>Draw Calls: {perfStats.calls}</div>
      <div style={statStyle}>
        Triangles: {perfStats.triangles.toLocaleString()}
      </div>
      <div style={statStyle}>Points: {perfStats.points}</div>
      <div style={statStyle}>Geometries: {perfStats.geometries}</div>
      <div style={statStyle}>Textures: {perfStats.textures}</div>
      <div style={statStyle}>Shaders: {perfStats.programs}</div>
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
        <>
          <PerfStats />
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
                <PerfHeadless />
              </StatusTunnel.In>
            </div>
          </StatusBarContainer>
        </>
      )}
    </animated.div>
  );
};
