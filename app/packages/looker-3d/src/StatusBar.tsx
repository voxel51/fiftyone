import { IconButton, InfoIcon } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import CodeIcon from "@mui/icons-material/Code";
import LayersIcon from "@mui/icons-material/Layers";
import SpeedIcon from "@mui/icons-material/Speed";
import TextureIcon from "@mui/icons-material/Texture";
import TimelineIcon from "@mui/icons-material/Timeline";
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

  const containerStyle: CSSProperties = {
    position: "fixed",
    bottom: "0",
    right: "2em",
    background: "rgba(40, 44, 52, 0.85)",
    opacity: 0.6,
    borderRadius: "8px",
    padding: "16px 24px 12px 24px",
    minWidth: "240px",
    boxShadow: "none",
    backdropFilter: "blur(4px)",
    border: "1px solid rgba(255,255,255,0.10)",
    zIndex: 1000,
    color: "#e0e0e0",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    // fontFamily: "'Inter', 'Roboto', 'Arial', sans-serif",
    fontSize: "12px",
    letterSpacing: "0.01em",
    alignItems: "stretch",
  };

  const statRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5em",
    width: "100%",
    minHeight: 28,
  };

  const statLabelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.4em",
    fontWeight: 400,
    opacity: 0.85,
    fontSize: "14px",
  };

  const statValueStyle: CSSProperties = {
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "#bdbdbd",
    fontSize: "14px",
    minWidth: 60,
    textAlign: "right" as const,
  };

  const statBarContainer: CSSProperties = {
    width: "100%",
    height: 6,
    background: "rgba(255,255,255,0.07)",
    borderRadius: 3,
    marginTop: 2,
    marginBottom: 2,
    overflow: "hidden",
  };

  const statBarColors = {
    // blue
    calls: "#38bdf8",
    // purple
    triangles: "#a78bfa",
    // pink
    points: "#f472b6",
    // yellow
    geometries: "#fbbf24",
    // green
    textures: "#34d399",
    // light blue
    programs: "#60a5fa",
  };

  // note: this is reasonably arbitrary
  const statMax = {
    calls: 1000,
    triangles: 1000000,
    points: 1000000,
    geometries: 1000,
    textures: 1000,
    programs: 100,
  };

  // we want to show green for 50+ fps, yellow for 30-50, and red for <30
  const fpsColor =
    perfStats.fps > 50 ? "#4ade80" : perfStats.fps > 30 ? "#facc15" : "#f87171";

  const StatRow = ({
    icon,
    label,
    value,
    barKey,
  }: {
    icon: JSX.Element;
    label: string;
    value: number;
    barKey: keyof typeof statBarColors;
  }) => (
    <div style={{ width: "100%" }}>
      <div style={statRowStyle}>
        <span style={statLabelStyle}>
          {icon}
          {label}
        </span>
        <span style={statValueStyle}>{value.toLocaleString()}</span>
      </div>
      <div style={statBarContainer}>
        <div
          style={{
            width: `${Math.min(100, (value / statMax[barKey]) * 100)}%`,
            height: "100%",
            background: statBarColors[barKey],
            borderRadius: 3,
            transition: "width 0.4s cubic-bezier(.4,2,.6,1)",
          }}
        />
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div
        style={{
          ...statRowStyle,
          justifyContent: "center",
          fontSize: "15px",
          fontWeight: 700,
          color: fpsColor,
        }}
      >
        <SpeedIcon style={{ marginRight: 6, fontSize: 20, color: fpsColor }} />
        FPS{" "}
        <span style={{ ...statValueStyle, color: fpsColor }}>
          {perfStats.fps.toFixed(1)}
        </span>
      </div>
      <hr
        style={{
          border: "none",
          height: 1,
          background: "rgba(255,255,255,0.08)",
          margin: "4px 0 2px 0",
        }}
      />
      <StatRow
        icon={
          <CallSplitIcon
            fontSize="small"
            style={{ color: statBarColors.calls }}
          />
        }
        label="Draw Calls"
        value={perfStats.calls}
        barKey="calls"
      />
      <StatRow
        icon={
          <TimelineIcon
            fontSize="small"
            style={{ color: statBarColors.triangles }}
          />
        }
        label="Triangles"
        value={perfStats.triangles}
        barKey="triangles"
      />
      <StatRow
        icon={
          <BubbleChartIcon
            fontSize="small"
            style={{ color: statBarColors.points }}
          />
        }
        label="Points"
        value={perfStats.points}
        barKey="points"
      />
      <StatRow
        icon={
          <LayersIcon
            fontSize="small"
            style={{ color: statBarColors.geometries }}
          />
        }
        label="Geometries"
        value={perfStats.geometries}
        barKey="geometries"
      />
      <StatRow
        icon={
          <TextureIcon
            fontSize="small"
            style={{ color: statBarColors.textures }}
          />
        }
        label="Textures"
        value={perfStats.textures}
        barKey="textures"
      />
      <StatRow
        icon={
          <CodeIcon
            fontSize="small"
            style={{ color: statBarColors.programs }}
          />
        }
        label="Shaders"
        value={perfStats.programs}
        barKey="programs"
      />
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
