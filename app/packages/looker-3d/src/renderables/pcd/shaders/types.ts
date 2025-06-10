import { ColorscaleInput } from "@fiftyone/looker/src/state";
import * as THREE from "three";
export type Gradients = [number, string][];

export type ShaderProps = {
  colorMap: Readonly<ColorscaleInput["list"]>;
  min: number;
  max: number;
  pointSize: number;
  isPointSizeAttenuated: boolean;
  opacity?: number;
  upVector?: THREE.Vector3;
  pcdType?: "intensity" | "rgb";
};
