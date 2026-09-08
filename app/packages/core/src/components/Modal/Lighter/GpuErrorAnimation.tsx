/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
// Explicit ?url import — .lottie isn't one of Vite's built-in recognized
// asset extensions, so this forces URL-asset handling without a
// vite.config.ts change (see Vite's "Explicit URL Imports").
import gpuErrorAnimationUrl from "./assets/gpu-error.lottie?url";

export default function GpuErrorAnimation() {
  return (
    <DotLottieReact
      src={gpuErrorAnimationUrl}
      loop
      autoplay
      style={{ width: 220, height: 220 }}
    />
  );
}
