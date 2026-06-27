import {
  ClassificationIcon,
  DetectionIcon,
  RedoIcon,
  SegmentationIcon,
  SelectIcon,
  UndoIcon,
} from "@fiftyone/components";
import { use3dAnnotationFields } from "@fiftyone/looker-3d/src/annotation/use3dAnnotationFields";
import {
  ANNOTATION_CUBOID,
  ANNOTATION_POLYLINE,
} from "@fiftyone/looker-3d/src/constants";
import {
  useCurrent3dAnnotationMode,
  useSetCurrent3dAnnotationMode,
} from "@fiftyone/looker-3d/src/state/accessors";
import {
  is3DDataset,
  isVideoDataset,
  useIs3dPinned,
  useIsGroupDataset,
} from "@fiftyone/state";
import {
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import PolylineIcon from "@mui/icons-material/Timeline";
import CuboidIcon from "@mui/icons-material/ViewInAr";
import { Anchor, Text, Tooltip } from "@voxel51/voodo";
import { createContext, useCallback, useContext } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ItemLeft, ItemRight } from "./Components";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "./Edit/useAnnotationContext";
import { useClassificationMode } from "./Edit/useClassificationMode";
import { useDetectionMode } from "./Edit/useDetectionMode";
import { usePolylineMode } from "./Edit/usePolylineMode";
import { useSegmentationMode } from "./Edit/useSegmentationMode";
import { useDeactivateAllModes } from "./useDeactivateAllModes";
import { useAnnotationUndoRedo } from "./useAnnotationUndoRedo";
import { useGroupAnnotationSliceReady } from "./useGroupAnnotationSliceReady";

const ActionsDiv = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  flex-direction: column;
  padding: 0.25rem 1rem;
  width: 100%;
  max-width: 100%;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const Container = styled.div<{ $active?: boolean }>`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 2.5rem;
  justify-content: center;
  column-gap: 0.25rem;
  padding: 0.5rem;
  width: 2.5rem;
  cursor: pointer;
  opacity: 1;
  color: ${({ theme }) => theme.text.secondary};

  text-overflow: ellipsis;
  white-space: nowrap;

  path {
    fill: var(--color-content-icon-subtle);
  }

  path.stroke-icon {
    fill: none;
    stroke: var(--color-content-icon-subtle);
  }

  ${({ $active, theme }) =>
    $active &&
    `
    color: ${theme.text.primary};

    path {
      fill: ${theme.primary.plainColor};
    }

    path.stroke-icon {
      fill: none;
      stroke: ${theme.primary.plainColor};
    }

    svg {
      filter: drop-shadow(0 0 5px ${theme.primary.plainColor});
    }
  `}

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:not(.disabled):hover {
    color: ${({ theme }) => theme.text.primary};
    background: ${({ theme }) => theme.background.level1};
  }

  &:not(.disabled):hover path {
    fill: ${({ theme }) => theme.primary.plainColor};
  }

  &:not(.disabled):hover path.stroke-icon {
    fill: none;
    stroke: ${({ theme }) => theme.primary.plainColor};
  }
`;

export const Round = styled(Container)`
  border-radius: var(--radius-full);
  width: 2rem;
  height: 2rem;
  &:hover {
    color: ${({ theme }) => theme.text.primary};
  }
`;

export const RoundButton = styled(Round)`
  width: auto;
  height: auto;
  padding: 0.25rem 1rem;
  flex-direction: row;
  column-gap: 1rem;
`;

export const RoundButtonWhite = styled(RoundButton)`
  &:hover path {
    fill: ${({ theme }) => theme.text.primary};
  }
`;

const Square = styled(Container)<{ $active?: boolean }>`
  border-radius: var(--radius-xs);
`;

const DeactivateAllContext = createContext<() => void>(() => {});

const VIDEO_UNSUPPORTED_TOOLTIP =
  "Not yet supported on video — coming in a future release";

/**
 * Returns a callback that deactivates any active annotation actions.
 * Action buttons should call this before activating themselves.
 */
