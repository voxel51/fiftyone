import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import styled from "styled-components";
import * as THREE from "three";
import {
  getCameraControlsTarget,
  setCameraControlsPosition,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";

const GIZMO_SIZE = 130;
const GIZMO_CENTER = GIZMO_SIZE / 2;
const AXIS_LENGTH = 42;
const NEGATIVE_AXIS_LENGTH = 28;
const IDENTITY_QUATERNION = new THREE.Quaternion();

const WORLD_AXES = [
  {
    color: "#ff2060",
    direction: new THREE.Vector3(1, 0, 0),
    label: "X",
  },
  {
    color: "#20df80",
    direction: new THREE.Vector3(0, 1, 0),
    label: "Y",
  },
  {
    color: "#2080ff",
    direction: new THREE.Vector3(0, 0, 1),
    label: "Z",
  },
] as const;

type AxisRenderState = {
  color: string;
  depth: number;
  direction: THREE.Vector3;
  endX: number;
  endY: number;
  headRadius: number;
  isNegative: boolean;
  label?: string;
  name: string;
  lineOpacity: number;
};

type CameraRenderState = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  target: THREE.Vector3;
};

const hasCameraRenderStateChanged = (
  previousState: CameraRenderState | null,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3
) => {
  return (
    previousState === null ||
    !previousState.position.equals(camera.position) ||
    !previousState.quaternion.equals(camera.quaternion) ||
    !previousState.target.equals(target)
  );
};

const GizmoOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
`;

const GizmoContainer = styled.div`
  margin-top: 8px;
  margin-left: 10px;
  width: ${GIZMO_SIZE}px;
  height: ${GIZMO_SIZE}px;
  pointer-events: none;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }

  svg {
    display: block;
    pointer-events: none;
  }

  .fo3d-gizmo-axis {
    cursor: pointer;
    pointer-events: auto;
  }

  .fo3d-gizmo-axis circle {
    transition: r 120ms ease, filter 120ms ease;
  }

  .fo3d-gizmo-axis:hover circle {
    filter: brightness(1.2);
  }

  .fo3d-gizmo-axis:focus-visible circle {
    stroke: white;
    stroke-width: 2px;
  }
