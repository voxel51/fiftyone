import { GizmoHelper, GizmoViewport, Grid, Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { DoubleSide, Vector3 } from "three";
import {
  gridCellSizeAtom,
  gridSectionSizeAtom,
  gridSizeAtom,
  isGridInfinitelyLargeAtom,
  isGridOnAtom,
  shouldGridFadeAtom,
} from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { useFo3dContext } from "./context";

const AXIS_RED_COLOR = "#FF2160";
const AXIS_GREEN_COLOR = "#21DF80";
const AXIS_BLUE_COLOR = "#2280FF";

const GRID_CELL_COLOR = "#6f6f6f";
const GRID_SECTION_COLOR = "#736f73";

const FoAxesHelper = ({
  maxInOrthonormalPlane,
}: {
  maxInOrthonormalPlane: number;
}) => {
  const { upVector } = useFo3dContext();
  const size = useMemo(
    // multiplier (10) and offset (100) are arbitrary that seem to work well
    () => maxInOrthonormalPlane * 10 + 100,
    [maxInOrthonormalPlane]
  );

  const axes = useMemo(
    () => [
      {
        start: new Vector3(-size / 2, 0, 0),
        end: new Vector3(size / 2, 0, 0),
        color: AXIS_RED_COLOR,
      },
      {
        start: new Vector3(0, -size / 2, 0),
        end: new Vector3(0, size / 2, 0),
        color: AXIS_GREEN_COLOR,
      },
      {
        start: new Vector3(0, 0, -size / 2),
        end: new Vector3(0, 0, size / 2),
        color: AXIS_BLUE_COLOR,
      },
    ],
    [size]
  );

  const axisComponents = useMemo(() => {
    return axes
      .filter(
        (axis) =>
          !(
            (axis.color === AXIS_RED_COLOR && upVector.x === 1) ||
            (axis.color === AXIS_GREEN_COLOR && upVector.y === 1) ||
            (axis.color === AXIS_BLUE_COLOR && upVector.z === 1)
          )
      )
      .map((axis) => {
        return (
          <Line
            key={axis.color}
            points={[axis.start, axis.end]}
            color={axis.color}
            lineWidth={1.1}
            opacity={0.3}
            transparent
          />
        );
      });
  }, [upVector, axes]);

  return <>{axisComponents}</>;
};

export const Gizmos = () => {
  const { upVector, sceneBoundingBox } = useFo3dContext();
  const isGridOn = useRecoilValue(isGridOnAtom);

  const gridHelperQuarternion = useMemo(
    () => getGridQuaternionFromUpVector(upVector),
    [upVector]
  );

  const sceneSize = useMemo(() => {
    if (!sceneBoundingBox) {
      return 0;
    }

    return sceneBoundingBox.getSize(new Vector3());
  }, [sceneBoundingBox]);

  const maxInOrthonormalPlane = useMemo(() => {
    if (!sceneSize) {
      return 0;
    }

    if (upVector.x === 1) {
      return Math.max(sceneSize.y, sceneSize.z);
    }

    if (upVector.y === 1) {
      return Math.max(sceneSize.x, sceneSize.z);
    }

    return Math.max(sceneSize.x, sceneSize.y);
  }, [sceneSize, upVector]);

  const [cellSize, setCellSize] = useRecoilState(gridCellSizeAtom);
  const [sectionSize, setSectionSize] = useRecoilState(gridSectionSizeAtom);
  const isGridInfinitelyLarge = useRecoilValue(isGridInfinitelyLargeAtom);
  const shouldFade = useRecoilValue(shouldGridFadeAtom);
  const gridSize = useRecoilValue(gridSizeAtom);

  // This effect dynamically sets initial cell and section size based on the scene size
  useEffect(() => {
    if (!sceneSize) {
      return;
    }

    const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);

    const nominalCellSize = maxDim / 10;

    // round to the nearest 10, but for small values, just use 1
    const roundedCellSize =
      nominalCellSize <= 1 ? 1 : Math.ceil(nominalCellSize / 10) * 10;
    const roundedSectionSize = roundedCellSize * 10;

    setCellSize(roundedCellSize);
    setSectionSize(roundedSectionSize);
  }, [sceneSize]);

  // The fade distance is the distance at which the grid will start to fade out
  // the multipliers and offset are arbitrary
  const fadeDistance = useMemo(() => {
    return maxInOrthonormalPlane * 10 + 100;
  }, [maxInOrthonormalPlane]);

  return (
    <>
      {isGridOn && (
        <>
          <Grid
            quaternion={gridHelperQuarternion}
            infiniteGrid={isGridInfinitelyLarge}
            side={DoubleSide}
            args={[gridSize, gridSize]}
            cellSize={cellSize}
            sectionSize={sectionSize}
            sectionColor={GRID_SECTION_COLOR}
            cellColor={GRID_CELL_COLOR}
            fadeDistance={fadeDistance}
            fadeStrength={shouldFade ? 1 : 0}
            followCamera={shouldFade}
            fadeFrom={0.5}
            cellThickness={0.5}
            sectionThickness={0.4}
          />
          <FoAxesHelper maxInOrthonormalPlane={maxInOrthonormalPlane} />
        </>
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  );
};