export const useDeactivateAll = () => useContext(DeactivateAllContext);

const Select = ({ active }: { active: boolean }) => {
  const deactivateAll = useDeactivateAll();

  return (
    <Tooltip anchor={Anchor.Top} content={<Text>Select</Text>} portal>
      <Square
        $active={active}
        data-cy="select-action"
        data-cy-active={active}
        onClick={active ? undefined : deactivateAll}
      >
        <SelectIcon />
      </Square>
    </Tooltip>
  );
};

const Classification = ({ forceDisabled }: { forceDisabled?: boolean }) => {
  const {
    classificationModeActive,
    disabled,
    tooltip,
    activateClassificationMode,
  } = useClassificationMode();
  const deactivateAll = useDeactivateAll();

  const effectiveDisabled = forceDisabled || disabled;
  const effectiveTooltip = forceDisabled ? VIDEO_UNSUPPORTED_TOOLTIP : tooltip;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={<Text>{effectiveTooltip}</Text>}
      portal
    >
      <Square
        $active={classificationModeActive && !forceDisabled}
        data-cy="create-classification"
        data-cy-active={classificationModeActive && !forceDisabled}
        onClick={() => {
          if (effectiveDisabled) return;
          deactivateAll();
          if (!classificationModeActive) activateClassificationMode();
        }}
        className={effectiveDisabled ? "disabled" : ""}
      >
        <ClassificationIcon />
      </Square>
    </Tooltip>
  );
};

const Detection = ({ forceDisabled }: { forceDisabled?: boolean }) => {
  const { activateDetectionMode, detectionModeActive, disabled, tooltip } =
    useDetectionMode();
  const deactivateAll = useDeactivateAll();

  const effectiveDisabled = forceDisabled || disabled;
  const effectiveTooltip = forceDisabled ? VIDEO_UNSUPPORTED_TOOLTIP : tooltip;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={<Text>{effectiveTooltip}</Text>}
      portal
    >
      <Square
        $active={detectionModeActive && !forceDisabled}
        className={effectiveDisabled ? "disabled" : ""}
        data-cy="detection-mode"
        data-cy-active={detectionModeActive && !forceDisabled}
        onClick={() => {
          if (effectiveDisabled) return;
          deactivateAll();
          if (!detectionModeActive) activateDetectionMode();
        }}
      >
        <DetectionIcon />
      </Square>
    </Tooltip>
  );
};

const Segmentation = ({ forceDisabled }: { forceDisabled?: boolean }) => {
  const {
    segmentationModeActive,
    disabled,
    tooltip,
    activateSegmentationMode,
  } = useSegmentationMode();
  const deactivateAll = useDeactivateAll();

  const effectiveDisabled = forceDisabled || disabled;
  const effectiveTooltip = forceDisabled ? VIDEO_UNSUPPORTED_TOOLTIP : tooltip;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={<Text>{effectiveTooltip}</Text>}
      portal
    >
      <Square
        $active={segmentationModeActive && !forceDisabled}
        className={effectiveDisabled ? "disabled" : ""}
        data-cy="segmentation-mode"
        data-cy-active={segmentationModeActive && !forceDisabled}
        onClick={() => {
          if (effectiveDisabled) return;
          deactivateAll();

          if (!segmentationModeActive) {
            activateSegmentationMode();
          }
        }}
      >
        <SegmentationIcon />
      </Square>
    </Tooltip>
  );
};

const Polyline = ({ forceDisabled }: { forceDisabled?: boolean }) => {
  const { activatePolylineMode, polylineModeActive, disabled, tooltip } =
    usePolylineMode();
  const deactivateAll = useDeactivateAll();

  const effectiveDisabled = forceDisabled || disabled;
  const effectiveTooltip = forceDisabled ? VIDEO_UNSUPPORTED_TOOLTIP : tooltip;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={<Text>{effectiveTooltip}</Text>}
      portal
    >
      <Square
        $active={polylineModeActive && !forceDisabled}
        className={effectiveDisabled ? "disabled" : ""}
        data-cy="polyline-mode"
        data-cy-active={polylineModeActive && !forceDisabled}
        onClick={() => {
          if (effectiveDisabled) {
            return;
          }

          deactivateAll();

          if (!polylineModeActive) {
            activatePolylineMode();
          }
        }}
      >
        <PolylineIcon sx={{ transform: "rotate(90deg)" }} />
      </Square>
    </Tooltip>
  );
};

