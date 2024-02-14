import { useBounds } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { useCallback } from "react";

export const SelectToZoom = ({ children }: { children: React.ReactNode }) => {
  const api = useBounds();

  const clickHandler = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta <= 2) {
        api.refresh(e.object).clip().fit();
      }
    },
    [api]
  );

  const pointerMissedHandler = useCallback(
    (e: MouseEvent) => {
      if (e.button === 0) {
        api.refresh().clip().fit();
      }
    },
    [api]
  );

  return (
    <group onClick={clickHandler} onPointerMissed={pointerMissedHandler}>
      {children}
    </group>
  );
};
