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
import { cssVar } from "@voxel51/voodo";
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
import { AnnotationTips } from "./AnnotationTips";
import { StatusBarContainer } from "./containers";
import {
  activeNodeAtom,
  activeSegmentationStateAtom,
  cameraViewStatusAtom,
  cuboidCreationStateAtom,
  isCreatingCuboidAtom,
  isStatusBarOnAtom,
  useFo3dPerformanceStats,
} from "./state";

const PerfContainer = styled.div`
  position: fixed;
  bottom: 0;
  right: 2em;
  background: ${cssVar.color.tooltip.bg};
  opacity: 0.6;
  border-radius: 8px;
  padding: 16px 24px 12px 24px;
  min-width: 240px;
  box-shadow: none;
  backdrop-filter: blur(4px);
  border: 1px solid ${cssVar.color.border.subtle};
  z-index: 1000;
  color: ${cssVar.color.text.primary};
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
  color: ${cssVar.color.text.secondary};
  font-size: 14px;
  min-width: 60px;
  text-align: right;
`;

const StatBarTrack = styled.div`
  width: 100%;
  height: 6px;
  background: ${cssVar.color.interactive["secondary-default"]};
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

const StatusPanel = styled.div<{ $bg: string }>`
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
  background: ${cssVar.color.scrim.heavy};
  backdrop-filter: blur(4px);
  border: 1px solid ${cssVar.color.border.subtle};
  user-select: none;
  pointer-events: none;
`;

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
    <div
      style={{ display: "flex", alignItems: "center", opacity: 0.5 }}
      data-cy="looker3d-statusbar-camera-info"
    >
      <CameraIcon fontSize="small" />
      <div style={{ marginLeft: "0.5em", marginTop: "-5px" }}>
        <Text variant="caption" data-cy="looker3d-statusbar-camera-position">
          {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)},{" "}
          {cameraPosition.z.toFixed(2)}
        </Text>
      </div>
    </div>
  );
};

const PerfStats = () => {
  const perfStats = useFo3dPerformanceStats();

  const statBarColors = {
    // blue
    calls: cssVar.color["viz-chart"].blue,
    // purple
    triangles: cssVar.color["viz-chart"].purple,
    // pink
    points: cssVar.color["viz-chart"].pink,
    // yellow
    geometries: cssVar.color["viz-chart"].yellow,
    // green
    textures: cssVar.color["viz-chart"].green,
    // light blue
    programs: cssVar.color["viz-chart"].teal,
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
    perfStats.fps > 50
      ? cssVar.color.semantic.success
      : perfStats.fps > 30
        ? cssVar.color.semantic.warning
        : cssVar.color.semantic.destructive;

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
          background: cssVar.color.border.subtle,
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
  const segmentState = useRecoilValue(activeSegmentationStateAtom);
  const cameraViewStatus = useRecoilValue(cameraViewStatusAtom);
  const isMultiviewOn = useRecoilValue(isInMultiPanelViewAtom);
  const isCreatingCuboid = useRecoilValue(isCreatingCuboidAtom);
  const cuboidCreationState = useRecoilValue(cuboidCreationStateAtom);

  const cuboidCreationHint =
    cuboidCreationState.step === 0
      ? "Click to place the first corner"
      : cuboidCreationState.step === 1
        ? "Click to set the heading"
        : "Click to set the width";

  const springProps = useSpring({
    transform: showPerfStatus ? "translateY(10%)" : "translateY(0%)",
  });

  const onClickHandler = useCallback(() => {
    setShowPerfStatus((prev) => !prev);
    setActiveNode(null);
  }, [setShowPerfStatus, setActiveNode]);

  const shouldShowViewStatus =
    cameraViewStatus.viewName &&
    cameraViewStatus.timestamp &&
    Date.now() - cameraViewStatus.timestamp < 1000;

  return (
    <animated.div ref={containerRef} style={{ ...springProps }}>
      {!showPerfStatus && (
        <MutedIconButton
          onClick={onClickHandler}
          data-cy="looker3d-statusbar-toggle"
        >
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
        <SegmentHint
          $border={theme.primary.main}
          $text={cssVar.color.text.primary}
        >
          <SegmentHintRow>
            <InfoOutlinedIcon
              style={{ fontSize: 12, color: theme.primary.main }}
            />
            Double click to finish • Del to undo last vertex • Escape to cancel
          </SegmentHintRow>
        </SegmentHint>
      )}

      {isCreatingCuboid && (
        <SegmentHint
          $border={theme.primary.main}
          $text={cssVar.color.text.primary}
        >
          <SegmentHintRow>
            <InfoOutlinedIcon
              style={{ fontSize: 12, color: theme.primary.main }}
            />
            {cuboidCreationHint} • Esc to exit
          </SegmentHintRow>
        </SegmentHint>
      )}

      {!segmentState.isActive && !isCreatingCuboid && (
        <AnnotationTips isMultiviewOn={isMultiviewOn} />
      )}

      {showPerfStatus && (
        <>
          <PerfStats />
          <StatusBarContainer data-cy="looker3d-statusbar">
            <CloseBar $bg={cssVar.color.bg.selected}>
              <IconButton
                onClick={onClickHandler}
                data-cy="looker3d-statusbar-close"
              >
                <Close />
              </IconButton>
            </CloseBar>
            <StatusPanel
              $bg={`color-mix(in srgb, ${cssVar.color.semantic.info} 20%, transparent)`}
            >
              <CameraInfo cameraRef={cameraRef} />
            </StatusPanel>
          </StatusBarContainer>
        </>
      )}
    </animated.div>
  );
};
