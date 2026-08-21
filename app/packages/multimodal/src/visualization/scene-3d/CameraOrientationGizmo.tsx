import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useRef, type CSSProperties } from "react";
import * as THREE from "three";

const AXES = [
  { color: "#ef4444", direction: [1, 0, 0], label: "X" },
  { color: "#22c55e", direction: [0, 1, 0], label: "Y" },
  { color: "#3b82f6", direction: [0, 0, 1], label: "Z" },
] as const;
const GIZMO_CENTER_PX = 42;
const GIZMO_RADIUS_PX = 28;
const GIZMO_SIZE_PX = GIZMO_CENTER_PX * 2;
const POSITIVE_HEAD_SIZE_PX = 18;
const NEGATIVE_HEAD_SIZE_PX = 10;
const QUATERNION_EPSILON = 0.000001;

/** World-space direction selected from the camera orientation gizmo. */
export type CameraOrientationDirection = readonly [number, number, number];
type PositionTuple = [number, number, number];
type QuaternionTuple = readonly [number, number, number, number];

interface CameraTransform {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly quaternion: {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

interface ProjectedDirection {
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

interface ProjectedAxis {
  readonly color: string;
  readonly direction: CameraOrientationDirection;
  readonly label: string;
  readonly negative: ProjectedDirection;
  readonly positive: ProjectedDirection;
}

interface GizmoHead extends ProjectedDirection {
  readonly color: string;
  readonly direction: CameraOrientationDirection;
  readonly label: string;
  readonly name: string;
  readonly positive: boolean;
}

/** Props for the DOM-backed camera orientation control. */
export interface CameraOrientationGizmoProps {
  readonly onDirection: (direction: CameraOrientationDirection) => void;
}

/**
 * Interactive orientation control that follows the Three camera without
 * scheduling a second GPU render pass.
 */
export const CameraOrientationGizmo = memo(function CameraOrientationGizmo({
  onDirection,
}: CameraOrientationGizmoProps) {
  const camera = useThree((state) => state.camera);
  const quaternionRef = useRef(quaternionTuple(camera));
  const lineRefs = useRef<Array<SVGLineElement | null>>([]);
  const headRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useFrame(({ camera: frameCamera }) => {
    const nextQuaternion = quaternionTuple(frameCamera);
    const orientationChanged =
      1 - Math.abs(quaternionDot(quaternionRef.current, nextQuaternion)) >
      QUATERNION_EPSILON;
    if (!orientationChanged) return;

    quaternionRef.current = nextQuaternion;
    updateProjection(
      projectAxes(nextQuaternion),
      lineRefs.current,
      headRefs.current,
    );
  });

  const axes = projectAxes(quaternionTuple(camera));
  const heads = axisHeads(axes);

  return (
    <Html
      calculatePosition={calculateFullscreenPosition}
      fullscreen
      position={cameraAnchor(camera)}
      style={fullscreenStyle}
      zIndexRange={[0, 0]}
    >
      <div
        aria-label="3D orientation controls"
        data-testid="camera-orientation-gizmo"
        role="group"
        style={gizmoStyle}
      >
        <svg
          aria-hidden="true"
          height={GIZMO_SIZE_PX}
          style={lineLayerStyle}
          viewBox={`0 0 ${GIZMO_SIZE_PX} ${GIZMO_SIZE_PX}`}
          width={GIZMO_SIZE_PX}
        >
          {axes.map((axis, index) => (
            <line
              key={axis.label}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              stroke={axis.color}
              strokeLinecap="round"
              strokeWidth="2"
              x1={axis.negative.x}
              x2={axis.positive.x}
              y1={axis.negative.y}
              y2={axis.positive.y}
            />
          ))}
        </svg>
        {heads.map((head, index) => (
          <button
            aria-label={head.name}
            data-direction={head.direction.join(",")}
            data-positive={head.positive}
            key={head.name}
            onClick={() => onDirection(head.direction)}
            onPointerDown={(event) => event.stopPropagation()}
            ref={(element) => {
              headRefs.current[index] = element;
            }}
            style={{
              ...headStyle,
              left: head.x,
              top: head.y,
              zIndex: Math.round((head.depth + 1) * 10),
            }}
            title={head.name}
            type="button"
          >
            <span
              aria-hidden="true"
              style={{
                ...markerStyle,
                background: head.color,
                border: head.positive
                  ? "1px solid rgba(255, 255, 255, 0.65)"
                  : "none",
                height: head.positive
                  ? POSITIVE_HEAD_SIZE_PX
                  : NEGATIVE_HEAD_SIZE_PX,
                opacity: head.positive ? 1 : 0.55,
                width: head.positive
                  ? POSITIVE_HEAD_SIZE_PX
                  : NEGATIVE_HEAD_SIZE_PX,
              }}
            >
              {head.label}
            </span>
          </button>
        ))}
      </div>
    </Html>
  );
});

function axisHeads(axes: readonly ProjectedAxis[]): GizmoHead[] {
  return axes.flatMap((axis) => [
    {
      ...axis.negative,
      color: axis.color,
      direction: negateDirection(axis.direction),
      label: "",
      name: `View from negative ${axis.label} axis`,
      positive: false,
    },
    {
      ...axis.positive,
      color: axis.color,
      direction: axis.direction,
      label: axis.label,
      name: `View from positive ${axis.label} axis`,
      positive: true,
    },
  ]);
}

function updateProjection(
  axes: readonly ProjectedAxis[],
  lines: readonly (SVGLineElement | null)[],
  heads: readonly (HTMLButtonElement | null)[],
): void {
  axes.forEach((axis, index) => {
    const line = lines[index];
    if (!line) return;

    line.setAttribute("x1", axis.negative.x.toString());
    line.setAttribute("x2", axis.positive.x.toString());
    line.setAttribute("y1", axis.negative.y.toString());
    line.setAttribute("y2", axis.positive.y.toString());
  });

  axisHeads(axes).forEach((head, index) => {
    const element = heads[index];
    if (!element) return;

    element.style.left = `${head.x}px`;
    element.style.top = `${head.y}px`;
    element.style.zIndex = Math.round((head.depth + 1) * 10).toString();
  });
}

function projectAxes(cameraQuaternion: QuaternionTuple): ProjectedAxis[] {
  const inverseCamera = new THREE.Quaternion(...cameraQuaternion).invert();
  return AXES.map((axis) => {
    const direction = new THREE.Vector3(...axis.direction).applyQuaternion(
      inverseCamera,
    );
    return {
      color: axis.color,
      direction: axis.direction,
      label: axis.label,
      negative: projectDirection(direction.clone().negate()),
      positive: projectDirection(direction),
    };
  });
}

function projectDirection(direction: THREE.Vector3): ProjectedDirection {
  return {
    depth: direction.z,
    x: roundPixel(GIZMO_CENTER_PX + direction.x * GIZMO_RADIUS_PX),
    y: roundPixel(GIZMO_CENTER_PX - direction.y * GIZMO_RADIUS_PX),
  };
}

function negateDirection(
  direction: CameraOrientationDirection,
): CameraOrientationDirection {
  return direction.map((value) => (value === 0 ? 0 : -value)) as [
    number,
    number,
    number,
  ];
}

function roundPixel(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function cameraAnchor(camera: CameraTransform): PositionTuple {
  const quaternion = quaternionTuple(camera);
  const anchor = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(new THREE.Quaternion(...quaternion))
    .add(new THREE.Vector3(...positionTuple(camera)));
  return [anchor.x, anchor.y, anchor.z];
}

function positionTuple(camera: CameraTransform): PositionTuple {
  return [camera.position.x, camera.position.y, camera.position.z];
}

function quaternionTuple(camera: CameraTransform): QuaternionTuple {
  return [
    camera.quaternion.x,
    camera.quaternion.y,
    camera.quaternion.z,
    camera.quaternion.w,
  ];
}

function quaternionDot(left: QuaternionTuple, right: QuaternionTuple): number {
  return (
    left[0] * right[0] +
    left[1] * right[1] +
    left[2] * right[2] +
    left[3] * right[3]
  );
}

function calculateFullscreenPosition(
  _object: unknown,
  _camera: unknown,
  size: { readonly height: number; readonly width: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

const fullscreenStyle: CSSProperties = {
  pointerEvents: "none",
};

const gizmoStyle: CSSProperties = {
  height: GIZMO_SIZE_PX,
  left: 0,
  pointerEvents: "auto",
  position: "absolute",
  top: 0,
  width: GIZMO_SIZE_PX,
};

const lineLayerStyle: CSSProperties = {
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
};

const headStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  display: "flex",
  height: POSITIVE_HEAD_SIZE_PX,
  justifyContent: "center",
  padding: 0,
  position: "absolute",
  transform: "translate(-50%, -50%)",
  width: POSITIVE_HEAD_SIZE_PX,
};

const markerStyle: CSSProperties = {
  alignItems: "center",
  borderRadius: "50%",
  color: "#f8fafc",
  display: "flex",
  fontSize: 10,
  fontWeight: 700,
  justifyContent: "center",
  textShadow: "0 1px 2px rgba(0, 0, 0, 0.75)",
};
