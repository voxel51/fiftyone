import { GizmoHelper, GizmoViewport, Line } from "@react-three/drei";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Vector3 } from "three";
import { isGridOnAtom } from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { useFo3dContext } from "./context";

const AXIS_RED_COLOR = "#FF2160";
const AXIS_GREEN_COLOR = "#21DF80";
const AXIS_BLUE_COLOR = "#2280FF";

const FoAxesHelper = ({ size }) => {
  const { upVector } = useFo3dContext();

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
            lineWidth={2}
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

  const [gridSize, numGridLines] = useMemo(() => {
    if (
      !sceneBoundingBox ||
      Math.abs(sceneBoundingBox.max.x) === Infinity ||
      !upVector
    ) {
      return [100, 100];
    }

    let maxInOrthoNormalPlane: number;

    // account for the possibility that the scene is not centered at the origin
    let offset: number;

    if (upVector.x === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.y - sceneBoundingBox.min.y,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
      offset = Math.max(
        sceneBoundingBox.max.y,
        Math.abs(sceneBoundingBox.min.y),
        sceneBoundingBox.max.z,
        Math.abs(sceneBoundingBox.min.z)
      );
    } else if (upVector.y === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
      offset = Math.max(
        sceneBoundingBox.max.x,
        Math.abs(sceneBoundingBox.min.x),
        sceneBoundingBox.max.z,
        Math.abs(sceneBoundingBox.min.z)
      );
    } else {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.y - sceneBoundingBox.min.y
      );
      offset = Math.max(
        sceneBoundingBox.max.x,
        Math.abs(sceneBoundingBox.min.x),
        sceneBoundingBox.max.y,
        Math.abs(sceneBoundingBox.min.y)
      );
    }

    // add 30% padding (arbitrary)
    const gridSize = Math.ceil(maxInOrthoNormalPlane * 1.3);
    const numLines = Math.ceil(gridSize);

    return [gridSize, numLines];
  }, [sceneBoundingBox, upVector]);

  return (
    <>
      {isGridOn && (
        <>
          <gridHelper
            args={[gridSize, numGridLines]}
            quaternion={gridHelperQuarternion}
          />
          <FoAxesHelper size={gridSize} />
        </>
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  );
};
