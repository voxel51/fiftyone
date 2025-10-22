import { IconButton, InfoIcon, useTheme } from "@fiftyone/components";
import { isInMultiPanelViewAtom } from "@fiftyone/state";
import { Close } from "@mui/icons-material";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import CodeIcon from "@mui/icons-material/Code";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import type { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import tunnel from "tunnel-rat";
import { StatusBarContainer } from "./containers";
import {
  activeNodeAtom,
  cameraViewStatusAtom,
  isStatusBarOnAtom,
  segmentStateAtom,
} from "./state";

const PerfContainer = styled.div`
  position: fixed;
  bottom: 0;
  right: 2em;
  background: rgba(40, 44, 52, 0.85);
  opacity: 0.6;
  border-radius: 8px;
  padding: 16px 24px 12px 24px;
  min-width: 240px;
  box-shadow: none;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.01em;
  align-items: stretch;
`;

const StatRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  width: 100%;
  min-height: 28px;
`;

const StatLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 400;
  opacity: 0.85;
  font-size: 14px;
`;

const StatValue = styled.span`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #bdbdbd;
  font-size: 14px;
  min-width: 60px;
  text-align: right;
`;

const StatBarTrack = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  margin-top: 2px;
  margin-bottom: 2px;
  overflow: hidden;
`;

const FpsHeader = styled(StatRow)<{ $color: string }>`
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: ${(p) => p.$color};
`;

const SegmentHint = styled.div<{ $border: string; $text: string }>`
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0.6;
  color: ${(p) => p.$text};
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  z-index: 1000;
  border: 1px solid ${(p) => p.$border};
  max-width: 340px;
  user-select: none;
  pointer-events: none;
`;

const SegmentHintRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
`;

const CloseBar = styled.div<{ $bg: string }>`
  display: flex;
  width: 100%;
  justify-content: right;
  background-color: ${(p) => p.$bg};
`;

const PerfPanel = styled.div<{ $bg: string }>`
  display: flex;
  flex-direction: column;
  padding-left: 1em;
  justify-content: space-between;
  position: relative;
  height: 100%;
  width: 100%;
  background-color: ${(p) => p.$bg};
`;

const MutedIconButton = styled(IconButton)`
  opacity: 0.5;
`;

const ViewStatusMessage = styled.div<{ $color: string; $multiview: boolean }>`
  position: fixed;
  top: 1em;
  left: ${(p) => (p.$multiview ? "35%" : "50%")};
  transform: translateX(-50%);
  color: ${(p) => p.$color};
  opacity: 0.6;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  user-select: none;
  pointer-events: none;
`;

export const StatusTunnel = tunnel();

const CameraInfo = ({
  cameraRef,
}: {
  cameraRef: RefObject<PerspectiveCamera | OrthographicCamera>;
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

  const StatRowItem = ({
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
      <StatRow>
        <StatLabel>
          {icon}
          {label}
        </StatLabel>
        <StatValue>{value.toLocaleString()}</StatValue>
      </StatRow>
      <StatBarTrack>
        <div
          style={{
            width: `${Math.min(100, (value / statMax[barKey]) * 100)}%`,
            height: "100%",
            background: statBarColors[barKey],
            borderRadius: 3,
            transition: "width 0.4s cubic-bezier(.4,2,.6,1)",
          }}
        />
      </StatBarTrack>
    </div>
  );

  return (
    <PerfContainer>
      <FpsHeader $color={fpsColor}>
        <SpeedIcon style={{ marginRight: 6, fontSize: 20, color: fpsColor }} />
        FPS{" "}
        <StatValue style={{ color: fpsColor }}>
          {perfStats.fps.toFixed(1)}
        </StatValue>
      </FpsHeader>
      <hr
        style={{
          border: "none",
          height: 1,
          background: "rgba(255,255,255,0.08)",
          margin: "4px 0 2px 0",
        }}
      />
      <StatRowItem
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
      <StatRowItem
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
      <StatRowItem
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
      <StatRowItem
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
      <StatRowItem
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
      <StatRowItem
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
    </PerfContainer>
  );
};

export const StatusBar = ({
  cameraRef,
}: {
  cameraRef: RefObject<PerspectiveCamera | OrthographicCamera>;
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPerfStatus, setShowPerfStatus] = useRecoilState(isStatusBarOnAtom);
  const setActiveNode = useSetRecoilState(activeNodeAtom);
  const segmentState = useRecoilValue(segmentStateAtom);
  const cameraViewStatus = useRecoilValue(cameraViewStatusAtom);
  const isMultiviewOn = useRecoilValue(isInMultiPanelViewAtom);

  const springProps = useSpring({
    transform: showPerfStatus ? "translateY(10%)" : "translateY(0%)",
  });

  const onClickHandler = useCallback(() => {
    setShowPerfStatus((prev) => !prev);
    setActiveNode(null);
  }, []);

  const shouldShowViewStatus =
    cameraViewStatus.viewName &&
    cameraViewStatus.timestamp &&
    Date.now() - cameraViewStatus.timestamp < 1000;

  return (
    <animated.div ref={containerRef} style={{ ...springProps }}>
      {!showPerfStatus && (
        <MutedIconButton onClick={onClickHandler}>
          <InfoIcon />
        </MutedIconButton>
      )}

      {shouldShowViewStatus && (
        <ViewStatusMessage
          $color={theme.primary.main}
          $multiview={isMultiviewOn}
        >
          {cameraViewStatus.viewName}
        </ViewStatusMessage>
      )}

      {segmentState.isActive && (
        <SegmentHint $border={theme.primary.main} $text={"#e0e0e0"}>
          <SegmentHintRow>
            <InfoOutlinedIcon
              style={{ fontSize: 14, color: theme.primary.main }}
            />
            Snap to first vertex to close • Double click to finish • Escape to
            cancel
          </SegmentHintRow>
        </SegmentHint>
      )}

      {showPerfStatus && (
        <>
          <PerfStats />
          <StatusBarContainer>
            <CloseBar $bg={`rgba(255, 109, 5, 0.06)`}>
              <IconButton onClick={onClickHandler}>
                <Close />
              </IconButton>
            </CloseBar>
            <PerfPanel $bg={`hsla(208.46, 87%, 53%, 0.20)`}>
              <CameraInfo cameraRef={cameraRef} />
              <StatusTunnel.In>
                <PerfHeadless />
              </StatusTunnel.In>
            </PerfPanel>
          </StatusBarContainer>
        </>
      )}
    </animated.div>
  );
};
