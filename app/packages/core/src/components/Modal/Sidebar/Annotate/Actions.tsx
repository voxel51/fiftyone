import { useUndoRedo } from "@fiftyone/commands";
import { Tooltip } from "@fiftyone/components";
import { use3dAnnotationFields } from "@fiftyone/looker-3d/src/annotation/use3dAnnotationFields";
import {
  ANNOTATION_CUBOID,
  ANNOTATION_POLYLINE,
} from "@fiftyone/looker-3d/src/constants";
import {
  useCurrent3dAnnotationMode,
  useReset3dAnnotationMode,
  useSetCurrent3dAnnotationMode,
} from "@fiftyone/looker-3d/src/state/accessors";
import { is3DDataset, pinned3d } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import PolylineIcon from "@mui/icons-material/Timeline";
import CuboidIcon from "@mui/icons-material/ViewInAr";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ItemLeft, ItemRight } from "./Components";
import { editing } from "./Edit";
import useCreate from "./Edit/useCreate";
import { useQuickDraw } from "./Edit/useQuickDraw";
import useCanManageSchema from "./useCanManageSchema";
import useShowModal from "./useShowModal";

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

  ${({ $active, theme }) =>
    $active &&
    `
    color: ${theme.text.primary};

    path {
      fill: ${theme.primary.plainColor};
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

const Classification = () => {
  const create = useCreate(CLASSIFICATION);
  const reset3dAnnotationMode = useReset3dAnnotationMode();

  const handleCreateClassification = useCallback(() => {
    create();

    // Exit other "persistent" annotation modes like 3D
    reset3dAnnotationMode();
  }, [create]);

  return (
    <Tooltip placement="top-center" text="Create new classification">
      <Square onClick={handleCreateClassification}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="19"
          height="18"
          viewBox="0 0 19 18"
          fill="none"
        >
          <title>Classification</title>
          <path
            d="M3.5 14.9995C3.0875 14.9995 2.73438 14.8526 2.44063 14.5589C2.14687 14.2651 2 13.912 2 13.4995V4.49951C2 4.08701 2.14687 3.73389 2.44063 3.44014C2.73438 3.14639 3.0875 2.99951 3.5 2.99951H11.75C11.9875 2.99951 12.2125 3.05264 12.425 3.15889C12.6375 3.26514 12.8125 3.41201 12.95 3.59951L16.325 8.09951C16.525 8.36201 16.625 8.66201 16.625 8.99951C16.625 9.33701 16.525 9.63701 16.325 9.89951L12.95 14.3995C12.8125 14.587 12.6375 14.7339 12.425 14.8401C12.2125 14.9464 11.9875 14.9995 11.75 14.9995H3.5ZM3.5 13.4995H11.75L15.125 8.99951L11.75 4.49951H3.5V13.4995Z"
            fill="currentColor"
          />
        </svg>
      </Square>
    </Tooltip>
  );
};

const Detection = () => {
  const { quickDrawActive, toggleQuickDraw } = useQuickDraw();

  return (
    <Tooltip placement="top-center" text="Create new detections">
      <Square
        $active={quickDrawActive}
        onClick={() => {
          toggleQuickDraw();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="19"
          height="18"
          viewBox="0 0 19 18"
          fill="none"
        >
          <title>Detection</title>
          <path
            d="M4.25 15.75C3.8375 15.75 3.48438 15.6031 3.19063 15.3094C2.89687 15.0156 2.75 14.6625 2.75 14.25V3.75C2.75 3.3375 2.89687 2.98438 3.19063 2.69063C3.48438 2.39687 3.8375 2.25 4.25 2.25H14.75C15.1625 2.25 15.5156 2.39687 15.8094 2.69063C16.1031 2.98438 16.25 3.3375 16.25 3.75V14.25C16.25 14.6625 16.1031 15.0156 15.8094 15.3094C15.5156 15.6031 15.1625 15.75 14.75 15.75H4.25ZM4.25 14.25H14.75V3.75H4.25V14.25Z"
            fill="currentColor"
          />
        </svg>
      </Square>
    </Tooltip>
  );
};

export const Undo = () => {
  const { undo, undoEnabled } = useUndoRedo();

  return (
    <Round onClick={undo} className={undoEnabled ? "" : "disabled"}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="13"
        height="12"
        viewBox="0 0 13 12"
        fill="none"
      >
        <title>Undo</title>
        <path
          d="M2.98395 12C2.74746 12 2.54922 11.9211 2.38925 11.7633C2.22927 11.6055 2.14928 11.4099 2.14928 11.1767C2.14928 10.9434 2.22927 10.7479 2.38925 10.5901C2.54922 10.4322 2.74746 10.3533 2.98395 10.3533H8.07544C8.95185 10.3533 9.71348 10.0789 10.3604 9.53002C11.0072 8.98113 11.3307 8.29503 11.3307 7.4717C11.3307 6.64837 11.0072 5.96226 10.3604 5.41338C9.71348 4.86449 8.95185 4.59005 8.07544 4.59005H2.81701L4.40289 6.15437C4.55591 6.30532 4.63242 6.49743 4.63242 6.7307C4.63242 6.96398 4.55591 7.15609 4.40289 7.30703C4.24987 7.45798 4.05511 7.53345 3.81862 7.53345C3.58213 7.53345 3.38737 7.45798 3.23435 7.30703L0.229535 4.34305C0.146067 4.26072 0.0869449 4.17153 0.0521669 4.07547C0.017389 3.97942 0 3.8765 0 3.76672C0 3.65695 0.017389 3.55403 0.0521669 3.45798C0.0869449 3.36192 0.146067 3.27273 0.229535 3.19039L3.23435 0.226415C3.38737 0.0754717 3.58213 0 3.81862 0C4.05511 0 4.24987 0.0754717 4.40289 0.226415C4.55591 0.377358 4.63242 0.569468 4.63242 0.802744C4.63242 1.03602 4.55591 1.22813 4.40289 1.37907L2.81701 2.9434H8.07544C9.42483 2.9434 10.5829 3.37564 11.5498 4.24014C12.5166 5.10463 13 6.18182 13 7.4717C13 8.76158 12.5166 9.83877 11.5498 10.7033C10.5829 11.5678 9.42483 12 8.07544 12H2.98395Z"
          fill="currentColor"
        />
      </svg>
    </Round>
  );
};

export const Redo = () => {
  const { redo, redoEnabled } = useUndoRedo();

  return (
    <Tooltip placement="top-center" text="Redo">
      <Round onClick={redo} className={redoEnabled ? "" : "disabled"}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="12"
          viewBox="0 0 13 12"
          fill="none"
        >
          <title>Redo</title>
          <path
            d="M10.0161 12C10.2525 12 10.4508 11.9211 10.6108 11.7633C10.7707 11.6055 10.8507 11.4099 10.8507 11.1767C10.8507 10.9434 10.7707 10.7479 10.6108 10.5901C10.4508 10.4322 10.2525 10.3533 10.0161 10.3533H4.92456C4.04815 10.3533 3.28652 10.0789 2.63965 9.53002C1.99278 8.98113 1.66934 8.29503 1.66934 7.4717C1.66934 6.64837 1.99278 5.96226 2.63965 5.41338C3.28652 4.86449 4.04815 4.59005 4.92456 4.59005H10.183L8.59711 6.15437C8.44409 6.30532 8.36758 6.49743 8.36758 6.7307C8.36758 6.96398 8.44409 7.15609 8.59711 7.30703C8.75013 7.45798 8.94489 7.53345 9.18138 7.53345C9.41787 7.53345 9.61263 7.45798 9.76565 7.30703L12.7705 4.34305C12.8539 4.26072 12.9131 4.17153 12.9478 4.07547C12.9826 3.97942 13 3.8765 13 3.76672C13 3.65695 12.9826 3.55403 12.9478 3.45798C12.9131 3.36192 12.8539 3.27273 12.7705 3.19039L9.76565 0.226415C9.61263 0.0754717 9.41787 0 9.18138 0C8.94489 0 8.75013 0.0754717 8.59711 0.226415C8.44409 0.377358 8.36758 0.569468 8.36758 0.802744C8.36758 1.03602 8.44409 1.22813 8.59711 1.37907L10.183 2.9434H4.92456C3.57517 2.9434 2.41707 3.37564 1.45024 4.24014C0.483414 5.10463 0 6.18182 0 7.4717C0 8.76158 0.483414 9.83877 1.45024 10.7033C2.41707 11.5678 3.57517 12 4.92456 12H10.0161Z"
            fill="currentColor"
          />
        </svg>
      </Round>
    </Tooltip>
  );
};

export const ThreeDPolylines = () => {
  const setEditing = useSetAtom(editing);
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();

  const polylineFields = use3dAnnotationFields(
    useCallback(
      (fieldType) =>
        fieldType === POLYLINE.toLocaleLowerCase() ||
        fieldType === POLYLINES.toLocaleLowerCase(),
      []
    )
  );

  const hasPolylineFieldsInSchema = polylineFields && polylineFields.length > 0;
  const isPolylineAnnotateActive =
    current3dAnnotationMode === ANNOTATION_POLYLINE;

  return (
    <Tooltip
      placement="top-center"
      text={
        isPolylineAnnotateActive
          ? "Exit polyline annotation mode"
          : "Enter polyline annotation mode"
      }
    >
      <Square
        $active={isPolylineAnnotateActive}
        onClick={() => {
          if (isPolylineAnnotateActive) {
            setCurrent3dAnnotationMode(null);
            return;
          }

          if (!hasPolylineFieldsInSchema) {
            // Setting `editing` to a string triggers schema creation flow
            // See docstring of `editing` atom for more details
            setEditing(POLYLINE);
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
  const setEditing = useSetAtom(editing);
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();

  const cuboidFields = use3dAnnotationFields(
    useCallback(
      (fieldType) =>
        fieldType === DETECTION.toLocaleLowerCase() ||
        fieldType === DETECTIONS.toLocaleLowerCase(),
      []
    )
  );

  const hasCuboidFieldsInSchema = cuboidFields && cuboidFields.length > 0;
  const isCuboidAnnotateActive = current3dAnnotationMode === ANNOTATION_CUBOID;

  return (
    <Tooltip
      placement="top-center"
      text={
        isCuboidAnnotateActive
          ? "Exit cuboid annotation mode"
          : "Enter cuboid annotation mode"
      }
    >
      <Square
        $active={isCuboidAnnotateActive}
        onClick={() => {
          if (isCuboidAnnotateActive) {
            setCurrent3dAnnotationMode(null);
            return;
          }

          if (!hasCuboidFieldsInSchema) {
            // Setting `editing` to a string triggers schema creation flow
            // See docstring of `editing` atom for more details
            setEditing(DETECTION);
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

const Schema = () => {
  const showModal = useShowModal();

  return (
    <Button variant={Variant.Borderless} size={Size.Sm} onClick={showModal}>
      Schema
    </Button>
  );
};

const Actions = () => {
  // This checks if media type of the dataset resolved to 3d
  const is3dDataset = useRecoilValue(is3DDataset);
  // This checks if a 3d sample is pinned - is true when media type is `group` with a 3d slice pinned
  const is3dSamplePinned = useRecoilValue(pinned3d);

  const canManage = useCanManageSchema();

  const areThreedActionsVisible = is3dDataset || is3dSamplePinned;

  return (
    <ActionsDiv style={{ margin: "0 0.25rem", paddingBottom: "0.5rem" }}>
      <Row>
        <ItemLeft style={{ columnGap: "0.1rem" }}>
          <Classification />
          {areThreedActionsVisible ? (
            <>
              <ThreeDCuboids />
              <ThreeDPolylines />
            </>
          ) : (
            <Detection />
          )}
        </ItemLeft>
        <ItemRight style={{ columnGap: "0.1rem" }}>
          <Undo />
          <Redo />
        </ItemRight>
      </Row>
      {canManage && (
        <Row>
          <ItemLeft style={{ width: "50%" }}>
            <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
              Click labels to edit
            </Text>
          </ItemLeft>
          <ItemRight style={{ width: "50%" }}>
            <Schema />
          </ItemRight>
        </Row>
      )}
    </ActionsDiv>
  );
};

export default Actions;