`;

const projectAxis = (
  direction: THREE.Vector3,
  inverseCameraQuaternion: THREE.Quaternion,
  length: number
) => {
  const cameraSpaceDirection = direction
    .clone()
    .applyQuaternion(inverseCameraQuaternion);

  return {
    depth: cameraSpaceDirection.z,
    x: GIZMO_CENTER + cameraSpaceDirection.x * length,
    y: GIZMO_CENTER - cameraSpaceDirection.y * length,
  };
};

const getAxisRenderState = (
  cameraQuaternion: THREE.Quaternion
): AxisRenderState[] => {
  const inverseCameraQuaternion = cameraQuaternion.clone().invert();

  return WORLD_AXES.flatMap(({ color, direction, label }) => {
    const positive = projectAxis(
      direction,
      inverseCameraQuaternion,
      AXIS_LENGTH
    );
    const negativeDirection = direction.clone().negate();
    const negative = projectAxis(
      negativeDirection,
      inverseCameraQuaternion,
      NEGATIVE_AXIS_LENGTH
    );

    const depthRatio = (positive.depth + 1) / 2;

    return [
      {
        color,
        depth: negative.depth,
        direction: negativeDirection,
        endX: negative.x,
        endY: negative.y,
        headRadius: 6,
        isNegative: true,
        lineOpacity: 0.35,
        name: label,
      },
      {
        color,
        depth: positive.depth,
        direction,
        endX: positive.x,
        endY: positive.y,
        headRadius: 8 + depthRatio * 3,
        isNegative: false,
        label,
        lineOpacity: 0.85,
        name: label,
      },
    ];
  }).sort((a, b) => a.depth - b.depth);
};

const AnnotationOrientationGizmoSvg = ({
  cameraQuaternion,
  onAxisPointerDown,
}: {
  cameraQuaternion: THREE.Quaternion;
  onAxisPointerDown: (direction: THREE.Vector3) => void;
}) => {
  const axes = useMemo(
    () => getAxisRenderState(cameraQuaternion),
    [cameraQuaternion]
  );
  const handleAxisSelection = useCallback(
    (direction: THREE.Vector3) => {
      onAxisPointerDown(direction);
    },
    [onAxisPointerDown]
  );

  return (
    <svg
      aria-label="3D orientation gizmo"
      height={GIZMO_SIZE}
      viewBox={`0 0 ${GIZMO_SIZE} ${GIZMO_SIZE}`}
      width={GIZMO_SIZE}
    >
      <circle
        cx={GIZMO_CENTER}
        cy={GIZMO_CENTER}
        fill="rgba(255, 255, 255, 0.08)"
        r="4"
      />
      {axes.map((axis) => (
        <g
          aria-label={`${axis.isNegative ? "Negative" : "Positive"} ${
            axis.name
          } axis`}
          className="fo3d-gizmo-axis"
          key={`${axis.isNegative ? "negative" : "positive"}-${axis.name}`}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            handleAxisSelection(axis.direction);
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            handleAxisSelection(axis.direction);
          }}
          role="button"
          tabIndex={0}
        >
          <line
            stroke={axis.color}
            strokeLinecap="round"
            strokeOpacity={axis.lineOpacity}
            strokeWidth={axis.isNegative ? 3 : 4}
            x1={GIZMO_CENTER}
            x2={axis.endX}
            y1={GIZMO_CENTER}
            y2={axis.endY}
          />
          <circle
            cx={axis.endX}
            cy={axis.endY}
            fill={axis.color}
            fillOpacity={axis.isNegative ? 0.8 : 1}
            r={axis.headRadius}
          />
          {axis.label && (
            <text
              dominantBaseline="central"
              fill="#000"
              fontFamily="Inter var, Arial, sans-serif"
              fontSize="13"
              fontWeight="700"
              pointerEvents="none"
              textAnchor="middle"
              x={axis.endX}
              y={axis.endY + 0.5}
            >
              {axis.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

const AnnotationOrientationGizmo = ({
  mainCamera,
  cameraControlsRef,
}: {
  mainCamera: RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: RefObject<Fo3dCameraControls>;
}) => {
  const [mainCameraState, setMainCameraState] =
    useState<CameraRenderState | null>(null);
  const previousCameraState = useRef<CameraRenderState | null>(null);
  const cameraTarget = useRef(new THREE.Vector3());

  const syncCameraState = useCallback(() => {
    const camera = mainCamera.current;
    const controls = cameraControlsRef.current;

    if (!camera || !controls) {
      return;
    }

    const target = getCameraControlsTarget(controls, cameraTarget.current);

    if (
      !hasCameraRenderStateChanged(previousCameraState.current, camera, target)
    ) {
      return;
    }

    const nextCameraState = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: target.clone(),
    };

    previousCameraState.current = nextCameraState;
    setMainCameraState(nextCameraState);
  }, [mainCamera, cameraControlsRef]);

  useEffect(() => {
    let animationId: number | undefined;

    const updateCameraState = () => {
      // The overlay lives outside the R3F canvas, so sample the refs directly
      // and only re-render the SVG when the camera state has actually changed.
      syncCameraState();
      animationId = requestAnimationFrame(updateCameraState);
    };

    updateCameraState();

    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [syncCameraState]);

  const handleCameraTween = useCallback(
    (direction: THREE.Vector3) => {
      if (
        !mainCamera.current ||
        !cameraControlsRef.current ||
        !mainCameraState
      ) {
        return;
      }

      const target = mainCameraState.target.clone();
      const radius = mainCameraState.position.distanceTo(target);

      if (radius <= 0) {
        return;
      }

      setCameraControlsPosition({
        camera: mainCamera.current,
        controls: cameraControlsRef.current,
        position: direction.clone().multiplyScalar(radius).add(target),
      });
    },
    [mainCamera, cameraControlsRef, mainCameraState]
  );

  return (
    <GizmoContainer>
      <AnnotationOrientationGizmoSvg
        cameraQuaternion={mainCameraState?.quaternion ?? IDENTITY_QUATERNION}
        onAxisPointerDown={handleCameraTween}
      />
    </GizmoContainer>
  );
};

export const AnnotationMultiViewGizmoOverlayWrapper = ({
  mainCamera,
  cameraControlsRef,
}: {
  mainCamera: RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: RefObject<Fo3dCameraControls>;
}) => {
  return (
    <GizmoOverlay>
      <AnnotationOrientationGizmo
        mainCamera={mainCamera}
        cameraControlsRef={cameraControlsRef}
      />
    </GizmoOverlay>
  );
};
