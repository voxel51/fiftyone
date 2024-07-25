import React from "react";
import * as THREE from "three";
import { OverlayProps } from "./shared";
import { useRecoilValue } from "recoil";
import { polylineLabelLineWidthAtom } from "../state";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { extend } from "@react-three/fiber";

extend({ Line2, LineMaterial, LineGeometry });

interface LineProps extends OverlayProps {
  points: THREE.Vector3Tuple[];
}

export const Line = ({
  rotation,
  points,
  color,
  opacity,
  onClick,
  tooltip,
  label,
}: LineProps) => {
  const lineWidth = useRecoilValue(polylineLabelLineWidthAtom);
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p))
    );
    g.rotateX(rotation[0]);
    g.rotateY(rotation[1]);
    g.rotateZ(rotation[2]);
    return g;
  }, [points, rotation]);

  const tooltipProps = React.useMemo(() => {
    return tooltip.getMeshProps(label);
  }, [tooltip, label]);

  const geometry = React.useMemo(() => {
    return new LineGeometry().fromLine(new THREE.Line(geo));
  }, [geo]);

  const material = React.useMemo(() => {
    return new LineMaterial({
      color: color,
      linewidth: lineWidth,
      opacity: opacity,
    });
  }, [color, lineWidth, opacity]);

  return (
    <mesh onClick={onClick} rotation={rotation} {...tooltipProps}>
      <line2 geometry={geometry} material={material} />
    </mesh>
  );
};
