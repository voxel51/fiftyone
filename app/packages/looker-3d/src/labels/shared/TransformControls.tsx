import * as fos from "@fiftyone/state";
import { TransformControls } from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import {
  currentArchetypeSelectedForTransformAtom,
  isCurrentlyTransformingAtom,
  transformModeAtom,
} from "../../state";
import type { Archetype3d, TransformProps } from "../../types";

type TransformableProps = {
  archetype: Archetype3d;
  explicitObjectRef?: React.RefObject<any>;
  transformControlsPosition?: THREE.Vector3Tuple;
  transformControlsQuaternion?: THREE.Vector4Tuple;
  children: React.ReactNode;
} & Pick<
  TransformProps,
  | "isSelectedForTransform"
  | "onTransformStart"
  | "onTransformEnd"
  | "onTransformChange"
  | "transformControlsRef"
  | "translationSnap"
  | "rotationSnap"
  | "scaleSnap"
  | "showX"
  | "showY"
  | "showZ"
>;

/**
 * Shared component for rendering transform controls.
 */
export const Transformable = ({
  archetype,
  children,
  explicitObjectRef,
  isSelectedForTransform,
  onTransformStart,
  onTransformEnd,
  onTransformChange,
  transformControlsRef,
  transformControlsPosition = [0, 0, 0],
  transformControlsQuaternion = [0, 0, 0, 1],
  ...transformControlsProps
}: TransformableProps) => {
  const groupRef = useRef<any>(null);

  const modalMode = useAtomValue(fos.modalMode);
  const transformMode = useRecoilValue(transformModeAtom);
  const currentArchetypeSelectedForTransform = useRecoilValue(
    currentArchetypeSelectedForTransformAtom
  );
  const [isCurrentlyTransforming, setIsCurrentlyTransforming] = useRecoilState(
    isCurrentlyTransformingAtom
  );
  const isAnnotateMode = modalMode === "annotate";

  const onTransformStartDecorated = useCallback(() => {
    setIsCurrentlyTransforming(true);
    onTransformStart?.();
  }, [onTransformStart, archetype]);

  const onTransformEndDecorated = useCallback(() => {
    setIsCurrentlyTransforming(false);
    onTransformEnd?.();
  }, [onTransformEnd, archetype]);

  const onObjectChangeDecorated = useCallback(() => {
    onTransformChange?.();
  }, [onTransformChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCurrentlyTransforming) {
        setIsCurrentlyTransforming(false);
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [archetype, isCurrentlyTransforming]);

  return (
    <>
      {explicitObjectRef ? children : <group ref={groupRef}>{children}</group>}

      {isAnnotateMode &&
        isSelectedForTransform &&
        currentArchetypeSelectedForTransform === archetype && (
          <group position={new THREE.Vector3(...transformControlsPosition)}>
            <TransformControls
              ref={transformControlsRef}
              rotationSnap={0.01}
              scaleSnap={0.01}
              object={explicitObjectRef?.current || groupRef.current}
              mode={transformMode}
              space={
                transformMode === "scale" || transformMode === "rotate"
                  ? "local"
                  : "world"
              }
              onMouseDown={onTransformStartDecorated}
              onMouseUp={onTransformEndDecorated}
              onObjectChange={onObjectChangeDecorated}
              {...transformControlsProps}
            />
          </group>
        )}
    </>
  );
};
