/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import Lottie from "lottie-react";
import gpuErrorAnimation from "./assets/gpu-error.json";

export default function GpuErrorAnimation() {
  return (
    <Lottie
      animationData={gpuErrorAnimation}
      loop
      style={{ width: 220, height: 220 }}
    />
  );
}
