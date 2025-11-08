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
  transformSpaceAtom,
} from "../../state";
import type { TransformArchetype, TransformProps } from "../../types";

type TransformableProps = {
  archetype: TransformArchetype;
  explicitObjectRef?: React.RefObject<any>;
  transformControlsPosition?: THREE.Vector3Tuple;
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
  ...transformControlsProps
}: TransformableProps) => {
  const groupRef = useRef<any>(null);

  const modalMode = useAtomValue(fos.modalMode);
  const transformMode = useRecoilValue(transformModeAtom);
  const transformSpace = useRecoilValue(transformSpaceAtom);
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
              object={explicitObjectRef?.current || groupRef.current}
              mode={transformMode}
              space={transformSpace}
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
