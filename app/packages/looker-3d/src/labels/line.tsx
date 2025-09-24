import { extend, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import type { OverlayProps } from "./shared";

extend({ Line2, LineMaterial, LineGeometry });

interface LineProps extends Omit<OverlayProps, "tooltip" | "onClick"> {
  points: THREE.Vector3Tuple[];
  width?: number;
}

export const Line = ({
  rotation,
  points,
  color,
  opacity = 1,
  width = 1,
}: LineProps) => {
  const { size } = useThree();

  const geometry = useMemo(() => {
    const g = new LineGeometry();
    const flat = points.flat();
    g.setPositions(flat);
    return g;
  }, [points]);

  const material = useMemo(() => {
    return new LineMaterial({
      color,
      linewidth: width,
      opacity,
      transparent: opacity < 1,
    });
  }, [color, width, opacity]);

  // keep resolution in sync with canvas size
  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [material, size]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <line2 geometry={geometry} material={material} rotation={rotation} />;
};
