import { GizmoHelper, GizmoViewport, Grid, Line } from "@react-three/drei";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { DoubleSide, Vector3 } from "three";
import { isGridOnAtom } from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { useFo3dContext } from "./context";

const AXIS_RED_COLOR = "#FF2160";
const AXIS_GREEN_COLOR = "#21DF80";
const AXIS_BLUE_COLOR = "#2280FF";

const GRID_CELL_COLOR = "#6f6f6f";
const GRID_SECTION_COLOR = "#808080";

const FoAxesHelper = ({ fadeDistance }: { fadeDistance: number }) => {
  const { upVector } = useFo3dContext();
  const size = useMemo(() => fadeDistance / 10, [fadeDistance]);

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
            lineWidth={1}
            opacity={0.1}
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

  const [gridSize] = useMemo(() => {
    if (
      !sceneBoundingBox ||
      Math.abs(sceneBoundingBox.max.x) === Infinity ||
      !upVector
    ) {
      return [100, 100];
    }

    let maxInOrthoNormalPlane: number;

    if (upVector.x === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.y - sceneBoundingBox.min.y,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
    } else if (upVector.y === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
    } else {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.y - sceneBoundingBox.min.y
      );
    }

    // add 30% padding (arbitrary)
    const gridSize = Math.ceil(maxInOrthoNormalPlane * 1.3);
    return [gridSize];
  }, [sceneBoundingBox, upVector]);

  // 150 is an arbitrary number that seems to work well
  const fadeDistance = useMemo(() => gridSize * 150, [gridSize]);

  return (
    <>
      {isGridOn && (
        <>
          <Grid
            quaternion={gridHelperQuarternion}
            infiniteGrid
            side={DoubleSide}
            cellSize={1}
            sectionSize={5}
            sectionColor={GRID_SECTION_COLOR}
            cellColor={GRID_CELL_COLOR}
            fadeDistance={fadeDistance}
            followCamera
            fadeFrom={0}
            cellThickness={0.3}
            sectionThickness={0.3}
          />
          <FoAxesHelper fadeDistance={fadeDistance} />
        </>
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  );
};
