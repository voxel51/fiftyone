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
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import type { PerspectiveCamera, Vector3 } from "three";
import tunnel from "tunnel-rat";
import {
  CameraInfoContainer,
  CameraPositionText,
  PerfStatsContainer,
  PerfStatsDivider,
  PerfStatsFPSValue,
  PerfStatsHeaderContainer,
  StatBarInner,
  StatBarOuterContainer,
  StatIconWrapper,
  StatLabelContainer,
  StatRowContainer,
  StatsRowWrapper,
  StatusBarContainer,
  StatusBarHeaderContainer,
  StatusBarInfoContainer,
  StatValueContainer,
} from "./containers";
import { activeNodeAtom, isStatusBarOnAtom } from "./state";

const STAT_BAR_COLORS = {
  // blue
  calls: "#38bdf8" as const,
  // purple
  triangles: "#a78bfa" as const,
  // pink
  points: "#f472b6" as const,
  // yellow
  geometries: "#fbbf24" as const,
  // green
  textures: "#34d399" as const,
  // light blue
  programs: "#60a5fa" as const,
};

// note: this is reasonably arbitrary
const STAT_MAX = {
  calls: 1000 as const,
  triangles: 1000000 as const,
  points: 1000000 as const,
  geometries: 1000 as const,
  textures: 1000 as const,
  programs: 100 as const,
};

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
    <CameraInfoContainer>
      <CameraIcon fontSize="small" />
      <CameraPositionText>
        <Text variant="caption">
          {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)},{" "}
          {cameraPosition.z.toFixed(2)}
        </Text>
      </CameraPositionText>
    </CameraInfoContainer>
  );
};

const StatRow = ({
  icon,
  label,
  value,
  barKey,
}: {
  icon: JSX.Element;
  label: string;
  value: number | undefined;
  barKey: keyof typeof STAT_BAR_COLORS;
}) => {
  const barWidth = `${Math.min(
    100,
    ((value !== undefined ? value : 0) / STAT_MAX[barKey]) * 100
  )}%`;

  return (
    <StatsRowWrapper>
      <StatRowContainer>
        <StatLabelContainer>
          <StatIconWrapper color={STAT_BAR_COLORS[barKey]}>
            {icon}
          </StatIconWrapper>
          {label}
        </StatLabelContainer>
        <StatValueContainer>{value?.toLocaleString()}</StatValueContainer>
      </StatRowContainer>
      <StatBarOuterContainer>
        <StatBarInner width={barWidth} background={STAT_BAR_COLORS[barKey]} />
      </StatBarOuterContainer>
    </StatsRowWrapper>
  );
};

const PerfStats = () => {
  const [perfStats, setPerfStats] = useState<{
    fps: number | undefined;
    calls: number | undefined;
    triangles: number | undefined;
    points: number | undefined;
    geometries: number | undefined;
    textures: number | undefined;
    programs: number | undefined;
  }>({
    fps: undefined,
    calls: undefined,
    triangles: undefined,
    points: undefined,
    geometries: undefined,
    textures: undefined,
    programs: undefined,
  });

  useEffect(() => {
    const updateStats = () => {
      const perfState = getPerf();
      if (!perfState) return;

      setPerfStats({
        fps: perfState.log?.fps || undefined,
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

  // we want to show green for 50+ fps, yellow for 30-50, and red for <30
  const fpsColor =
    perfStats.fps !== undefined && perfStats.fps > 50
      ? "#4ade80"
      : perfStats.fps !== undefined && perfStats.fps > 30
      ? "#facc15"
      : "#f87171";

  const isLoading = perfStats.fps === undefined;

  if (isLoading) {
    return (
      <PerfStatsContainer>
        <div style={{ textAlign: "center", padding: "1em" }}>
          <span role="status" aria-live="polite">
            Loading stats...
          </span>
        </div>
      </PerfStatsContainer>
    );
  }

  return (
    <PerfStatsContainer>
      <PerfStatsHeaderContainer style={{ color: fpsColor }}>
        <SpeedIcon style={{ marginRight: 6, fontSize: 20, color: fpsColor }} />
        FPS
        <PerfStatsFPSValue color={fpsColor}>
          {perfStats.fps!.toFixed(1)}
        </PerfStatsFPSValue>
      </PerfStatsHeaderContainer>
      <PerfStatsDivider />
      <StatRow
        icon={
          <CallSplitIcon
            fontSize="small"
            style={{ color: STAT_BAR_COLORS.calls }}
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
            style={{ color: STAT_BAR_COLORS.triangles }}
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
            style={{ color: STAT_BAR_COLORS.points }}
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
            style={{ color: STAT_BAR_COLORS.geometries }}
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
            style={{ color: STAT_BAR_COLORS.textures }}
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
            style={{ color: STAT_BAR_COLORS.programs }}
          />
        }
        label="Shaders"
        value={perfStats.programs}
        barKey="programs"
      />
    </PerfStatsContainer>
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
            <StatusBarHeaderContainer>
              <IconButton onClick={onClickHandler}>
                <Close />
              </IconButton>
            </StatusBarHeaderContainer>
            <StatusBarInfoContainer>
              <CameraInfo cameraRef={cameraRef} />
              <StatusTunnel.In>
                <PerfHeadless />
              </StatusTunnel.In>
            </StatusBarInfoContainer>
          </StatusBarContainer>
        </>
      )}
    </animated.div>
  );
};