// Terse newest-first stack dump so each undo/redo entry traces to its gesture.
// Left-anchored because the monospace multi-line content is wider than a label.
const HistoryTooltip = ({
  title,
  entries,
}: {
  title: string;
  entries: string[];
}) => (
  <div style={{ maxWidth: 380, fontFamily: "monospace", fontSize: 11 }}>
    <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
    {entries.length === 0 ? (
      <div>(empty)</div>
    ) : (
      entries.map((entry, index) => (
        <div key={index}>
          {index + 1}. {entry}
        </div>
      ))
    )}
  </div>
);

export const Undo = () => {
  const { undo, undoEnabled, undoStack } = useAnnotationUndoRedo();

  return (
    <Tooltip
      anchor={Anchor.Left}
      content={<HistoryTooltip title="Undo" entries={undoStack} />}
      portal
    >
      <Round
        onClick={undo}
        className={undoEnabled ? "" : "disabled"}
        data-cy="undo-button"
      >
        <UndoIcon />
      </Round>
    </Tooltip>
  );
};

export const Redo = () => {
  const { redo, redoEnabled, redoStack } = useAnnotationUndoRedo();

  return (
    <Tooltip
      anchor={Anchor.Left}
      content={<HistoryTooltip title="Redo" entries={redoStack} />}
      portal
    >
      <Round
        onClick={redo}
        className={redoEnabled ? "" : "disabled"}
        data-cy="redo-button"
      >
        <RedoIcon />
      </Round>
    </Tooltip>
  );
};

export const ThreeDPolylines = () => {
  const { createNew } = useAnnotationContext();
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();
  const deactivateAll = useDeactivateAll();
  const { fields } = useAnnotationFields(POLYLINE);

  const polylineFields = use3dAnnotationFields(
    useCallback(
      (fieldType) =>
        fieldType === POLYLINE.toLocaleLowerCase() ||
        fieldType === POLYLINES.toLocaleLowerCase(),
      [],
    ),
  );

  const hasPolylineFieldsInSchema = polylineFields && polylineFields.length > 0;
  const disabled = fields.length === 0;
  const isPolylineAnnotateActive =
    current3dAnnotationMode === ANNOTATION_POLYLINE;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={
        <Text>
          {isPolylineAnnotateActive
            ? "Exit polyline annotation mode"
            : "Enter polyline annotation mode"}
        </Text>
      }
      portal
    >
      <Square
        data-cy="polyline-mode-3d"
        data-cy-active={String(isPolylineAnnotateActive)}
        $active={isPolylineAnnotateActive}
        className={disabled ? "disabled" : ""}
        onClick={() => {
          if (disabled) return;
          deactivateAll();

          if (isPolylineAnnotateActive) return;

          if (!hasPolylineFieldsInSchema) {
            createNew(POLYLINE);
            return;
          }

          setCurrent3dAnnotationMode(ANNOTATION_POLYLINE);
        }}
      >
        <PolylineIcon sx={{ transform: "rotate(90deg)" }} />
      </Square>
    </Tooltip>
  );
};

