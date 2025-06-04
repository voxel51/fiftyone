import * as THREE from "three";
export type Gradients = [number, string][];

export type ShaderProps = {
  gradients: Gradients;
  min: number;
  max: number;
  pointSize: number;
  isPointSizeAttenuated: boolean;
  opacity?: number;
  upVector?: THREE.Vector3;
  pcdType?: "intensity" | "rgb";
};
