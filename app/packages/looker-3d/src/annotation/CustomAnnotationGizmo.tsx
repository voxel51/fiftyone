/**
 * Modification of Drei's GizmoHelper component
 * to support <View /> components.
 *
 * Problem with Drei's default GizmoHelper is that it doesn't support <View /> components
 * because it uses <Hud /> which doesn't work with gl.Scissors
 *
 * This component is a custom implementation of the GizmoHelper component
 * that supports <View /> components.
 *
 * It uses a custom canvas to render the gizmo and syncs with the main camera.
 *
 */
import {
  CameraControls as CameraControlsType,
  OrthographicCamera,
} from "@react-three/drei";
import {
  Canvas,
  ThreeElements,
  ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import * as React from "react";
import { useCallback, useState } from "react";
import styled from "styled-components";
import * as THREE from "three";
import {
  CanvasTexture,
  Group,
  Matrix4,
  Object3D,
  OrthographicCamera as OrthographicCameraImpl,
  Quaternion,
  Vector3,
} from "three";
import { OrbitControls as OrbitControlsType } from "three-stdlib";
const GizmoOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
`;

const GizmoCanvas = styled.div`
  margin-top: 8px;
  margin-left: 10px;
  width: 130px;
  aspect-ratio: 1/1;
  height: auto;
  pointer-events: auto;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
`;

type GizmoHelperContext = {
  tweenCamera: (direction: Vector3) => void;
};

const Context = /* @__PURE__ */ React.createContext<GizmoHelperContext>(
  {} as GizmoHelperContext
);

const useGizmoContext = () => {
  return React.useContext<GizmoHelperContext>(Context);
};

const turnRate = 2 * Math.PI; // turn rate in angles per second
const dummy = /* @__PURE__ */ new Object3D();
const matrix = /* @__PURE__ */ new Matrix4();
const [q1, q2] = [
  /* @__PURE__ */ new Quaternion(),
  /* @__PURE__ */ new Quaternion(),
];
const targetPosition = /* @__PURE__ */ new Vector3();

type ControlsProto = { update(delta?: number): void; target: Vector3 };

type GizmoHelperProps = ThreeElements["group"] & {
  margin?: [number, number];
  renderPriority?: number;
  autoClear?: boolean;
  onUpdate?: () => void; // update controls during animation
  // TODO: in a new major state.controls should be the only means of consuming controls, the
  // onTarget prop can then be removed!
  onTarget?: () => Vector3; // return the target to rotate around
};

const isOrbitControls = (
  controls: ControlsProto
): controls is OrbitControlsType => {
  return "minPolarAngle" in (controls as OrbitControlsType);
};

const isCameraControls = (
  controls: CameraControlsType | ControlsProto
): controls is CameraControlsType => {
  return "getTarget" in (controls as CameraControlsType);
};

const AnnotationGizmoHelper = ({
  margin = [80, 80],
  renderPriority = 1,
  onUpdate,
  onTarget,
  children,
  externalCameraState,
  onCameraTween,
}: GizmoHelperProps & {
  externalCameraState?: {
    position: Vector3;
    quaternion: Quaternion;
    target: Vector3;
  };
  onCameraTween?: (direction: Vector3) => void;
}): any => {
  const size = useThree((state) => state.size);
  const mainCamera = useThree((state) => state.camera);
  const defaultControls = useThree(
    (state) => state.controls
  ) as unknown as ControlsProto | null;
  const invalidate = useThree((state) => state.invalidate);
  const gizmoRef = React.useRef<Group>(null!);
  const virtualCam = React.useRef<OrthographicCameraImpl>(null!);

  const animating = React.useRef(false);
  const radius = React.useRef(0);
  const focusPoint = React.useRef(new Vector3(0, 0, 0));
  const defaultUp = React.useRef(new Vector3(0, 0, 0));

  // Use external camera state if provided, otherwise use local camera
  const cameraState = externalCameraState || {
    position: mainCamera.position,
    quaternion: mainCamera.quaternion,
    target: onTarget?.() || new Vector3(0, 0, 0),
  };

  React.useEffect(() => {
    if (externalCameraState) {
      defaultUp.current.set(0, 1, 0);
      dummy.up.set(0, 1, 0);
    } else {
      defaultUp.current.copy(mainCamera.up);
      dummy.up.copy(mainCamera.up);
    }
  }, [mainCamera, externalCameraState]);

  const tweenCamera = React.useCallback(
    (direction: Vector3) => {
      if (onCameraTween) {
        // Use external camera tween function
        onCameraTween(direction);
        return;
      }

      // Original tween logic for local camera
      animating.current = true;
      if (defaultControls || onTarget) {
        focusPoint.current =
          onTarget?.() ||
          (isCameraControls(defaultControls)
            ? defaultControls.getTarget(focusPoint.current)
            : defaultControls?.target || new Vector3(0, 0, 0));
      }
      radius.current = cameraState.position.distanceTo(cameraState.target);

      // Rotate from current camera orientation
      q1.copy(cameraState.quaternion);

      // To new current camera orientation
      targetPosition
        .copy(direction)
        .multiplyScalar(radius.current)
        .add(cameraState.target);

      dummy.lookAt(targetPosition);

      q2.copy(dummy.quaternion);

      invalidate();
    },
    [defaultControls, cameraState, onTarget, invalidate, onCameraTween]
  );

  useFrame((_, delta) => {
    if (virtualCam.current && gizmoRef.current) {
      // Animate step
      if (animating.current && !onCameraTween) {
        if (q1.angleTo(q2) < 0.01) {
          animating.current = false;
          // Orbit controls uses UP vector as the orbit axes,
          // so we need to reset it after the animation is done
          // moving it around for the controls to work correctly
          if (isOrbitControls(defaultControls)) {
            mainCamera.up.copy(defaultUp.current);
          }
        } else {
          const step = delta * turnRate;
          // animate position by doing a slerp and then scaling the position on the unit sphere
          q1.rotateTowards(q2, step);
          // animate orientation
          mainCamera.position
            .set(0, 0, 1)
            .applyQuaternion(q1)
            .multiplyScalar(radius.current)
            .add(focusPoint.current);
          mainCamera.up.set(0, 1, 0).applyQuaternion(q1).normalize();
          mainCamera.quaternion.copy(q1);

          if (isCameraControls(defaultControls))
            defaultControls.setPosition(
              mainCamera.position.x,
              mainCamera.position.y,
              mainCamera.position.z
            );

          if (onUpdate) onUpdate();
          else if (defaultControls) defaultControls.update(delta);
          invalidate();
        }
      }

      // Sync Gizmo with camera orientation
      if (externalCameraState) {
        // Use external camera state
        matrix.makeRotationFromQuaternion(cameraState.quaternion).invert();
        gizmoRef.current?.quaternion.setFromRotationMatrix(matrix);
      } else {
        // Use local camera
        matrix.copy(mainCamera.matrix).invert();
        gizmoRef.current?.quaternion.setFromRotationMatrix(matrix);
      }
    }
  });

  const gizmoHelperContext = React.useMemo(
    () => ({ tweenCamera }),
    [tweenCamera]
  );

  // Position gizmo component within scene (hardcoded for top-left alignment)
  const [marginX, marginY] = margin;
  const x = -size.width / 2 + marginX;
  const y = size.height / 2 - marginY;

  // For external camera state, adjust positioning to be more centered
  const adjustedX = externalCameraState ? x * 0.5 : x;
  const adjustedY = externalCameraState ? y * 0.5 : y;

  return (
    <Context.Provider value={gizmoHelperContext}>
      <OrthographicCamera makeDefault ref={virtualCam} position={[0, 0, 200]} />
      <group ref={gizmoRef} position={[adjustedX, adjustedY, 0]}>
        {children}
      </group>
    </Context.Provider>
  );
};

type AxisProps = {
  color: string;
  rotation: [number, number, number];
  scale?: [number, number, number];
};

type AxisHeadProps = Omit<ThreeElements["sprite"], "ref"> & {
  arcStyle: string;
  label?: string;
  labelColor: string;
  axisHeadScale?: number;
  disabled?: boolean;
  font: string;
  onClick?: (e: ThreeEvent<MouseEvent>) => null;
};

type GizmoViewportProps = ThreeElements["group"] & {
  axisColors?: [string, string, string];
  axisScale?: [number, number, number];
  labels?: [string, string, string];
  axisHeadScale?: number;
  labelColor?: string;
  hideNegativeAxes?: boolean;
  hideAxisHeads?: boolean;
  disabled?: boolean;
  font?: string;
  onClick?: (e: ThreeEvent<MouseEvent>) => null;
};

function Axis({ scale = [0.8, 0.05, 0.05], color, rotation }: AxisProps) {
  return (
    <group rotation={rotation}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={scale} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function AxisHead({
  onClick,
  font,
  disabled,
  arcStyle,
  label,
  labelColor,
  axisHeadScale = 1,
  ...props
}: AxisHeadProps) {
  const gl = useThree((state) => state.gl);
  const texture = React.useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;

    const context = canvas.getContext("2d")!;
    context.beginPath();
    context.arc(32, 32, 16, 0, 2 * Math.PI);
    context.closePath();
    context.fillStyle = arcStyle;
    context.fill();

    if (label) {
      context.font = font;
      context.textAlign = "center";
      context.fillStyle = labelColor;
      context.fillText(label, 32, 41);
    }
    return new CanvasTexture(canvas);
  }, [arcStyle, label, labelColor, font]);

  const [active, setActive] = React.useState(false);
  const scale = (label ? 1 : 0.75) * (active ? 1.2 : 1) * axisHeadScale;
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setActive(true);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setActive(false);
  };
  return (
    <sprite
      scale={scale}
      onPointerOver={!disabled ? handlePointerOver : undefined}
      onPointerOut={!disabled ? handlePointerOut : undefined}
      {...props}
    >
      <spriteMaterial
        map={texture}
        map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
        alphaTest={0.3}
        opacity={label ? 1 : 0.75}
        toneMapped={false}
      />
    </sprite>
  );
}

const AnnotationGizmoViewport = ({
  hideNegativeAxes,
  hideAxisHeads,
  disabled,
  font = "18px Inter var, Arial, sans-serif",
  axisColors = ["#ff2060", "#20df80", "#2080ff"],
  axisHeadScale = 1,
  axisScale,
  labels = ["X", "Y", "Z"],
  labelColor = "#000",
  onClick,
  ...props
}: GizmoViewportProps) => {
  const [colorX, colorY, colorZ] = axisColors;
  const { tweenCamera } = useGizmoContext();
  const axisHeadProps = {
    font,
    disabled,
    labelColor,
    onClick,
    axisHeadScale,
    onPointerDown: !disabled
      ? (e: ThreeEvent<PointerEvent>) => {
          tweenCamera(e.object.position);
          e.stopPropagation();
        }
      : undefined,
  };

  return (
    <group scale={40} {...props}>
      <Axis color={colorX} rotation={[0, 0, 0]} scale={axisScale} />
      <Axis color={colorY} rotation={[0, 0, Math.PI / 2]} scale={axisScale} />
      <Axis color={colorZ} rotation={[0, -Math.PI / 2, 0]} scale={axisScale} />
      {!hideAxisHeads && (
        <>
          <AxisHead
            arcStyle={colorX}
            position={[1, 0, 0]}
            label={labels[0]}
            {...axisHeadProps}
          />
          <AxisHead
            arcStyle={colorY}
            position={[0, 1, 0]}
            label={labels[1]}
            {...axisHeadProps}
          />
          <AxisHead
            arcStyle={colorZ}
            position={[0, 0, 1]}
            label={labels[2]}
            {...axisHeadProps}
          />
          {!hideNegativeAxes && (
            <>
              <AxisHead
                arcStyle={colorX}
                position={[-1, 0, 0]}
                {...axisHeadProps}
              />
              <AxisHead
                arcStyle={colorY}
                position={[0, -1, 0]}
                {...axisHeadProps}
              />
              <AxisHead
                arcStyle={colorZ}
                position={[0, 0, -1]}
                {...axisHeadProps}
              />
            </>
          )}
        </>
      )}
    </group>
  );
};

// Custom Gizmo component that renders in its own canvas but syncs with main camera
const CustomGizmo = ({
  mainCamera,
  cameraControlsRef,
}: {
  mainCamera: React.RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControlsImpl>;
}) => {
  const [mainCameraState, setMainCameraState] = useState<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>(null);

  // Sync with main camera and controls using useEffect with proper cleanup
  React.useEffect(() => {
    if (!mainCamera.current || !cameraControlsRef.current) return;

    let animationId: number;

    const updateCameraState = () => {
      if (mainCamera.current && cameraControlsRef.current) {
        const target = new THREE.Vector3();
        cameraControlsRef.current.getTarget(target);

        setMainCameraState({
          position: mainCamera.current.position.clone(),
          quaternion: mainCamera.current.quaternion.clone(),
          target: target,
        });
      }

      animationId = requestAnimationFrame(updateCameraState);
    };

    updateCameraState();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [mainCamera, cameraControlsRef]);

  // Handle camera tweening when gizmo is clicked
  const handleCameraTween = useCallback(
    (direction: THREE.Vector3) => {
      if (!mainCamera.current || !cameraControlsRef.current || !mainCameraState)
        return;

      const target = mainCameraState.target.clone();
      const position = mainCameraState.position.clone();
      const radius = position.distanceTo(target);

      // Calculate new position based on direction
      const newPosition = direction.clone().multiplyScalar(radius).add(target);

      // Set the new camera position
      cameraControlsRef.current.setPosition(
        newPosition.x,
        newPosition.y,
        newPosition.z,
        true // animate
      );
    },
    [mainCamera, cameraControlsRef, mainCameraState]
  );

  return (
    <GizmoCanvas>
      <Canvas style={{ width: "100%", height: "100%" }}>
        <AnnotationGizmoHelper
          externalCameraState={mainCameraState || undefined}
          onCameraTween={handleCameraTween}
        >
          <AnnotationGizmoViewport />
        </AnnotationGizmoHelper>
      </Canvas>
    </GizmoCanvas>
  );
};

export const AnnotationMultiViewGizmoOverlayWrapper = ({
  mainCamera,
  cameraControlsRef,
}: {
  mainCamera: React.RefObject<THREE.PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControlsImpl>;
}) => {
  return (
    <GizmoOverlay>
      <CustomGizmo
        mainCamera={mainCamera}
        cameraControlsRef={cameraControlsRef}
      />
    </GizmoOverlay>
  );
};