export const ThreeDCuboids = () => {
  const { createNew } = useAnnotationContext();
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();
  const deactivateAll = useDeactivateAll();
  const { fields } = useAnnotationFields(DETECTION);

  const cuboidFields = use3dAnnotationFields(
    useCallback(
      (fieldType) =>
        fieldType === DETECTION.toLocaleLowerCase() ||
        fieldType === DETECTIONS.toLocaleLowerCase(),
      [],
    ),
  );

  const hasCuboidFieldsInSchema = cuboidFields && cuboidFields.length > 0;
  const disabled = fields.length === 0;
  const isCuboidAnnotateActive = current3dAnnotationMode === ANNOTATION_CUBOID;

  return (
    <Tooltip
      anchor={Anchor.Top}
      content={
        <Text>
          {isCuboidAnnotateActive
            ? "Exit cuboid annotation mode"
            : "Enter cuboid annotation mode"}
        </Text>
      }
      portal
    >
      <Square
        data-cy="cuboid-mode"
        data-cy-active={String(isCuboidAnnotateActive)}
        $active={isCuboidAnnotateActive}
        className={disabled ? "disabled" : ""}
        onClick={() => {
          if (disabled) return;
          deactivateAll();

          if (isCuboidAnnotateActive) return;

          if (!hasCuboidFieldsInSchema) {
            createNew(DETECTION);
            return;
          }

          setCurrent3dAnnotationMode(ANNOTATION_CUBOID);
        }}
      >
        <CuboidIcon />
      </Square>
    </Tooltip>
  );
};

const Actions = () => {
  // This checks if media type of the dataset resolved to 3d
  const is3dDataset = useRecoilValue(is3DDataset);
  // Video annotation in M1 only fully supports per-frame bbox detections.
  // Classification, segmentation, and polyline buttons are rendered but
  // force-disabled with a "coming in a future release" tooltip so users
  // discover the surface without being able to activate it. Undo/redo are
  // shown — the engine's value-based stack backs them on video too.
  const isVideo = useRecoilValue(isVideoDataset);
  // This checks if a 3d sample is pinned - is true when media type is `group` with a 3d slice pinned
  const is3dSamplePinned = useIs3dPinned();

  const { classificationModeActive } = useClassificationMode();
  const { detectionModeActive } = useDetectionMode();
  const { segmentationModeActive } = useSegmentationMode();
  const { polylineModeActive } = usePolylineMode();
  const current3dAnnotationMode = useCurrent3dAnnotationMode();

  const noActiveActions =
    !classificationModeActive &&
    !detectionModeActive &&
    !segmentationModeActive &&
    !polylineModeActive &&
    !current3dAnnotationMode;
  const areThreeDActionsVisible = is3dDataset || is3dSamplePinned;

  // For group datasets the 2D-vs-3D decision depends on the resolved annotation
  // slice, which isn't known until the group's sample data loads. Withhold the
  // slice-dependent tools until then so a 3D sample never flashes 2D tools.
  // Non-group datasets resolve immediately and don't gate.
  const isGroupDataset = useIsGroupDataset();
  const [groupAnnotationSliceReady] = useGroupAnnotationSliceReady();
  const toolsResolved = !isGroupDataset || groupAnnotationSliceReady;

  const deactivateAll = useDeactivateAllModes();

  return (
    <DeactivateAllContext.Provider value={deactivateAll}>
      <ActionsDiv style={{ margin: "0 0.25rem", paddingBottom: "0.5rem" }}>
        <Row>
          <ItemLeft style={{ columnGap: "0.1rem" }}>
            <Select active={noActiveActions} />
            {isVideo ? (
              <>
                <Classification forceDisabled />
                <Detection />
                <Segmentation forceDisabled />
                <Polyline forceDisabled />
              </>
            ) : (
              <>
                <Classification />
                {toolsResolved &&
                  (areThreeDActionsVisible ? (
                    <>
                      <ThreeDCuboids />
                      <ThreeDPolylines />
                    </>
                  ) : (
                    <>
                      <Detection />
                      <Segmentation />
                      <Polyline />
                    </>
                  ))}
              </>
            )}
          </ItemLeft>
          <ItemRight style={{ columnGap: "0.1rem" }}>
            <Undo />
            <Redo />
          </ItemRight>
        </Row>
      </ActionsDiv>
    </DeactivateAllContext.Provider>
  );
};

export default Actions;
